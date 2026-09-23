const test = require('node:test');
const assert = require('node:assert/strict');
const { isBeforeReservationDay } = require('../utils/businessDate');

test('rescheduling closes at midnight in Manila on the reservation date', () => {
  const reservationDate = '2026-10-02';
  assert.equal(isBeforeReservationDay(reservationDate, new Date('2026-10-01T15:59:59Z')), true);
  assert.equal(isBeforeReservationDay(reservationDate, new Date('2026-10-01T16:00:00Z')), false);
  assert.equal(isBeforeReservationDay(reservationDate, new Date('2026-10-02T16:00:00Z')), false);
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
