const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionCreateSchema, sessionExtendSchema } = require('../validation/monitoringSchemas');
const { fullOrDeferredPaymentFields, extendSessionFields, endSessionFields } = require('../utils/bookingLifecycle');

const roomId = '507f1f77bcf86cd799439011';

test('new sessions and extensions stay within five hours', () => {
  assert.equal(sessionCreateSchema.validate({ roomId, duration: 5 }).error, undefined);
  assert.ok(sessionCreateSchema.validate({ roomId, duration: 6 }).error);
  for (const addedHours of [0.5, 1, 1.5, 2]) {
    assert.equal(sessionExtendSchema.validate({ addedHours, collectNow: false, expectedCharge: 100 }).error, undefined);
  }
  assert.equal(sessionExtendSchema.validate({ addedHours: 0.5, collectNow: true, expectedCharge: 100, paymentMethod: 'Cash' }).error, undefined);
  assert.ok(sessionExtendSchema.validate({ addedHours: 0.5, collectNow: false }).error);
  assert.ok(sessionExtendSchema.validate({ addedHours: 0.5, collectNow: true, expectedCharge: 100 }).error);
  assert.ok(sessionExtendSchema.validate({ addedHours: 0.25, collectNow: false, expectedCharge: 100 }).error);
  assert.ok(sessionExtendSchema.validate({ addedHours: 2.5, collectNow: false, expectedCharge: 100 }).error);
  assert.equal(extendSessionFields({ status: 'Active', duration: 4, amount: 400, rate: 100, paidAmount: 0 }, 0.5).duration, 4.5);
  assert.throws(() => extendSessionFields({ status: 'Active', duration: 4, amount: 400, rate: 100, paidAmount: 0 }, 1.5), /cannot exceed 5 hours/);
});

test('paying for added time now leaves any earlier balance due; deferring adds to it', () => {
  const session = { status: 'Active', duration: 2, amount: 400, paidAmount: 200, refundedAmount: 0, rate: 200 };
  const paidNow = extendSessionFields(session, 0.5, 500, { collectNow: true });
  const paidLater = extendSessionFields(session, 0.5, 500);
  assert.equal(paidNow.paymentStatus, 'Partial');
  assert.equal(paidNow.amount - paidNow.paidAmount, 200);
  assert.equal(paidLater.amount - paidLater.paidAmount, 300);

  const fullyPaid = { ...session, paidAmount: 400 };
  assert.equal(extendSessionFields(fullyPaid, 0.5, 500, { collectNow: true }).paymentStatus, 'Paid');
  assert.equal(extendSessionFields(fullyPaid, 0.5, 500).paymentStatus, 'Partial');
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

test('finishing requires the full balance', () => {
  const session = { status: 'Active', amount: 900, paidAmount: 300, refundedAmount: 0 };
  assert.throws(() => endSessionFields(session, { paidAmount: 300 }), /Collect the full balance/);
  assert.equal(endSessionFields(session, { paid: true, paidAmount: 900 }).paymentStatus, 'Paid');
  assert.throws(() => endSessionFields(session, { paidAmount: 500 }), /partial collection is unavailable/);
});
