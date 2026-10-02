export const AUTOMATIC_REFUND_STATUSES = ['queued', 'submitting', 'processing', 'review_required'];
export function isClosurePending(booking) { return booking?.venueClosure?.status === 'pending'; }
export function canResolveClosure(booking) {
  return isClosurePending(booking) && ['Pending', 'Pending Payment Verification', 'Awaiting Online Payment', 'Confirmed', 'Overdue'].includes(booking.status);
}
export function closureRefundAmount(booking) {
  const paid = Math.max(Number(booking?.paidAmount ?? booking?.downPayment ?? 0), Number(booking?.downPayment || 0));
  return Math.max(0, paid - Number(booking?.refundedAmount || 0));
}
export function refundTiming(booking) {
  if (booking.paymentProvider === 'xendit') return 'Your bank or wallet determines when the returned money appears.';
  const method = String(booking.paymentMethod || '').toLowerCase();
  if (method.includes('card')) return 'Card refunds may take up to 30 days to appear, depending on your bank.';
  if (method.includes('gcash') || method.includes('maya')) return 'Wallet refunds usually appear within 24 hours after the provider processes them.';
  if (method.includes('qr')) return 'QR refunds depend on your bank and may arrive by the next banking day.';
  return 'The return time depends on your payment provider or bank.';
}
