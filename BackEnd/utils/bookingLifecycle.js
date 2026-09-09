function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw { status: 400, message: "Amounts must be finite and non-negative." };
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function bookingCollected(booking) {
  if (booking.paidAmount !== undefined && booking.paidAmount !== null) return money(Math.max(Number(booking.paidAmount) || 0, Number(booking.downPayment) || 0));
  if (booking.paymentProvider === "paymongo" || Number(booking.downPayment) > 0) return money(booking.downPayment || 0);
  // Legacy records with only a Paid label do not prove how much was collected.
  // Keep them reviewable instead of treating the entire charge as cash received.
  return 0;
}

function financialFields(amount, paidAmount, refundedAmount = 0) {
  amount = money(amount);
  paidAmount = money(paidAmount);
  refundedAmount = money(refundedAmount);
  if (refundedAmount > paidAmount) throw { status: 400, message: "Refund cannot exceed the amount received." };
  const netPaid = money(paidAmount - refundedAmount);
  const paymentStatus = amount > 0 && netPaid >= amount ? "Paid" : netPaid > 0 ? "Partial" : "Unpaid";
  return { amount, paidAmount, refundedAmount, paymentStatus };
}

function bookingStartMs(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return NaN;
  const result = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(result) || new Date(result + 8 * 3600000).toISOString().slice(0, 10) !== date) return NaN;
  return result;
}

function extendSessionFields(session, addedHours, nextAmount) {
  if (session.status !== "Active") throw { status: 409, message: "Only active sessions can be extended." };
  const hours = Number(addedHours);
  if (!Number.isInteger(hours) || hours <= 0) throw { status: 400, message: "Hours to add must be a positive whole number." };
  const duration = Number(session.duration) + hours;
  if (duration > 24) throw { status: 400, message: "Total session duration cannot exceed 24 hours." };
  const amount = nextAmount === undefined ? money(session.amount) + money(session.rate) * hours : money(nextAmount);
  return { duration, ...financialFields(amount, session.paidAmount || 0, session.refundedAmount || 0) };
}

function endSessionFields(session, { paid = false, paidAmount } = {}, now = new Date()) {
  if (session.status !== "Active") throw { status: 409, message: "Only active sessions can be ended." };
  const received = paidAmount === undefined ? (paid ? money(session.amount) + money(session.refundedAmount || 0) : session.paidAmount || 0) : money(paidAmount);
  if (received < Number(session.paidAmount || 0)) throw { status: 400, message: "Received payments cannot be removed; record a refund separately." };
  const fields = financialFields(session.amount, received, session.refundedAmount || 0);
  if (paid && fields.paymentStatus !== "Paid") throw { status: 400, message: "The outstanding balance has not been fully received." };
  return { ...fields, status: "Finished", endedAt: now };
}

function reviewCancellationFields(booking, { decision, refundedAmount = booking.refundedAmount || 0, note = "" }, reviewer, now = new Date()) {
  if (!['Pending', 'Confirmed', 'Cancelled'].includes(booking.status)) throw { status: 409, message: "This reservation can no longer be cancelled." };
  if (decision === "reject" && booking.cancellationStatus !== "Requested") throw { status: 409, message: "There is no cancellation request to reject." };
  const paidAmount = bookingCollected(booking);
  const refunded = money(refundedAmount);
  if (refunded < Number(booking.refundedAmount || 0)) throw { status: 400, message: "Previously recorded refunds cannot be removed." };
  if (decision === "reject" && refunded !== Number(booking.refundedAmount || 0)) throw { status: 400, message: "Rejecting a cancellation cannot record a refund." };
  return {
    ...financialFields(booking.amount, paidAmount, refunded),
    status: decision === "approve" ? "Cancelled" : booking.status,
    cancellationStatus: decision === "approve" ? "Approved" : "Rejected",
    cancellationReviewedAt: now, cancellationReviewedBy: reviewer, cancellationReviewNote: note,
  };
}

module.exports = { money, bookingCollected, financialFields, bookingStartMs, extendSessionFields, endSessionFields, reviewCancellationFields };
