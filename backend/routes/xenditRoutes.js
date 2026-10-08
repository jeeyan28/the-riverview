const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const XenditPaymentAttempt = require("../model/xenditPaymentAttempt");
const PaymentAttempt = require('../model/paymentAttempt');
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { finalizeVerifiedAttempt, fingerprint } = require('../utils/paymentAttempts');
const { getVerifiedPayment, verifyWebhookToken } = require("../utils/xendit");
const { isAdminRole } = require("../utils/permissions");

async function checkAttempt(attempt) {
  const sessionId = attempt.providerId || attempt.sessionId;
  const existing = await Booking.findOne({ xenditPaymentSessionId: sessionId });
  if (existing) return { status: existing.status, paymentStatus: existing.paymentStatus, bookingId: existing._id, reservationCode: existing.reservationCode };

  const verified = await getVerifiedPayment({ referenceId: attempt.referenceId || attempt._id, sessionId, amount: attempt.expectedMinor ? attempt.expectedMinor / 100 : attempt.amount });
  if (verified.status !== "succeeded") return { status: verified.status, paymentStatus: "Unpaid" };
  try {
    return await finalizeVerifiedAttempt(attempt, { paymentId: verified.paymentId, paymentMethodType: verified.paymentMethodType });
  } catch (error) {
    if (error.slotUnavailable) {
      console.error(`Xendit payment ${attempt.sessionId} succeeded but the slot is unavailable — manual review/refund required.`);
      return { status: "paid_slot_unavailable", paymentStatus: "Paid", message: error.message };
    }
    throw error;
  }
}

router.get("/status/:referenceId", ensureAuthenticated, async (req, res) => {
  try {
    const { referenceId } = req.params;
    if (!/^rv-[0-9a-f-]{36}$/.test(referenceId)) return res.status(400).json({ message: "Invalid payment reference." });
    const attempt = await findAttempt(referenceId);
    if (!attempt) return res.status(404).json({ message: "Payment session not found." });
    if (String(attempt.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Not allowed." });
    }
    const result = await checkAttempt(attempt);
    return res.status(result.status === "paid_slot_unavailable" ? 409 : 200).json(result);
  } catch (error) {
    console.error("Xendit status check failed:", error);
    return res.status(502).json({ message: "Could not verify backup payment. Check Reservations before paying again." });
  }
});

async function webhookHandler(req, res) {
  if (!verifyWebhookToken(req.headers["x-callback-token"])) {
    return res.status(401).json({ message: "Invalid webhook token." });
  }
  const event = req.body;
  if (["refund.succeeded", "refund.failed"].includes(event?.event)) {
    try {
      await require("../utils/closureRefunds").handleRefundWebhook("xendit", event.data);
      await require("../utils/reservationNotifications").deliverNotificationEmails({ limit: 5 });
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("Xendit refund webhook failed:", error.name);
      return res.status(500).json({ message: "Refund verification will be retried." });
    }
  }
  if (event?.event !== "payment_session.completed") return res.status(200).json({ received: true });
  try {
    const sessionId = event?.data?.payment_session_id;
    let attempt = await PaymentAttempt.findOne({ provider: 'xendit', providerId: sessionId }).select('+metadata');
    if (!attempt && event?.data?.reference_id) {
      attempt = await findAttempt(event.data.reference_id);
      if (attempt && !attempt.providerId) {
        await getVerifiedPayment({ referenceId: attempt._id, sessionId, amount: attempt.expectedMinor / 100 });
        await PaymentAttempt.updateOne({ _id: attempt._id, providerId: null }, { $set: { providerId: sessionId } });
        attempt.providerId = sessionId;
      }
    }
    if (!attempt) return res.status(404).json({ message: 'Unknown payment session.' });
    await checkAttempt(attempt);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Xendit webhook processing failed:", error);
    return res.status(500).json({ message: "Payment verification will be retried." });
  }
}

async function findAttempt(referenceId) {
  const current = await PaymentAttempt.findOne({ _id: referenceId, provider: 'xendit' }).select('+metadata');
  if (current) return current;
  const legacy = await XenditPaymentAttempt.findOne({ referenceId });
  if (!legacy) return null;
  return PaymentAttempt.findOneAndUpdate({ _id: referenceId }, { $setOnInsert: {
    provider: 'xendit', providerId: legacy.sessionId, bookedBy: legacy.bookedBy, room: legacy.metadata.roomId,
    flowKey: `legacy:${legacy._id}`, clientKey: `legacy:${legacy._id}`, metadata: legacy.metadata,
    expectedMinor: Math.round(legacy.amount * 100), fingerprint: fingerprint(legacy.metadata), state: 'pending',
    events: [{ action: 'legacy_attempt_imported' }],
  } }, { upsert: true, returnDocument: 'after', runValidators: true }).select('+metadata');
}
module.exports = { router, webhookHandler, checkAttempt, findAttempt };
