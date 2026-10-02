export const AUTOMATIC_REFUND_STATUSES = ['queued', 'submitting', 'processing', 'review_required'];
export const REFUND_PROCESSING_ESTIMATE = 'Estimated processing time: 30–60 minutes. This is an estimate; payment provider checks may take longer.';
export function isOnlineRefund(booking) { return ['paymongo', 'xendit'].includes(booking.closureRefund?.provider || booking.paymentProvider); }
export function isClosurePending(booking) { return booking?.venueClosure?.status === 'pending'; }
export function canResolveClosure(booking) {
  return isClosurePending(booking) && ['Pending', 'Pending Payment Verification', 'Awaiting Online Payment', 'Confirmed', 'Overdue'].includes(booking.status);
}
export function closureRefundAmount(booking) {
  const paid = Math.max(Number(booking?.paidAmount ?? booking?.downPayment ?? 0), Number(booking?.downPayment || 0));
  return Math.round(Math.max(0, paid - Number(booking?.refundedAmount || 0)) * 100) / 100;
}
export function canRetryUnsubmittedRefund(booking) {
  const refund = booking?.closureRefund;
  return booking?.venueClosure?.status === 'refund_requested' && refund?.status === 'manual_required'
    && isOnlineRefund(booking) && Number(refund.attempts) > 0 && Boolean(refund.submittedAt)
    && Number(refund.gatewayAmount) === 0 && Number(refund.processedAmount) === 0
    && !refund.paymentId && !refund.paymentRequestId && !refund.providerRefundId
    && Number(booking.refundedAmount || 0) === Number(refund.baseRefundedAmount || 0)
    && closureRefundAmount(booking) > 0 && closureRefundAmount(booking) === Number(refund.amount);
}
export function refundTiming(booking) {
  if (booking.paymentProvider === 'xendit') return 'Your bank or wallet determines when the returned money appears.';
  const method = String(booking.paymentMethod || '').toLowerCase();
  if (method.includes('card')) return 'Card refunds may take up to 30 days to appear, depending on your bank.';
  if (method.includes('gcash') || method.includes('maya')) return 'Wallet refunds usually appear within 24 hours after the provider processes them.';
  if (method.includes('qr')) return 'QR refunds depend on your bank and may arrive by the next banking day.';
  return 'The return time depends on your payment provider or bank.';
}
