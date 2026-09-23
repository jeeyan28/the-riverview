const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateBookingPrice, calculateSessionExtension, computeDownPayment } = require('../utils/roomPricing');
const { buildSalesReport } = require('../utils/salesLedger');
const { extendSessionFields, financialFields } = require('../utils/bookingLifecycle');

const variant = { price: 300, eveningPrice: 400, eveningStartTime: '17:00', pricingMode: 'time-based' };
const price = calculateBookingPrice({ variant, timeIn: '16:00', duration: 3, hasCorkage: true });

function booking(paidAmount, overrides = {}) {
  return {
    _id: 'booking-1', reservationCode: 'RV-1', source: 'online', status: 'Confirmed',
    date: '2026-10-01', timeIn: '16:00', duration: 3, amount: price.amount,
    roomLabel: 'Court', variantLabel: 'Standard', hourlyRates: price.hourlyRates,
    downPayment: paidAmount, paidAmount, refundedAmount: 0,
    ...overrides,
  };
}

function report(bookings, sessions = []) {
  return buildSalesReport(bookings, sessions, { from: '2026-10-01', to: '2026-10-01', source: 'booking' });
}

test('online 1-hour payment is partial revenue with the remaining balance due', () => {
  const firstHour = computeDownPayment(price.hourlyRates, 1);
  const result = report([booking(firstHour)]);
  assert.equal(firstHour, 300);
  assert.equal(result.summary.charged, 1300);
  assert.equal(result.summary.collected, 300);
  assert.equal(result.summary.outstanding, 1000);
  assert.equal(result.rows[0].paymentStatus, 'Partial');
  assert.equal(financialFields(price.amount, firstHour).paymentStatus, 'Partial');
});

test('online full payment includes corkage and has no venue balance', async () => {
  const { calculateBookingPrice: previewPrice } = await import('../../FrontEnd/src/utils/roomPricing.js');
  const preview = previewPrice({ variant, startHour: 16, duration: 3, hasCorkage: true, downPaymentHours: 3 });
  assert.equal(preview.downPayment, price.amount);
  const oneHour = previewPrice({ variant, startHour: 16, duration: 1, hasCorkage: true });
  assert.equal(oneHour.downPayment, oneHour.amount);
  assert.equal(oneHour.amount, 500);
  const result = report([booking(price.amount)]);
  assert.equal(result.summary.collected, 1300);
  assert.equal(result.summary.outstanding, 0);
  assert.equal(result.rows[0].paymentStatus, 'Paid');
  assert.equal(financialFields(price.amount, price.amount).paymentStatus, 'Paid');
});

test('a linked session carries the online payment once, then adds venue collection', () => {
  const firstHour = computeDownPayment(price.hourlyRates, 1);
  const session = {
    _id: 'session-1', booking: 'booking-1', startTime: new Date('2026-10-01T16:00:00+08:00'),
    duration: 3, amount: price.amount, hourlyRates: price.hourlyRates,
    paidAmount: firstHour, refundedAmount: 0, status: 'Active',
  };
  let result = report([booking(firstHour, { status: 'Ongoing' })], [session]);
  assert.equal(result.summary.transactions, 1);
  assert.equal(result.summary.collected, 300);
  assert.equal(result.summary.outstanding, 1000);

  session.paidAmount = price.amount;
  result = report([booking(firstHour, { status: 'Done' })], [session]);
  assert.equal(result.summary.transactions, 1);
  assert.equal(result.summary.collected, 1300);
  assert.equal(result.summary.outstanding, 0);
});

test('a full online payment stays counted once after session start', () => {
  const session = {
    _id: 'session-1', booking: 'booking-1', startTime: new Date('2026-10-01T16:00:00+08:00'),
    duration: 3, amount: price.amount, hourlyRates: price.hourlyRates,
    paidAmount: price.amount, refundedAmount: 0, status: 'Active',
  };
  const result = report([booking(price.amount, { status: 'Ongoing' })], [session]);
  assert.equal(result.summary.transactions, 1);
  assert.equal(result.summary.collected, 1300);
  assert.equal(result.summary.outstanding, 0);
});

test('extension preserves the fully paid booking charge when the room rate changes', () => {
  const session = {
    _id: 'session-1', booking: 'booking-1', startTime: new Date('2026-10-01T16:00:00+08:00'),
    duration: 3, amount: price.amount, hourlyRates: price.hourlyRates,
    rate: price.hourlyRates[0], guestCount: 1, corkageFee: 200,
    paidAmount: price.amount, refundedAmount: 0, status: 'Active',
  };
  const extension = calculateSessionExtension({ session, room: { price: 100 }, addedHours: 1, startHour: 16 });
  assert.deepEqual(extension.hourlyRates, [300, 400, 400, 100]);
  assert.equal(extension.amount, 1400);
  const temporaryRoomExtension = calculateSessionExtension({ session, room: { price: 0, isTemporary: true }, addedHours: 1, startHour: 16 });
  assert.equal(temporaryRoomExtension.amount, 1700);
  Object.assign(session, extendSessionFields(session, 1, extension.amount), { hourlyRates: extension.hourlyRates });
  const result = report([booking(price.amount, { status: 'Ongoing' })], [session]);
  assert.equal(result.summary.collected, 1300);
  assert.equal(result.summary.outstanding, 100);
});

test('manual refunds reduce retained revenue; no-shows retain the paid amount', () => {
  const cancelled = report([booking(price.amount, { status: 'Cancelled', refundedAmount: 500 })]);
  assert.equal(cancelled.summary.collected, 800);
  assert.equal(cancelled.summary.refunded, 500);
  assert.equal(cancelled.summary.outstanding, 0);
  assert.equal(cancelled.rows[0].paymentStatus, 'Partial refund');

  const fullyRefunded = report([booking(price.amount, { status: 'Cancelled', refundedAmount: price.amount })]);
  assert.equal(fullyRefunded.summary.collected, 0);
  assert.equal(fullyRefunded.rows[0].paymentStatus, 'Refunded');

  const noShow = report([booking(price.amount, { status: 'No Show' })]);
  assert.equal(noShow.summary.collected, 1300);
  assert.equal(noShow.summary.outstanding, 0);
});
