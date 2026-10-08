const express = require("express");
const AppError = require("../utils/appError");
const router = express.Router();
const Booking = require("../model/booking");
const BookingLock = require("../model/bookingLock");
const PaymentAttempt = require("../model/paymentAttempt");
const { prepareAttempt, markUncertain, verifyPaymongoIntent, finalizeVerifiedAttempt } = require("../utils/paymentAttempts");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { validateAndPriceBooking } = require("../utils/bookingHelper");
const { quoteOnlineBooking } = require("../utils/roomPricing");
const {
  getPublicKey,
  PAYMONGO_ALLOWED_METHODS,
  createPaymentIntent,
  retrievePaymentIntent,
  createWalletPaymentMethod,
  attachPaymentIntent,
  resolvePaymongoPaymentMethodType,
  classifyPaymongoPaymentFailure,
  getPaymentIntentFailure,
  verifyWebhookSignature,
} = require("../utils/paymongo");
const { isAdminRole } = require("../utils/permissions");
const { EMAIL_RE } = require("../utils/constants");
const { validate, Joi } = require("../middleware/validate");
const { paymentIntentIdParamsSchema, createIntentSchema, attachIntentSchema } = require("../validation/paymentSchemas");
const { paymentIntentLimiter, paymentAttachLimiter } = require("../middleware/rateLimiter");
const { createSession: createXenditSession, isConfigured: isXenditConfigured } = require("../utils/xendit");

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

function toBookingMetadata(fields) {
  const out = {};
  Object.entries(fields).forEach(([k, v]) => {
    out[k] = v === undefined || v === null ? "" : String(v);
  });
  return out;
}

const checkoutAttemptIdParams = Joi.object({ id: Joi.string().pattern(/^rv-[0-9a-f-]{36}$/).required() });
const checkoutAttemptKeyParams = Joi.object({ key: Joi.string().guid({ version: 'uuidv4' }).required() });
async function customerCheckoutStatus(req, res) {
  const identity = req.params.id ? { _id: req.params.id } : { clientKey: req.params.key };
  const attempt = await PaymentAttempt.findOne({ ...identity, bookedBy: req.user._id }).select('state issue booking providerId');
  if (!attempt) throw new AppError(404, 'The original checkout has not been recorded. Retry using the same checkout identity.');
  if (['pending', 'uncertain'].includes(attempt.state) && attempt.providerId) {
    return res.json(await require('../utils/paymentReconciliation').recheckAttempt(attempt._id, { actor: req.user, includeCheckout: true }));
  }
  res.json({ status: attempt.issue === 'paid_unbooked' ? 'paid_slot_unavailable' : attempt.booking ? 'succeeded' : attempt.state === 'uncertain' ? 'checking' : attempt.state,
    attemptId: attempt._id, bookingId: attempt.booking,
    message: attempt.state === 'uncertain' ? 'We are checking your payment. Please do not start another payment.' : undefined });
}
router.get('/attempts/client/:key', ensureAuthenticated, validate(checkoutAttemptKeyParams, 'params'), customerCheckoutStatus);
router.get('/attempts/:id', ensureAuthenticated, validate(checkoutAttemptIdParams, 'params'), customerCheckoutStatus);

