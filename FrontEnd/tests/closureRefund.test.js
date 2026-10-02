import test from 'node:test';
import assert from 'node:assert/strict';
import { canRetryUnsubmittedRefund, closureRefundAmount, REFUND_PROCESSING_ESTIMATE } from '../src/utils/closureRefund.js';

const booking = { paidAmount: 150, downPayment: 150, refundedAmount: 0, paymentProvider: 'paymongo', venueClosure: { status: 'refund_requested' },
  closureRefund: { status: 'manual_required', provider: 'paymongo', amount: 150, baseRefundedAmount: 0, gatewayAmount: 0, processedAmount: 0, attempts: 1, submittedAt: '2026-10-02T07:46:00Z' } };

test('Admin retry is offered only for an untouched online refund that stopped before a provider submission', () => {
  assert.equal(canRetryUnsubmittedRefund(booking), true);
  for (const change of [
    { provider: 'manual' }, { attempts: 0 }, { submittedAt: null }, { gatewayAmount: 150 }, { processedAmount: 150 },
    { paymentId: 'pay_test' }, { paymentRequestId: 'pr_test' }, { providerRefundId: 'ref_test' }, { amount: 200 },
    ...['queued', 'submitting', 'processing', 'review_required', 'failed', 'completed'].map(status => ({ status })),
  ]) assert.equal(canRetryUnsubmittedRefund({ ...booking, closureRefund: { ...booking.closureRefund, ...change } }), false, JSON.stringify(change));
  assert.equal(canRetryUnsubmittedRefund({ ...booking, refundedAmount: 50 }), false);
  assert.equal(canRetryUnsubmittedRefund({ ...booking, venueClosure: { status: 'pending' } }), false);
});

test('refund balances preserve centavo precision and the estimate does not guarantee a return time', () => {
  assert.equal(closureRefundAmount({ paidAmount: 0.3, downPayment: 0.3, refundedAmount: 0.1 }), 0.2);
  assert.match(REFUND_PROCESSING_ESTIMATE, /30–60 minutes/); assert.match(REFUND_PROCESSING_ESTIMATE, /estimate; payment provider checks may take longer/);
});
