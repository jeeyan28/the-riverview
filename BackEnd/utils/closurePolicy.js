const { operatingWindowForStart } = require("./bookingSchedule");
const { money, bookingCollected } = require("./bookingLifecycle");

const CLOSABLE_STATUSES = ["Pending", "Pending Payment Verification", "Awaiting Online Payment", "Confirmed", "Overdue"];
const AUTOMATIC_REFUND_STATUSES = ["queued", "submitting", "processing", "review_required"];

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

function refundTiming(paymentMethod = "") {
  const method = paymentMethod.toLowerCase();
  if (method.includes("card")) return "Card refunds may take up to 30 days to appear, depending on your bank.";
  if (method.includes("gcash") || method.includes("maya")) return "Wallet refunds usually appear within 24 hours after the provider processes them.";
  if (method.includes("qr")) return "QR refunds depend on your bank and may arrive by the next banking day.";
  return "The time for the money to appear depends on your payment provider or bank.";
}

module.exports = { CLOSABLE_STATUSES, AUTOMATIC_REFUND_STATUSES, isClosurePending, isBookingCustomer, isAffectedByClosure, outstandingClosureRefund, refundTiming };
