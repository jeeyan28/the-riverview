const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReceiptEmail } = require('../utils/mailer');

test('one-hour reservation email links to the online actions and tells staff to settle its room discount at the venue', () => {
  const previous = process.env.APP_PUBLIC_URL;
  process.env.APP_PUBLIC_URL = 'https://theriverview.example';
  try {
    const { html, text } = buildReceiptEmail({
      reservationCode: 'BIL-123', date: '2026-09-26', timeIn: '10:00', duration: 1,
      amount: 150, downPayment: 150, paidAmount: 150,
      paymentChoice: 'deposit', eligibleDiscount: 30,
      roomLabel: 'Billiards', variantLabel: 'Shared Room',
    });
    assert.match(html, /Reservation Policy &amp; Important Reminder/);
    assert.match(html, /reservation=BIL-123&amp;action=reschedule/);
    assert.match(html, /reservation=BIL-123&amp;action=cancel/);
    assert.match(html, /Room discount ₱30 is due back to the guest at the facility/);
    assert.match(text, /Room discount ₱30 is due back to the guest at the facility/);
  } finally {
    if (previous === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = previous;
  }
});
