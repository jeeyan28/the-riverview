const { operatingWindowForStart } = require("./bookingSchedule");
const { money, bookingCollected } = require("./bookingLifecycle");

const CLOSABLE_STATUSES = ["Pending", "Pending Payment Verification", "Awaiting Online Payment", "Confirmed", "Overdue"];
const AUTOMATIC_REFUND_STATUSES = ["queued", "submitting", "processing", "review_required"];
const REFUND_PROCESSING_ESTIMATE = "Estimated processing time: 30–60 minutes. This is an estimate; payment provider checks may take longer.";

function isClosurePending(booking) {
  return booking?.venueClosure?.status === "pending";
}

function isBookingCustomer(booking, userId) {
  return Boolean(userId && [booking.source === "walk-in" ? null : booking.bookedBy, booking.venueClosure?.customerUserId].some(id => id && String(id) === String(userId)));
}

function isAffectedByClosure(booking, date, operatingHours) {
  if (!CLOSABLE_STATUSES.includes(booking.status)) return false;
  const window = operatingWindowForStart(booking.date, booking.timeIn, operatingHours.openTime, operatingHours.closeTime);
  return window.serviceDate === date;
}

function outstandingClosureRefund(booking) {
  return money(Math.max(0, bookingCollected(booking) - Number(booking.refundedAmount || 0)));
}

function canRetryUnsubmittedRefund(booking) {
  const refund = booking?.closureRefund;
  // The gateway amount and payment reference are persisted before every POST.
  // Only a failed preflight can have neither; an ambiguous POST is never retried.
  return booking?.venueClosure?.status === "refund_requested" && refund?.status === "manual_required"
    && ["paymongo", "xendit"].includes(refund.provider) && Number(refund.attempts) > 0 && Boolean(refund.submittedAt)
    && Number(refund.gatewayAmount) === 0 && Number(refund.processedAmount) === 0
    && !refund.paymentId && !refund.paymentRequestId && !refund.providerRefundId
    && Number(booking.refundedAmount || 0) === Number(refund.baseRefundedAmount || 0)
    && outstandingClosureRefund(booking) > 0 && outstandingClosureRefund(booking) === money(refund.amount);
}

function refundTiming(paymentMethod = "") {
  const method = paymentMethod.toLowerCase();
  if (method.includes("card")) return "Card refunds may take up to 30 days to appear, depending on your bank.";
  if (method.includes("gcash") || method.includes("maya")) return "Wallet refunds usually appear within 24 hours after the provider processes them.";
  if (method.includes("qr")) return "QR refunds depend on your bank and may arrive by the next banking day.";
  return "The time for the money to appear depends on your payment provider or bank.";
}

module.exports = { CLOSABLE_STATUSES, AUTOMATIC_REFUND_STATUSES, REFUND_PROCESSING_ESTIMATE, isClosurePending, isBookingCustomer, isAffectedByClosure, outstandingClosureRefund, canRetryUnsubmittedRefund, refundTiming };
