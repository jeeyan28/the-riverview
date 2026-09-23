const test = require('node:test');
const assert = require('node:assert/strict');
const { cancellationRefundLimit, reviewCancellationFields } = require('../utils/bookingLifecycle');
const { buildSalesReport } = require('../utils/salesLedger');

function reservation(paidAmount, overrides = {}) {
  return {
    _id: 'reservation-1', reservationCode: 'RV-1', source: 'online', status: 'Confirmed',
    cancellationStatus: 'Requested', cancellationSource: 'customer',
    cancellationRequestedAt: new Date('2026-09-22T00:00:00Z'),
    date: '2026-10-01', timeIn: '16:00', duration: 3, amount: 1300,
    roomLabel: 'Court', hourlyRates: [300, 400, 400], roomCharge: 1100, corkageFee: 200,
    firstHourPayment: 300, downPayment: paidAmount, paidAmount, refundedAmount: 0,
    downPaymentHours: paidAmount === 1300 ? 3 : 1,
    ...overrides,
  };
}

test('customer cancellation retains the one-hour deposit and reports it as revenue', () => {
  const booking = reservation(300);
  assert.equal(cancellationRefundLimit(booking), 0);
  assert.throws(() => reviewCancellationFields(booking, { decision: 'approve', refundedAmount: 1 }, 'admin'), /first-hour charge/);
  const fields = reviewCancellationFields(booking, { decision: 'approve' }, 'admin');
  assert.equal(fields.status, 'Cancelled');
  assert.equal(fields.refundedAmount, 0);
  const report = buildSalesReport([{ ...booking, ...fields }], [], { from: booking.date, to: booking.date, source: 'booking' });
  assert.equal(report.summary.collected, 300);
  assert.equal(report.summary.outstanding, 0);
});

test('full payment can be cancelled first, then the amount beyond the first hour is recorded after a manual refund', () => {
  const booking = reservation(1300);
  assert.equal(cancellationRefundLimit(booking), 1000);
  const approved = { ...booking, ...reviewCancellationFields(booking, { decision: 'approve', note: 'Guest requested cancellation' }, 'admin') };
  assert.equal(approved.refundedAmount, 0);
  assert.equal(approved.status, 'Cancelled');
  assert.throws(() => reviewCancellationFields(approved, { decision: 'approve', refundedAmount: 1001 }, 'admin'), /first-hour charge/);
  const refunded = { ...approved, ...reviewCancellationFields(approved, { decision: 'approve', refundedAmount: 1000 }, 'admin') };
  assert.equal(refunded.paidAmount - refunded.refundedAmount, 300);
  assert.equal(refunded.cancellationReviewNote, 'Guest requested cancellation');
  assert.equal(refunded.cancellationReviewedAt, approved.cancellationReviewedAt);
  const report = buildSalesReport([refunded], [], { from: booking.date, to: booking.date, source: 'booking' });
  assert.equal(report.summary.refunded, 1000);
  assert.equal(report.summary.collected, 300);
  assert.equal(report.summary.outstanding, 0);
});

test('original first-hour payment stays retained after a reschedule changes the hourly rate', () => {
  const booking = reservation(1300, { hourlyRates: [200, 500, 400] });
  assert.equal(cancellationRefundLimit(booking), 1000);
  assert.equal(cancellationRefundLimit(reservation(300, { hourlyRates: [200, 500, 400], firstHourPayment: undefined })), 0);
});

test('venue and verified payment issue exceptions allow a full manual refund with a review note', () => {
  const customerBooking = reservation(1300);
  assert.throws(() => reviewCancellationFields(customerBooking, { decision: 'approve', refundedAmount: 1300, refundException: true }, 'admin'), /Explain/);
  const exception = reviewCancellationFields(customerBooking, { decision: 'approve', refundedAmount: 1300, refundException: true, note: 'Venue closed' }, 'admin');
  assert.equal(exception.cancellationRefundException, true);
  assert.equal(exception.refundedAmount, 1300);
  const venueBooking = reservation(1300, { cancellationStatus: 'None', cancellationSource: 'admin', cancellationRequestedAt: undefined });
  assert.equal(cancellationRefundLimit(venueBooking), 1300);
  assert.equal(reviewCancellationFields(venueBooking, { decision: 'approve', cancellationSource: 'admin' }, 'admin').cancellationSource, 'admin');
});

test('customer payment copy uses the same first-hour deduction before the cancellation request', async () => {
  const { cancellationAmounts } = await import('../../FrontEnd/src/utils/cancellationPolicy.js');
  const full = cancellationAmounts(reservation(1300, { cancellationSource: undefined, cancellationRequestedAt: undefined }), { customerInitiated: true });
  const partial = cancellationAmounts(reservation(300, { cancellationSource: undefined, cancellationRequestedAt: undefined }), { customerInitiated: true });
  assert.equal(full.refundRemaining, 1000);
  assert.equal(partial.refundRemaining, 0);
});

test('a cancelled full-payment receipt shows the manual refund still to arrange', async () => {
  const { getBookingReceiptData } = await import('../../FrontEnd/src/utils/receipt.js');
  const booking = { ...reservation(1300), ...reviewCancellationFields(reservation(1300), { decision: 'approve' }, 'admin') };
  const receipt = getBookingReceiptData(booking);
  assert.equal(receipt.title, 'Reservation Cancelled');
  assert.equal(receipt.costRows.find((row) => row.label === 'Refund to arrange')?.value, 1000);
  assert.equal(receipt.costRows.some((row) => row.label === 'Remaining balance'), false);
});

test('a refund exception receipt does not claim the first hour was retained', async () => {
  const { getBookingReceiptData } = await import('../../FrontEnd/src/utils/receipt.js');
  const booking = { ...reservation(1300), ...reviewCancellationFields(reservation(1300), { decision: 'approve', refundedAmount: 1300, refundException: true, note: 'Venue closed' }, 'admin') };
  const receipt = getBookingReceiptData(booking);
  assert.match(receipt.notes.join(' '), /refund exception was approved/);
  assert.doesNotMatch(receipt.notes.join(' '), /first-hour charge is non-refundable/);
});
