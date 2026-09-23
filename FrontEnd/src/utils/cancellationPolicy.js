export function cancellationAmounts(booking, { customerInitiated = false } = {}) {
  const paid = Math.max(0, Number(booking?.paidAmount) || 0, Number(booking?.downPayment) || 0);
  const refunded = Math.min(paid, Math.max(0, Number(booking?.refundedAmount) || 0));
  const customerCancelled = customerInitiated || booking?.cancellationSource === 'customer' || (!booking?.cancellationSource && Boolean(booking?.cancellationRequestedAt));
  const firstRate = Number(booking?.hourlyRates?.[0]);
  const depositFallback = Number(booking?.downPaymentHours) === 1 && Number(booking?.duration) > 1 && Number(booking?.downPayment) > 0
    ? Number(booking.downPayment) : null;
  const savedFirstHour = booking?.firstHourPayment == null ? NaN : Number(booking.firstHourPayment);
  const firstHour = Number.isFinite(savedFirstHour) && savedFirstHour >= 0
    ? savedFirstHour
    : depositFallback !== null ? depositFallback : Number.isFinite(firstRate) && firstRate >= 0 ? firstRate : null;
  const refundLimit = customerCancelled && !booking?.cancellationRefundException
    ? firstHour === null ? 0 : Math.max(0, paid - firstHour)
    : paid;
  return {
    paid,
    refunded,
    retained: Math.max(0, paid - refunded),
    firstHour,
    customerCancelled,
    refundLimit,
    refundRemaining: Math.max(0, refundLimit - refunded),
  };
}
