const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionCreateSchema, sessionExtendSchema } = require('../validation/monitoringSchemas');
const { fullOrDeferredPaymentFields, extendSessionFields, endSessionFields } = require('../utils/bookingLifecycle');

const roomId = '507f1f77bcf86cd799439011';

test('new sessions and extensions stay within five hours', () => {
  assert.equal(sessionCreateSchema.validate({ roomId, duration: 5 }).error, undefined);
  assert.ok(sessionCreateSchema.validate({ roomId, duration: 6 }).error);
  assert.equal(sessionExtendSchema.validate({ addedHours: 5 }).error, undefined);
  assert.ok(sessionExtendSchema.validate({ addedHours: 6 }).error);
  assert.ok(sessionExtendSchema.validate({ addedHours: 1, paymentStatus: 'Partial' }).error);
  assert.equal(extendSessionFields({ status: 'Active', duration: 4, amount: 400, rate: 100, paidAmount: 0 }, 1).duration, 5);
  assert.throws(() => extendSessionFields({ status: 'Active', duration: 4, amount: 400, rate: 100, paidAmount: 0 }, 2), /cannot exceed 5 hours/);
});

test('walk-ins pay in full before play or leave the charge due', () => {
  assert.equal(fullOrDeferredPaymentFields(500, 0, 0).paymentStatus, 'Unpaid');
  assert.equal(fullOrDeferredPaymentFields(500, 0, 500).paymentStatus, 'Paid');
  assert.throws(() => fullOrDeferredPaymentFields(500, 0, 200), /partial collection is unavailable/);
  assert.ok(sessionCreateSchema.validate({ roomId, duration: 1, paymentStatus: 'Partial' }).error);
});

test('an existing reservation deposit remains valid, but new collection must settle the balance', () => {
  assert.equal(fullOrDeferredPaymentFields(900, 300, 300).paymentStatus, 'Partial');
  assert.equal(fullOrDeferredPaymentFields(900, 300, 900).paymentStatus, 'Paid');
  assert.throws(() => fullOrDeferredPaymentFields(900, 300, 500), /partial collection is unavailable/);
});

test('finishing cannot add a partial payment', () => {
  const session = { status: 'Active', amount: 900, paidAmount: 300, refundedAmount: 0 };
  assert.equal(endSessionFields(session, { paidAmount: 300 }).paymentStatus, 'Partial');
  assert.equal(endSessionFields(session, { paid: true, paidAmount: 900 }).paymentStatus, 'Paid');
  assert.throws(() => endSessionFields(session, { paidAmount: 500 }), /partial collection is unavailable/);
});