router.get("/config", (req, res) => {
  if (process.env.APP_MODE === 'demo') return res.json({ gateway: 'demo', publicKey: '', paymentMethods: [] });
  try {
    res.json({ publicKey: getPublicKey(), paymentMethods: PAYMONGO_ALLOWED_METHODS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post('/demo/:id/confirm', ensureAuthenticated, async (req, res) => {
  if (process.env.APP_MODE !== 'demo') return res.status(404).json({ message: 'Not found.' });
  const attempt = await PaymentAttempt.findOne({ _id: req.params.id, provider: 'demo', bookedBy: req.user._id }).select('+metadata');
  if (!attempt) throw new AppError(404, 'Synthetic checkout not found.');
  res.json(await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_demo_' + attempt._id, paymentMethodType: 'demo' }));
});

router.post("/intent", ensureAuthenticated, paymentIntentLimiter, validate(createIntentSchema), async (req, res) => {
  try {
    const { guestName, guestContact, guestEmail, guestCount: guestCountRaw, specialRequests, roomId, variantLabel, date, timeIn, duration, paymentChoice: requestedPaymentChoice, downPaymentHours: legacyPaymentHours, claimDiscount, selectedAddOns = [] } = req.body;
    const guestCount = guestCountRaw || 1;
    const paymentChoice = Number(duration) === 1 ? "deposit" : (requestedPaymentChoice || (legacyPaymentHours === duration ? "full" : "deposit"));
    const downPaymentHours = paymentChoice === "full" ? duration : 1;

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

    let room, selectedVariant, roomCharge, hourlyRates;
    try {
      ({ room, selectedVariant, roomCharge, hourlyRates } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking: false, guestCount, excludeLockUserId: req.user._id }));
    } catch (e) {
      return res.status(e.status || 500).json({ message: AppError.publicMessage(e, "Server error.") });
    }
    let quote;
    try {
      quote = quoteOnlineBooking({ room, variant: selectedVariant, basePrice: { roomCharge, hourlyRates }, paymentChoice, claimDiscount, selectedAddOns });
    } catch (e) {
      return res.status(e.status || 400).json({ message: AppError.publicMessage(e) });
    }
    const { amount, downPayment, discountPercent, discountAmount, eligibleDiscount, addOns, addOnFee } = quote;

    const metadata = toBookingMetadata({
      guestName: guestName.trim(),
      guestContact: (guestContact || "").trim(),
      guestEmail,
      guestCount,
      specialRequests: (specialRequests || "").trim(),
      roomId: room._id,
      variantLabel: variantLabel || "",
      date,
      timeIn,
      duration,
      amount,
      roomCharge,
      discountPercent,
      discountAmount,
      eligibleDiscount,
      addOns: JSON.stringify(addOns),
      addOnFee,
      paymentChoice,
      hourlyRates: JSON.stringify(hourlyRates),
      downPayment,
      downPaymentHours,
      bookedBy: req.session.userId,
    });
    const description = `${paymentChoice === "full" ? "Full payment" : "One-hour down payment"} — ${room.name} (${date} ${new Date(`${date}T${timeIn}:00+08:00`).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true })})`;
    const provider = process.env.APP_MODE === 'demo' ? 'demo' : !process.env.PAYMONGO_SECRET_KEY && isXenditConfigured() ? 'xendit' : 'paymongo';
    const attempt = await prepareAttempt({ provider, hold: activeLock, user: req.user, metadata, clientKey: req.body.attemptKey });
    const pendingResponse = () => res.status(202).json({ gateway: attempt.provider, attemptId: attempt._id, status: 'checking', message: 'We are checking your payment. Please do not start another payment.' });
    if (provider === 'demo') {
      if (attempt.state === 'unpaid') await PaymentAttempt.updateOne({ _id: attempt._id, state: 'unpaid' }, { $set: { state: 'pending', providerId: `pi_demo_${attempt._id}`, nextCheckAt: null }, $push: { events: { action: 'synthetic_checkout_created', note: 'No provider was contacted.' } } });
      return res.json({ gateway: 'demo', attemptId: attempt._id, amount: downPayment, status: 'pending' });
    }
    if (attempt.state !== 'unpaid') {
      if (attempt.providerId && attempt.state === 'pending') {
        if (attempt.provider === 'xendit') return res.json({ gateway: 'xendit', attemptId: attempt._id, referenceId: attempt._id, redirectUrl: attempt.redirectUrl, amount: downPayment });
        const current = await retrievePaymentIntent(attempt.providerId);
        await verifyPaymongoIntent(current, { userId: req.user._id });
        return res.json({ gateway: 'paymongo', attemptId: attempt._id, paymentIntentId: attempt.providerId, clientKey: current.data.attributes.client_key, amount: downPayment });
      }
      return pendingResponse();
    }
    if ((provider === 'paymongo' && !process.env.PAYMONGO_SECRET_KEY) || (provider === 'xendit' && !isXenditConfigured())) {
      return res.status(503).json({ message: 'Online payments are not available right now. Please contact the venue.', code: 'PAYMENT_UNAVAILABLE', attemptId: attempt._id });
    }
    const claimed = await PaymentAttempt.findOneAndUpdate({ _id: attempt._id, state: 'unpaid' }, { $set: { state: 'uncertain', issue: 'provider_uncertain', nextCheckAt: new Date(Date.now() + 60000) }, $push: { events: { action: 'provider_creation_started' } } }, { returnDocument: 'after' });
    if (!claimed) return pendingResponse();
    try {
      if (provider === 'xendit') {
        const checkout = await createXenditSession({ referenceId: attempt._id, amount: downPayment, expiresAt: activeLock.expiresAt, description });
        await PaymentAttempt.updateOne({ _id: attempt._id, state: 'uncertain', providerId: null }, { $set: { providerId: checkout.sessionId, redirectUrl: checkout.redirectUrl, state: 'pending', issue: '' }, $push: { events: { action: 'provider_session_created' } } });
        return res.status(201).json({ gateway: 'xendit', attemptId: attempt._id, referenceId: attempt._id, redirectUrl: checkout.redirectUrl, amount: downPayment });
      }
      const intent = await createPaymentIntent({ amountPesos: downPayment, description, statementDescriptor: room.name, metadata: { ...metadata, attemptId: attempt._id } });
      if (!intent?.data?.id || !intent?.data?.attributes?.client_key) throw new Error('Invalid provider creation response');
      await PaymentAttempt.updateOne({ _id: attempt._id, state: 'uncertain', providerId: null }, { $set: { providerId: intent.data.id, state: 'pending', issue: '' }, $push: { events: { action: 'provider_intent_created' } } });
      return res.status(201).json({ gateway: 'paymongo', attemptId: attempt._id, paymentIntentId: intent.data.id, clientKey: intent.data.attributes.client_key, amount: downPayment });
    } catch (error) {
      await markUncertain(attempt, error.isTimeout ? 'timeout' : 'provider_creation');
      console.error('Payment creation requires reconciliation:', { requestId: req.id, attemptId: attempt._id, category: error.name });
      return pendingResponse();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/intent/:paymentIntentId/attach", ensureAuthenticated, paymentAttachLimiter, validate(paymentIntentIdParamsSchema, "params"), validate(attachIntentSchema), async (req, res) => {
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
      return res.status(e.status || 502).json({ message: AppError.publicMessage(e, "Could not find this payment. Please try again.") });
    }
    const { attempt, metadata } = await verifyPaymongoIntent(intent, { userId: req.user._id });
    if (String(metadata.bookedBy) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed." });
    }

    let methodId = paymentMethodId;
    if (!methodId) {
      const billingEmail = metadata.guestEmail || req.user.email;
      if (!billingEmail || !EMAIL_RE.test(billingEmail)) {
        return res.status(400).json({
          message: "A valid email address is required for wallet payments. Please go back and enter your email in the guest details.",
          field: "guestEmail",
        });
      }

      let walletMethod;
      try {
        walletMethod = await createWalletPaymentMethod({
          type: paymentMethodType,
          billing: { name: metadata.guestName, email: billingEmail },
        });
      } catch (e) {
        return res.status(e.status || 502).json({ message: AppError.publicMessage(e, "Could not start that payment method. Please try again.") });
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
        returnUrl: `${base.replace(/\/$/, "")}/?paymongo=success&paymentIntentId=${paymentIntentId}`,
      });
    } catch (e) {
      await markUncertain(attempt, e.isTimeout ? 'attach_timeout' : 'attach_outcome');
      const failure = classifyPaymongoPaymentFailure(e.paymongoErrors || e.message);
      if (failure) {
        return res.status(failure.status === "expired" ? 410 : 402).json({ ...failure, paymentStatus: "Unpaid" });
      }
      return res.status(e.status || 502).json({ message: AppError.publicMessage(e, "Payment could not be processed. Please try again.") });
    }

    const attrs = attachResult.data.attributes;

    if (isPaidPaymentIntent(attrs)) {
      const paidPayment = attrs.payments?.find(p => p?.attributes?.status === "paid");
      const resolvedPaymentMethodType = resolvePaymongoPaymentMethodType(
        paidPayment,
        paymentMethodType || (paymentMethodId ? "card" : "")
      );
      try {
        const verified = await verifyPaymongoIntent(attachResult, { userId: req.user._id });
        const result = await finalizeVerifiedAttempt(verified.attempt, { paymentId: verified.paidPayment.id, paymentMethodType: resolvedPaymentMethodType });
        return res.status(result.status === 'paid_slot_unavailable' ? 409 : 200).json({ ...result, status: result.bookingId ? 'succeeded' : result.status });
      } catch (e) {
        if (e.slotUnavailable) {
          console.error(`PayMongo payment ${paymentIntentId} succeeded but the slot is no longer available — needs manual review/refund.`);
          return res.status(409).json({ status: "paid_slot_unavailable", message: AppError.publicMessage(e) });
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

    const paymentFailure = getPaymentIntentFailure(attrs);
    if (paymentFailure) {
      return res.status(paymentFailure.status === "expired" ? 410 : 402).json({ ...paymentFailure, paymentStatus: "Unpaid" });
    }

    return res.status(402).json({ status: "failed", message: "That payment method was declined. Please try another." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/status/:paymentIntentId", ensureAuthenticated, validate(paymentIntentIdParamsSchema, "params"), async (req, res) => {
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
      const failure = classifyPaymongoPaymentFailure(e.paymongoErrors || e.message);
      if (failure) {
        return res.status(failure.status === "expired" ? 410 : 402).json({ ...failure, paymentStatus: "Unpaid" });
      }
      return res.status(e.status || 502).json({ message: AppError.publicMessage(e, "Could not check payment status.") });
    }
    const attrs = intent?.data?.attributes;
    const { attempt, metadata } = await verifyPaymongoIntent(intent, { userId: req.user._id });
    if (String(metadata.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Not allowed." });
    }

    if (!isPaidPaymentIntent(attrs)) {
      const paymentFailure = getPaymentIntentFailure(attrs);
      if (paymentFailure) {
        return res.status(paymentFailure.status === "expired" ? 410 : 402).json({ ...paymentFailure, paymentStatus: "Unpaid" });
      }
      return res.json({ status: attrs?.status || "awaiting_payment_method", paymentStatus: "Unpaid" });
    }

    try {
      const paidPayment = attrs.payments?.find(p => p?.attributes?.status === "paid");
      const result = await finalizeVerifiedAttempt(attempt, { paymentId: paidPayment.id, paymentMethodType: resolvePaymongoPaymentMethodType(paidPayment) });
      return res.status(result.status === 'paid_slot_unavailable' ? 409 : 200).json(result);
    } catch (e) {
      if (e.slotUnavailable) {
        return res.status(409).json({ status: "paid_slot_unavailable", paymentStatus: "Paid", message: AppError.publicMessage(e) });
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

  const refundEventType = event?.data?.attributes?.type;
  if (["payment.refunded", "payment.refund.updated", "refund.succeeded", "refund.failed"].includes(refundEventType)) {
    try {
      await require("../utils/closureRefunds").handleRefundWebhook("paymongo", event?.data?.attributes?.data);
      await require("../utils/reservationNotifications").deliverNotificationEmails({ limit: 5 });
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("PayMongo refund webhook failed:", error.name);
      return res.status(500).json({ message: "Refund verification will be retried." });
    }
  }

  try {
    const eventType = event?.data?.attributes?.type;
    const resource = event?.data?.attributes?.data;

    if (eventType === "payment_intent.succeeded" || eventType === "payment.paid") {
      const paymentIntentId = eventType === "payment_intent.succeeded"
        ? resource?.id
        : resource?.attributes?.payment_intent_id;
      if (!paymentIntentId) return res.status(200).json({ received: true });

      const intent = await retrievePaymentIntent(paymentIntentId);
      const attrs = intent?.data?.attributes;
      if (!isPaidPaymentIntent(attrs)) return res.status(200).json({ received: true });

      const paidPayment = attrs.payments?.find(p => p?.attributes?.status === "paid");
      const verified = await verifyPaymongoIntent(intent);
      await finalizeVerifiedAttempt(verified.attempt, { paymentId: verified.paidPayment.id, paymentMethodType: resolvePaymongoPaymentMethodType(paidPayment || resource) });
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Error processing PayMongo webhook:", err);
    return res.status(500).json({ message: "Payment verification will be retried." });
  }
}

module.exports = { router, webhookHandler };
