const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const XenditPaymentAttempt = require("../model/xenditPaymentAttempt");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { finalizeBookingFromPayment } = require("../utils/bookingHelper");
const { getVerifiedPayment, verifyWebhookToken } = require("../utils/xendit");
const { isAdminRole } = require("../utils/permissions");

async function checkAttempt(attempt) {
  const existing = await Booking.findOne({ xenditPaymentSessionId: attempt.sessionId });
  if (existing) return { status: existing.status, paymentStatus: existing.paymentStatus, bookingId: existing._id, reservationCode: existing.reservationCode };

  const verified = await getVerifiedPayment(attempt);
  if (verified.status !== "succeeded") return { status: verified.status, paymentStatus: "Unpaid" };
  try {
    const booking = await finalizeBookingFromPayment({
      provider: "xendit",
      paymentIntentId: attempt.sessionId,
      metadata: attempt.metadata,
      paidPaymentId: verified.paymentId,
      paymentMethodType: verified.paymentMethodType,
    });
    return { status: booking.status, paymentStatus: booking.paymentStatus, bookingId: booking._id, reservationCode: booking.reservationCode };
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
    const attempt = await XenditPaymentAttempt.findOne({ referenceId });
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
  if (event?.event !== "payment_session.completed") return res.status(200).json({ received: true });
  const attempt = await XenditPaymentAttempt.findOne({ sessionId: event?.data?.payment_session_id });
  if (!attempt) return res.status(404).json({ message: "Unknown payment session." });
  try {
    await checkAttempt(attempt);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Xendit webhook processing failed:", error);
    return res.status(500).json({ message: "Payment verification will be retried." });
  }
}

module.exports = { router, webhookHandler, checkAttempt };
