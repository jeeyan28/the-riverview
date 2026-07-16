const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { validateAndPriceBooking, computeDownPayment, finalizeBookingFromPayment } = require("../utils/bookingHelper");
const {
  getPublicKey,
  createPaymentIntent,
  retrievePaymentIntent,
  createWalletPaymentMethod,
  attachPaymentIntent,
  verifyWebhookSignature,
} = require("../utils/paymongo");
const { isAdminRole } = require("../utils/permissions");

// Where PayMongo sends the popup back to once a 3D Secure challenge or an
// e-wallet authorization page is done. Falls back to the first configured
// frontend origin (see server.js's CORS allowedOrigins) if
// PAYMONGO_RETURN_BASE_URL isn't set separately. The literal fallback below
// must match Frontend/vite.config.js's dev server port (currently 5501).
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

// PayMongo requires billing.email for GCash/Maya/QRPh Payment Methods, but
// the booking form only collects a single "Phone Number or Email" field
// (guestContact) — it's frequently a phone number, not an email. Falls back
// to the logged-in account's own email (always present — User.email is a
// required, unique schema field) so wallet payments never lack one.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function resolveGuestEmail({ guestEmail, guestContact, accountEmail }) {
  if (guestEmail && EMAIL_RE.test(guestEmail)) return guestEmail;
  if (guestContact && EMAIL_RE.test(guestContact)) return guestContact;
  return accountEmail || "";
}

// PayMongo metadata values must be strings. Carries everything
// finalizeBookingFromPayment() needs to create the Booking later, once
// payment has actually succeeded — nothing is written to Mongo at intent
// creation time.
function toBookingMetadata(fields) {
  const out = {};
  Object.entries(fields).forEach(([k, v]) => {
    out[k] = v === undefined || v === null ? "" : String(v);
  });
  return out;
}

// ── Publishable key for the frontend's client-side card tokenization.
//    Not secret — safe to serve unauthenticated, same as any pk_ key.
router.get("/config", (req, res) => {
  try {
    res.json({ publicKey: getPublicKey() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Create a PayMongo Payment Intent for the prospective booking's down
//    payment — logged-in customers only. Same validation/pricing as
//    POST /api/bookings, but no Booking is created here: the room/date/time
//    slot must NOT be held (and no Reservation Code generated) until payment
//    actually succeeds. Everything needed to create the Booking afterward
//    travels as the intent's own metadata instead (see toBookingMetadata()
//    above and finalizeBookingFromPayment() in utils/bookingHelper.js),
//    consumed by POST /intent/:paymentIntentId/attach, GET /status/:id, or
//    the webhook — whichever confirms payment first.
router.post("/intent", ensureAuthenticated, async (req, res) => {
  try {
    const { guestName, guestContact, guestEmail, guestCount: guestCountRaw, specialRequests, roomId, variantLabel, date, timeIn, duration: durationRaw } = req.body;
    const duration = Number(durationRaw);
    const guestCount = guestCountRaw !== undefined && guestCountRaw !== "" ? Number(guestCountRaw) : 1;

    if (!guestName) {
      return res.status(400).json({ message: "guestName, roomId, date, timeIn and duration are required." });
    }

    let room, amount, unitPrice;
    try {
      ({ room, amount, unitPrice } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking: false, guestCount }));
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    // Down payment = the first hour's rate, not a percentage of the total —
    // see computeDownPayment() in utils/bookingHelper.js for the single
    // source of truth this mirrors.
    const downPayment = computeDownPayment(unitPrice);

    let intent;
    try {
      intent = await createPaymentIntent({
        amountPesos: downPayment,
        description: `Down payment — ${room.roomNumber || room.name} (${date} ${timeIn})`,
        statementDescriptor: room.roomNumber || room.name,
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

// ── Attach a Payment Method to the Payment Intent created by POST /intent.
//    Card: `paymentMethodId` — already tokenized client-side by the browser
//      (see GET /config + BookingModal.jsx), so raw card data never reaches
//      this endpoint at all.
//    GCash / Maya / QRPh: `paymentMethodType` — created here server-side,
//      since there's no sensitive card data involved for those.
//    Can be called more than once for the same intent (e.g. a declined
//    card, or the customer picks a different method) — PayMongo keeps the
//    intent open until it succeeds. The Booking (and Reservation Code) is
//    only ever created here the moment PayMongo confirms payment — see
//    finalizeBookingFromPayment() in utils/bookingHelper.js.
router.post("/intent/:paymentIntentId/attach", ensureAuthenticated, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const { paymentMethodId, paymentMethodType } = req.body;

    // Idempotent: a Booking may already exist for this intent if a previous
    // attach call, the status poll, or the webhook got there first.
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
          // Availability Safety Check failed after a successful charge —
          // another confirmed reservation took the slot in the meantime.
          // No Booking/Reservation Code is created. Flagged for manual
          // follow-up (refund) since there's no refund call wired up yet.
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

    // "awaiting_payment_method" — this attempt failed (e.g. card declined).
    // The intent itself is still open, so the customer can pick another method.
    return res.status(402).json({ status: "failed", message: "That payment method was declined. Please try another." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Poll payment status by Payment Intent id — used by the frontend while a
//    3DS/e-wallet popup is open, and right after it closes, in case the
//    webhook hasn't landed yet. If no Booking exists yet for this intent,
//    checks directly with PayMongo and — the moment it's paid — creates the
//    Booking itself (finalizeBookingFromPayment() is idempotent, so this
//    races safely against attach()/the webhook doing the same thing).
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
      // No Booking/slot is held while payment is still pending — nothing to
      // report but the intent's own not-yet-paid state.
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

// ── Webhook receiver — PayMongo calls this automatically the moment a
//    Payment Intent succeeds. This is what makes payment "automatic": no
//    admin ever needs to click Approve for a PayMongo booking.
//
//    IMPORTANT: this route is mounted in server.js with express.raw(), NOT
//    express.json(), because signature verification needs the exact raw
//    bytes PayMongo sent — parsing it to an object first and re-stringifying
//    would (almost always) produce different bytes and break the signature
//    check. See webhookHandler below.
async function webhookHandler(req, res) {
  let event;
  try {
    verifyWebhookSignature(req.body.toString("utf8"), req.headers["paymongo-signature"]);
    event = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    console.error("PayMongo webhook signature check failed:", err.message);
    return res.status(400).json({ message: "Invalid signature." });
  }

  // Always ack quickly with 2xx once verified — PayMongo retries on
  // non-2xx/timeouts, and we don't want retries piling up while we do our
  // own (idempotent) processing below.
  res.status(200).json({ received: true });

  try {
    const eventType = event?.data?.attributes?.type;
    const resource = event?.data?.attributes?.data;

    if (eventType === "payment_intent.succeeded" || eventType === "payment.paid") {
      // For "payment_intent.succeeded" the resource IS the payment intent.
      // For "payment.paid" the resource is a payment, whose own attributes
      // carry the parent intent's id — handle both shapes.
      const paymentIntentId = eventType === "payment_intent.succeeded"
        ? resource?.id
        : resource?.attributes?.payment_intent_id;
      if (!paymentIntentId) return;

      // The Booking may not exist yet (it's only created on confirmed
      // payment now) — retrieve the intent fresh for its authoritative
      // metadata rather than trusting the webhook payload's shape.
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