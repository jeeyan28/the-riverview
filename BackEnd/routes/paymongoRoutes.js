const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const BookingLock = require("../model/bookingLock");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { validateAndPriceBooking, computeDownPayment, finalizeBookingFromPayment } = require("../utils/bookingHelper");
const {
  getPublicKey,
  PAYMONGO_ALLOWED_METHODS,
  createPaymentIntent,
  retrievePaymentIntent,
  createWalletPaymentMethod,
  attachPaymentIntent,
  verifyWebhookSignature,
} = require("../utils/paymongo");
const { isAdminRole } = require("../utils/permissions");

function getReturnBaseUrl() {
  return (
    process.env.PAYMONGO_RETURN_BASE_URL ||
    (process.env.APP_BASE_URL || "").split(",")[0]?.trim() ||
    "http://localhost:5501"
  );
}

function isPaidPaymentIntent(intentAttrs) {
  if (!intentAttrs) return false;
  if (intentAttrs.status === "succeeded") return true;
  return Array.isArray(intentAttrs.payments) && intentAttrs.payments.some(p => p?.attributes?.status === "paid");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function resolveGuestEmail({ guestEmail, guestContact, accountEmail }) {
  if (guestEmail && EMAIL_RE.test(guestEmail)) return guestEmail;
  if (guestContact && EMAIL_RE.test(guestContact)) return guestContact;
  return accountEmail || "";
}

function toBookingMetadata(fields) {
  const out = {};
  Object.entries(fields).forEach(([k, v]) => {
    out[k] = v === undefined || v === null ? "" : String(v);
  });
  return out;
}

router.get("/config", (req, res) => {
  try {
    res.json({ publicKey: getPublicKey(), paymentMethods: PAYMONGO_ALLOWED_METHODS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/intent", ensureAuthenticated, async (req, res) => {
  try {
    const { guestName, guestContact, guestEmail, guestCount: guestCountRaw, specialRequests, roomId, variantLabel, date, timeIn, duration: durationRaw, downPaymentHours: downPaymentHoursRaw } = req.body;
    const duration = Number(durationRaw);
    const guestCount = guestCountRaw !== undefined && guestCountRaw !== "" ? Number(guestCountRaw) : 1;

    if (!guestName) {
      return res.status(400).json({ message: "guestName, roomId, date, timeIn and duration are required." });
    }

    const downPaymentHours = downPaymentHoursRaw !== undefined && downPaymentHoursRaw !== "" ? Number(downPaymentHoursRaw) : 1;
    if (!Number.isInteger(downPaymentHours) || downPaymentHours < 1 || downPaymentHours > duration) {
      return res.status(400).json({ message: `Downpayment hours must be a whole number between 1 and ${duration}.` });
    }

    const activeLock = await BookingLock.findOne({
      room: roomId,
      variantLabel: variantLabel || null,
      date,
      timeIn,
      duration,
      lockedBy: req.user._id,
      expiresAt: { $gt: new Date() },
    });
    if (!activeLock) {
      return res.status(409).json({ message: "Your hold on this time slot has expired. Please select a time again." });
    }

    let room, amount, unitPrice;
    try {
      ({ room, amount, unitPrice } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking: false, guestCount, excludeLockUserId: req.user._id }));
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    const downPayment = computeDownPayment(unitPrice, downPaymentHours);

    let intent;
    try {
      intent = await createPaymentIntent({
        amountPesos: downPayment,
        description: `Down payment — ${room.name} (${date} ${timeIn})`,
        statementDescriptor: room.name,
        metadata: toBookingMetadata({
          guestName: guestName.trim(),
          guestContact: (guestContact || "").trim(),
          guestEmail: resolveGuestEmail({ guestEmail, guestContact, accountEmail: req.user.email }),
          guestCount,
          specialRequests: (specialRequests || "").trim(),
          roomId: room._id,
          variantLabel: variantLabel || "",
          date,
          timeIn,
          duration,
          amount,
          downPayment,
          downPaymentHours,
          bookedBy: req.session.userId,
        }),
      });
    } catch (paymongoErr) {
      console.error("PayMongo payment intent creation failed:", paymongoErr);
      return res.status(502).json({ message: paymongoErr.message || "Could not start online payment. Please try again." });
    }

    res.status(201).json({
      paymentIntentId: intent.data.id,
      clientKey: intent.data.attributes.client_key,
      amount: downPayment,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/intent/:paymentIntentId/attach", ensureAuthenticated, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const { paymentMethodId, paymentMethodType } = req.body;

    const existingBooking = await Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
    if (existingBooking) {
      if (String(existingBooking.bookedBy) !== String(req.user._id)) {
        return res.status(403).json({ message: "Not allowed." });
      }
      return res.json({ status: "succeeded", bookingId: existingBooking._id, reservationCode: existingBooking.reservationCode });
    }

    let intent;
    try {
      intent = await retrievePaymentIntent(paymentIntentId);
    } catch (e) {
      return res.status(e.status || 502).json({ message: e.message || "Could not find this payment. Please try again." });
    }
    const metadata = intent?.data?.attributes?.metadata || {};
    if (String(metadata.bookedBy) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed." });
    }
    if (!paymentMethodId && !paymentMethodType) {
      return res.status(400).json({ message: "paymentMethodId or paymentMethodType is required." });
    }

    let methodId = paymentMethodId;
    if (!methodId) {
      let walletMethod;
      try {
        walletMethod = await createWalletPaymentMethod({
          type: paymentMethodType,
          billing: { name: metadata.guestName, email: metadata.guestEmail || req.user.email },
        });
      } catch (e) {
        return res.status(e.status || 502).json({ message: e.message || "Could not start that payment method. Please try again." });
      }
      methodId = walletMethod.data.id;
    }

    const base = getReturnBaseUrl();
    let attachResult;
    try {
      attachResult = await attachPaymentIntent({
        paymentIntentId,
        paymentMethodId: methodId,
        clientKey: intent.data.attributes.client_key,
        returnUrl: `${base}/index.html?paymongo=success&paymentIntentId=${paymentIntentId}`,
      });
    } catch (e) {
      return res.status(e.status || 502).json({ message: e.message || "Payment could not be processed. Please try again." });
    }

    const attrs = attachResult.data.attributes;

    if (isPaidPaymentIntent(attrs)) {
      const paidPayment = attrs.payments?.find(p => p?.attributes?.status === "paid");
      try {
        const booking = await finalizeBookingFromPayment({
          paymentIntentId,
          metadata: attrs.metadata || metadata,
          paidPaymentId: paidPayment?.id || "",
        });
        return res.json({ status: "succeeded", bookingId: booking._id, reservationCode: booking.reservationCode });
      } catch (e) {
        if (e.slotUnavailable) {
          console.error(`PayMongo payment ${paymentIntentId} succeeded but the slot is no longer available — needs manual review/refund.`);
          return res.status(409).json({ status: "paid_slot_unavailable", message: e.message });
        }
        throw e;
      }
    }

    if (attrs.status === "awaiting_next_action" && attrs.next_action?.redirect?.url) {
      return res.json({ status: "awaiting_next_action", redirectUrl: attrs.next_action.redirect.url });
    }

    if (attrs.status === "processing") {
      return res.json({ status: "processing" });
    }

    return res.status(402).json({ status: "failed", message: "That payment method was declined. Please try another." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/status/:paymentIntentId", ensureAuthenticated, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;

    const booking = await Booking.findOne({ paymongoPaymentIntentId: paymentIntentId });
    if (booking) {
      if (String(booking.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) {
        return res.status(403).json({ message: "Not allowed." });
      }
      return res.json({ status: booking.status, paymentStatus: booking.paymentStatus, bookingId: booking._id, reservationCode: booking.reservationCode });
    }

    let intent;
    try {
      intent = await retrievePaymentIntent(paymentIntentId);
    } catch (e) {
      return res.status(e.status || 502).json({ message: e.message || "Could not check payment status." });
    }
    const attrs = intent?.data?.attributes;
    const metadata = attrs?.metadata || {};
    if (String(metadata.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Not allowed." });
    }

    if (!isPaidPaymentIntent(attrs)) {
      return res.json({ status: "Awaiting Online Payment", paymentStatus: "Unpaid" });
    }

    try {
      const paidPayment = attrs.payments?.find(p => p?.attributes?.status === "paid");
      const created = await finalizeBookingFromPayment({ paymentIntentId, metadata, paidPaymentId: paidPayment?.id || "" });
      return res.json({ status: created.status, paymentStatus: created.paymentStatus, bookingId: created._id, reservationCode: created.reservationCode });
    } catch (e) {
      if (e.slotUnavailable) {
        return res.status(409).json({ status: "paid_slot_unavailable", paymentStatus: "Paid", message: e.message });
      }
      throw e;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

async function webhookHandler(req, res) {
  let event;
  try {
    verifyWebhookSignature(req.body.toString("utf8"), req.headers["paymongo-signature"]);
    event = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    console.error("PayMongo webhook signature check failed:", err.message);
    return res.status(400).json({ message: "Invalid signature." });
  }

  res.status(200).json({ received: true });

  try {
    const eventType = event?.data?.attributes?.type;
    const resource = event?.data?.attributes?.data;

    if (eventType === "payment_intent.succeeded" || eventType === "payment.paid") {
      const paymentIntentId = eventType === "payment_intent.succeeded"
        ? resource?.id
        : resource?.attributes?.payment_intent_id;
      if (!paymentIntentId) return;

      const intent = await retrievePaymentIntent(paymentIntentId);
      const attrs = intent?.data?.attributes;
      if (!isPaidPaymentIntent(attrs)) return;

      const paidPayment = attrs.payments?.find(p => p?.attributes?.status === "paid");
      await finalizeBookingFromPayment({
        paymentIntentId,
        metadata: attrs.metadata || {},
        paidPaymentId: paidPayment?.id || (eventType === "payment.paid" ? resource?.id : ""),
      }).catch((e) => {
        if (e.slotUnavailable) {
          console.error(`PayMongo webhook: payment ${paymentIntentId} succeeded but the slot is no longer available — needs manual review/refund.`);
          return;
        }
        throw e;
      });
    }
  } catch (err) {
    console.error("Error processing PayMongo webhook:", err);
  }
}

module.exports = { router, webhookHandler };