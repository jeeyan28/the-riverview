const { test } = require('node:test');
const assert = require('node:assert/strict');
const paymongo = require('../utils/paymongo');
const xendit = require('../utils/xendit');
const { buildNotificationEmail } = require('../utils/mailer');
const { notificationCopy } = require('../utils/reservationNotifications');

test('PayMongo refund sends centavos, original payment ID and a persistent request marker', async () => {
  const original = global.fetch;
  const originalKey = process.env.PAYMONGO_SECRET_KEY;
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture';
  let seen;
  global.fetch = async (url, options) => {
    seen = { url, options };
    return { ok: true, text: async () => JSON.stringify({ data: { id: 'ref_test' } }) };
  };
  try {
    await paymongo.createRefund({ paymentId: 'pay_original', amount: 300.25, requestId: 'rv-closure-test' });
    assert.equal(seen.url, 'https://api.paymongo.com/v1/refunds');
    assert.equal(seen.options.method, 'POST');
    const attrs = JSON.parse(seen.options.body).data.attributes;
    assert.equal(attrs.amount, 30025); assert.equal(attrs.payment_id, 'pay_original');
    assert.equal(attrs.metadata.riverview_refund_request, 'rv-closure-test'); assert.equal(attrs.reason, 'others');
  } finally { global.fetch = original; if (originalKey === undefined) delete process.env.PAYMONGO_SECRET_KEY; else process.env.PAYMONGO_SECRET_KEY = originalKey; }
});

test('PayMongo never automatically retries an ambiguous refund POST', async () => {
  const original = global.fetch;
  const originalKey = process.env.PAYMONGO_SECRET_KEY;
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture';
  let calls = 0;
  global.fetch = async () => { calls++; throw new TypeError('Connection lost after submission'); };
  try {
    await assert.rejects(paymongo.createRefund({ paymentId: 'pay_original', amount: 300, requestId: 'rv-closure-test' }), /Connection lost/);
    assert.equal(calls, 1);
  } finally { global.fetch = original; if (originalKey === undefined) delete process.env.PAYMONGO_SECRET_KEY; else process.env.PAYMONGO_SECRET_KEY = originalKey; }
});

test('PayMongo refund preflight verifies the saved intent, captured payment and original gross deposit', async () => {
  const original = global.fetch;
  const originalKey = process.env.PAYMONGO_SECRET_KEY;
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture';
  let wrongAmount = false;
  global.fetch = async url => {
    const data = url.endsWith('/payment_intents/pi_original')
      ? { id: 'pi_original', attributes: { payments: [{ id: 'pay_original', attributes: { status: 'paid' } }] } }
      : { id: 'pay_original', attributes: { currency: 'PHP', status: 'paid', amount: wrongAmount ? 31000 : 30025 } };
    return { ok: true, text: async () => JSON.stringify({ data }) };
  };
  try {
    const booking = { paymongoPaymentIntentId: 'pi_original', paymongoPaymentId: 'pay_original', downPayment: 300.25 };
    assert.deepEqual(await paymongo.getRefundPayment(booking), { paymentId: 'pay_original', amount: 300.25 });
    wrongAmount = true;
    await assert.rejects(paymongo.getRefundPayment(booking), /does not match/);
    await assert.rejects(paymongo.getRefundPayment({ ...booking, paymongoPaymentId: 'pay_another' }), /No verified payment/);
  } finally { global.fetch = original; if (originalKey === undefined) delete process.env.PAYMONGO_SECRET_KEY; else process.env.PAYMONGO_SECRET_KEY = originalKey; }
});

test('PayMongo refund history uses supported filters and follows pagination for the original payment only', async () => {
  const original = global.fetch;
  const originalKey = process.env.PAYMONGO_SECRET_KEY;
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_fixture';
  const requests = [];
  global.fetch = async (url, options) => {
    const query = new URL(url).searchParams;
    requests.push({ query, method: options.method });
    assert.equal(query.get('payment_id'), 'pay_original');
    assert.equal(query.get('limit'), '100');
    assert.equal([...query.keys()].some(key => key.startsWith('data')), false);
    const second = query.has('after');
    return { ok: true, text: async () => JSON.stringify({
      data: [{ id: second ? 'ref_second' : 'ref_first', attributes: { payment_id: 'pay_original', status: 'succeeded', amount: 10000 } }], has_more: !second,
    }) };
  };
  try {
    const refunds = await paymongo.listRefunds('pay_original');
    assert.deepEqual(refunds.map(item => item.id), ['ref_first', 'ref_second']);
    assert.equal(requests.length, 2); assert.equal(requests[1].query.get('after'), 'ref_first');
    assert.equal(requests.every(request => request.method === 'GET'), true);
    global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ data: [{ id: 'ref_foreign', attributes: { payment_id: 'pay_another' } }] }) });
    await assert.rejects(paymongo.listRefunds('pay_original'), /does not match the original payment/);
  } finally { global.fetch = original; if (originalKey === undefined) delete process.env.PAYMONGO_SECRET_KEY; else process.env.PAYMONGO_SECRET_KEY = originalKey; }
});

