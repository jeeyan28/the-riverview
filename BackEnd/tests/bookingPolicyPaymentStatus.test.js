const test = require('node:test');
const assert = require('node:assert/strict');
const { bookingStartMs } = require('../utils/bookingLifecycle');

test('reschedule cutoff is 24 hours before the Manila start time', () => {
  const start = bookingStartMs('2026-10-02', '10:00');
  const day = 24 * 60 * 60 * 1000;
  assert.equal(start - Date.parse('2026-10-01T10:00:00+08:00') >= day, true);
  assert.equal(start - Date.parse('2026-10-01T10:01:00+08:00') >= day, false);
});

test('declined payment stops waiting once the attempted intent returns to awaiting a method', async () => {
  const { terminalPaymentFailure } = await import('../../FrontEnd/src/utils/paymongoStatus.js');
  const awaiting = { status: 'awaiting_payment_method' };
  assert.equal(terminalPaymentFailure(awaiting, { awaitingMethodChecks: 1 }), null);
  assert.equal(terminalPaymentFailure(awaiting, { awaitingMethodChecks: 2 }).phase, 'failed');
  assert.equal(terminalPaymentFailure({ status: 'awaiting_next_action' }), null);
  assert.equal(terminalPaymentFailure({ status: 'processing' }), null);
  assert.equal(terminalPaymentFailure({ status: 'succeeded' }), null);
  assert.equal(terminalPaymentFailure({ message: 'Declined' }, { httpStatus: 402 }).phase, 'failed');
  assert.equal(terminalPaymentFailure({ status: 'expired' }).phase, 'expired');
});
