const AppError = require("./appError");

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new AppError(400, "Amounts must be finite and non-negative.");
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
  if (refundedAmount > paidAmount) throw new AppError(400, "Refund cannot exceed the amount received.");
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
  if (session.status !== "Active") throw new AppError(409, "Only active sessions can be extended.");
  const hours = Number(addedHours);
  if (!Number.isInteger(hours) || hours <= 0) throw new AppError(400, "Hours to add must be a positive whole number.");
  const duration = Number(session.duration) + hours;
  if (duration > 24) throw new AppError(400, "Total session duration cannot exceed 24 hours.");
  const amount = nextAmount === undefined ? money(session.amount) + money(session.rate) * hours : money(nextAmount);
  return { duration, ...financialFields(amount, session.paidAmount || 0, session.refundedAmount || 0) };
}

function endSessionFields(session, { paid = false, paidAmount } = {}, now = new Date()) {
  if (session.status !== "Active") throw new AppError(409, "Only active sessions can be ended.");
  const received = paidAmount === undefined ? (paid ? money(session.amount) + money(session.refundedAmount || 0) : session.paidAmount || 0) : money(paidAmount);
  if (received < Number(session.paidAmount || 0)) throw new AppError(400, "Received payments cannot be removed; record a refund separately.");
  const fields = financialFields(session.amount, received, session.refundedAmount || 0);
  if (paid && fields.paymentStatus !== "Paid") throw new AppError(400, "The outstanding balance has not been fully received.");
  return { ...fields, status: "Finished", endedAt: now };
}

function firstHourCharge(booking) {
  if (booking.firstHourPayment !== undefined && booking.firstHourPayment !== null) return money(booking.firstHourPayment);
  // For older partial-payment records, the original deposit is more accurate after a reschedule.
  if (Number(booking.downPaymentHours) === 1 && Number(booking.duration) > 1 && Number(booking.downPayment) > 0) {
    return money(booking.downPayment);
  }
  const firstRate = Number(booking.hourlyRates?.[0]);
  if (Number.isFinite(firstRate) && firstRate >= 0) return money(firstRate);
  throw new AppError(409, "The first-hour charge is missing. Review this older reservation before recording a customer refund.");
}

function cancellationRefundLimit(booking, refundException = booking.cancellationRefundException || false, source = booking.cancellationSource) {
  const paid = bookingCollected(booking);
  const customerCancelled = source === "customer" || (!source && booking.cancellationRequestedAt);
  if (!customerCancelled || refundException || paid === 0) return paid;
  return money(Math.max(0, paid - firstHourCharge(booking)));
}

function reviewCancellationFields(booking, { decision, refundedAmount = booking.refundedAmount || 0, note = "", refundException, cancellationSource }, reviewer, now = new Date()) {
  if (!['Pending', 'Confirmed', 'Cancelled'].includes(booking.status)) throw new AppError(409, "This reservation can no longer be cancelled.");
  if (!['approve', 'reject'].includes(decision)) throw new AppError(400, "Choose to approve or reject the cancellation.");
  if (decision === "reject" && booking.cancellationStatus !== "Requested") throw new AppError(409, "There is no cancellation request to reject.");
  if (decision === "approve" && booking.status === "Cancelled" && booking.cancellationStatus !== "Approved") throw new AppError(409, "This reservation has no approved cancellation to update.");
  const paidAmount = bookingCollected(booking);
  const refunded = money(refundedAmount);
  if (refunded < Number(booking.refundedAmount || 0)) throw new AppError(400, "Previously recorded refunds cannot be removed.");
  if (decision === "reject" && refunded !== Number(booking.refundedAmount || 0)) throw new AppError(400, "Rejecting a cancellation cannot record a refund.");
  const source = cancellationSource || booking.cancellationSource || (booking.cancellationRequestedAt ? "customer" : "admin");
  const exception = refundException === undefined ? Boolean(booking.cancellationRefundException) : refundException;
  if (decision === "reject" && (refundException || cancellationSource)) throw new AppError(400, "A rejected request cannot change the refund policy.");
  if (booking.cancellationRefundException && !exception) throw new AppError(400, "A recorded refund exception cannot be removed.");
  if (source === "customer" && exception && !booking.cancellationRefundException && !String(note).trim()) {
    throw new AppError(400, "Explain the venue or payment issue before making a refund exception.");
  }
  if (decision === "approve" && refunded > 0 && refunded > cancellationRefundLimit(booking, exception, source)) {
    throw new AppError(400, "Customer cancellations must retain the first-hour charge. Record an explained exception for a venue or payment issue.");
  }
  const updatingApproved = booking.status === "Cancelled" && booking.cancellationStatus === "Approved";
  return {
    ...financialFields(booking.amount, paidAmount, refunded),
    status: decision === "approve" ? "Cancelled" : booking.status,
    cancellationStatus: decision === "approve" ? "Approved" : "Rejected",
    cancellationSource: source,
    cancellationRefundException: exception,
    cancellationReviewedAt: updatingApproved ? booking.cancellationReviewedAt : now,
    cancellationReviewedBy: updatingApproved ? booking.cancellationReviewedBy : reviewer,
    cancellationReviewNote: updatingApproved ? booking.cancellationReviewNote || "" : note || booking.cancellationReviewNote || "",
    ...(updatingApproved && note ? { cancellationRefundNote: note } : {}),
    ...(refunded !== Number(booking.refundedAmount || 0) ? { paymentUpdatedAt: now } : {}),
  };
}

module.exports = { money, bookingCollected, financialFields, bookingStartMs, extendSessionFields, endSessionFields, firstHourCharge, cancellationRefundLimit, reviewCancellationFields };
