const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReceiptEmail } = require('../utils/mailer');

test('emailed receipt uses the image receipt sections and full-payment totals', () => {
  const { html, text } = buildReceiptEmail({
    reservationCode: 'COU-100',
    guestName: 'Alex & Sam',
    guestContact: '09123456789',
    guestEmail: 'alex@example.com',
    guestCount: 2,
    roomLabel: 'Court',
    variantLabel: 'Standard',
    date: '2026-09-24',
    timeIn: '10:00',
    duration: 1,
    amount: 350,
    downPayment: 350,
    paidAmount: 350,
  });

  assert.match(html, /background-color:#0b7067/);
  assert.match(html, /background-color:#e9f8f5/);
  assert.match(html, /background-color:#f1f6f5/);
  assert.match(html, /RESERVATION CODE/);
  assert.match(html, /COU-100/);
  assert.match(html, /Alex &amp; Sam/);
  assert.match(text, /Paid online: ₱350/);
  assert.match(text, /Remaining balance: ₱0/);
  assert.doesNotMatch(text, /Paid later:/);
});
