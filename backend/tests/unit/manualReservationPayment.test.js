const test = require('node:test');
const assert = require('node:assert/strict');
const { manualReservationPaymentFields } = require('../../utils/bookingLifecycle');
const { createBookingSchema } = require('../../validation/bookingSchemas');

const price = { amount: 480, hourlyRates: [120, 150, 210], duration: 3 };

test('manual reservations record the first scheduled hour as a down payment', () => {
  const fields = manualReservationPaymentFields({ ...price, paymentChoice: 'deposit', paidAmount: 120 });
  assert.equal(fields.paidAmount, 120);
  assert.equal(fields.downPayment, 120);
  assert.equal(fields.firstHourPayment, 120);
  assert.equal(fields.downPaymentHours, 1);
  assert.equal(fields.paymentChoice, 'deposit');
  assert.equal(fields.paymentStatus, 'Partial');
});

test('manual reservations record the total as full payment', () => {
  const fields = manualReservationPaymentFields({ ...price, paymentChoice: 'full', paidAmount: 480 });
  assert.equal(fields.paidAmount, 480);
  assert.equal(fields.downPayment, 480);
  assert.equal(fields.firstHourPayment, 120);
  assert.equal(fields.downPaymentHours, 3);
  assert.equal(fields.paymentChoice, 'full');
  assert.equal(fields.paymentStatus, 'Paid');
});

test('one-hour reservations use the one-hour payment plan', () => {
  const fields = manualReservationPaymentFields({ amount: 120, hourlyRates: [120], duration: 1, paymentChoice: 'full', paidAmount: 120 });
  assert.equal(fields.paymentChoice, 'deposit');
  assert.equal(fields.paymentStatus, 'Paid');
});

test('manual reservation rejects an amount that no longer matches the selected plan', () => {
  assert.throws(() => manualReservationPaymentFields({ ...price, paymentChoice: 'deposit', paidAmount: 150 }), /price changed/i);
});

test('manual reservation schema accepts the payment choice', () => {
  const reservation = {
    guestName: 'Cabahug, Jian', guestContact: '09123456789', guestEmail: 'jian@example.com',
    roomId: '507f1f77bcf86cd799439011', date: '2026-10-02', timeIn: '17:00', duration: 3,
    paymentChoice: 'full', paidAmount: 480,
  };
  assert.equal(createBookingSchema.validate(reservation).error, undefined);
  assert.ok(createBookingSchema.validate({ ...reservation, paymentChoice: 'custom' }).error);
});