test('online refund confirmations distinguish the processing estimate from wallet posting time and omit cash instructions', () => {
  const booking = { reservationCode: 'BIL-TEST', paymentProvider: 'paymongo', paymentMethod: 'GCash', closureRefund: { provider: 'paymongo', amount: 150 } };
  const copy = notificationCopy(booking, 'refund_processing');
  const email = buildNotificationEmail({ type: 'refund_processing', ...copy, reservationCode: booking.reservationCode, details: { refundAmount: 150, paymentMethod: 'GCash' } });
  assert.match(email.text, /30–60 minutes/); assert.match(email.text, /estimate; payment provider checks may take longer/);
  assert.match(email.text, /within 24 hours after the provider processes/);
  assert.match(email.text, /separate from the processing estimate/); assert.match(email.text, /original GCash/);
  assert.doesNotMatch(copy.message, /cash|manual|staff|assistance/);
  assert.match(email.html, /₱150.00/); assert.match(email.html, /cid:riverview-notification-logo/);
  const mixed = notificationCopy({ ...booking, downPayment: 150, closureRefund: { provider: 'paymongo', amount: 300, baseRefundedAmount: 0 } }, 'refund_processing');
  assert.match(mixed.message, /₱150.00 will be returned through your original GCash/);
  assert.match(mixed.message, /remaining ₱150.00 paid separately/); assert.match(mixed.message, /applies to the online portion/);
  const manual = notificationCopy({ ...booking, closureRefund: { provider: 'manual', amount: 150 } }, 'refund_processing');
  assert.match(manual.message, /confirm the timing with you/); assert.doesNotMatch(manual.message, /30–60|24 hours|original GCash/);
  const unpaid = notificationCopy({ ...booking, closureRefund: { amount: 0 } }, 'refund_processing');
  assert.equal(unpaid.title, 'Reservation cancelled'); assert.doesNotMatch(unpaid.message, /30–60|24 hours/);
});

test('Xendit refund sends pesos, original payment request and the stable idempotency key', async () => {
  const original = global.fetch; let seen;
  global.fetch = async (url, options) => { seen = { url, options }; return { ok: true, json: async () => ({ id: 'rfd_test' }) }; };
  try {
    await xendit.createRefund({ paymentRequestId: 'pr_original', amount: 300.25, requestId: 'rv-closure-test' });
    assert.equal(seen.url, 'https://api.xendit.co/refunds');
    const body = JSON.parse(seen.options.body);
    assert.equal(body.amount, 300.25); assert.equal(body.currency, 'PHP'); assert.equal(body.payment_request_id, 'pr_original');
    assert.equal(body.reference_id, 'rv-closure-test'); assert.equal(seen.options.headers['idempotency-key'], body.reference_id);
  } finally { global.fetch = original; }
});

test('reservation notification emails escape staff copy and use the sign-in protected reservation link', () => {
  const original = process.env.APP_PUBLIC_URL;
  process.env.APP_PUBLIC_URL = 'https://riverview.example.test';
  try {
    const email = buildNotificationEmail({ title: 'Closure <notice>', message: 'A <script>alert(1)</script> & a "note"', reservationCode: 'BIL-123' });
    assert.ok(email.html.includes('Closure &lt;notice&gt;'));
    assert.equal(email.html.includes('<script>'), false);
    assert.ok(email.html.includes('reservation=BIL-123&amp;action=closure'));
    assert.ok(email.text.includes('https://riverview.example.test/?reservation=BIL-123&action=closure'));
    assert.ok(email.html.includes('cid:riverview-notification-logo'));
    assert.equal(email.attachments[0].cid, 'riverview-notification-logo');
    assert.ok(Buffer.isBuffer(email.attachments[0].content));
    assert.ok(email.attachments[0].content.length > 0);
  } finally { if (original === undefined) delete process.env.APP_PUBLIC_URL; else process.env.APP_PUBLIC_URL = original; }
});

test('closure emails show the reservation snapshot and escape personal and holiday details', () => {
  const email = buildNotificationEmail({ type: 'closure', title: 'Venue closed', message: 'Closure notice', reservationCode: 'BIL-TEST', details: {
    guestName: '<img src=x>', roomLabel: 'Billiards', variantLabel: 'VIP', date: '2026-12-25', timeIn: '13:00', duration: 2,
    closureDate: '2026-12-25', closureName: 'Christmas <Day>', closureNote: 'A & B', refundAmount: 300, paymentMethod: 'GCash',
  } });
  assert.ok(email.html.includes('December 25, 2026')); assert.ok(email.html.includes('₱300.00')); assert.ok(email.html.includes('1:00 PM'));
  assert.ok(email.html.includes('Christmas &lt;Day&gt;')); assert.ok(email.html.includes('&lt;img src=x&gt;'));
  assert.ok(email.html.includes('Choose reschedule or refund')); assert.equal(email.html.includes('<img src=x>'), false);
  assert.ok(email.text.includes('Full refund available: ₱300.00'));
});
