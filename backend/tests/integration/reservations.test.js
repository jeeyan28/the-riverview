const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startDatabase } = require('./setup');
const Room = require('../../model/room');
const Booking = require('../../model/booking');
const Lock = require('../../model/bookingLock');
const Settings = require('../../model/settings');
const User = require('../../model/user');
const Attempt = require('../../model/paymentAttempt');
const Receipt = require('../../model/receiptJob');
const Notification = require('../../model/notification');
const JobLease = require('../../model/jobLease');
const Counter = require('../../model/rateLimitCounter');
const { runInTransaction, validateAndPriceBooking } = require('../../utils/bookingHelper');
const { prepareAttempt, finalizeVerifiedAttempt, verifyPaymongoIntent } = require('../../utils/paymentAttempts');
const { queueReceipt, deliverReceipts } = require('../../utils/receiptOutbox');
const { claimLease, renewLease, releaseLease } = require('../../utils/jobLease');
const { MongoRateLimitStore } = require('../../utils/rateLimitStore');
const { applyVerifiedRefund } = require('../../utils/closureRefunds');
const express = require('express');
const { createHmac, randomUUID } = require('node:crypto');
const { runReservationJobs } = require('../../utils/reservationJobs');
const { withJobDeadline } = require('../../utils/jobDeadline');
const { ensureAuthenticated } = require('../../middleware/adminAuth');

let stop, room;
const users = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
const slot = { date: '2099-01-02', timeIn: '10:00', duration: 2, guestCount: 2, variantLabel: 'Standard', isAdminBooking: false };
before(async () => {
  stop = await startDatabase();
  await Promise.all([Room, Booking, Lock, Settings, User, Attempt, Receipt, Notification, JobLease, Counter].map(model => model.init()));
});
after(async () => { if (stop) await stop(); });
beforeEach(async () => {
  await Promise.all([Room, Booking, Lock, Settings, User, Attempt, Receipt, Notification, JobLease, Counter].map(model => model.deleteMany({})));
  await Settings.create({ _id: 'global', operatingHours: { openTime: '07:00', closeTime: '05:00' } });
  room = await Room.create({ name: 'Demo Billiards', price: 100, variants: [{ label: 'Standard', price: 100, roomCount: 1, pax: '6 guests' }] });
  await User.create(users.map((_id, index) => ({ _id, firstName: 'Demo', lastName: `Customer${index}`, email: `customer${index}@example.test`, googleId: `fixture-${index}`, isActive: true, isVerified: true, role: index === 3 ? 'manager' : 'user' })));
});
async function hold(userId, selection = {}) {
  return runInTransaction(async session => {
    await validateAndPriceBooking({ ...slot, roomId: room._id, ...selection, session });
    const [lock] = await Lock.create([{ room: room._id, ...slot, ...selection, lockedBy: userId, expiresAt: new Date(Date.now() + 1200000) }], { session });
    return lock;
  });
}
async function attemptFor(lock, userId, key = String(lock._id)) {
  const metadata = { guestName: 'Demo Customer', guestEmail: 'demo@example.test', guestContact: '09123456789', roomId: String(room._id), ...slot,
    bookedBy: String(userId), amount: '200', roomCharge: '200', hourlyRates: '[100,100]', downPayment: '100', paymentChoice: 'deposit' };
  const attempt = await prepareAttempt({ provider: 'paymongo', hold: lock, user: { _id: userId }, metadata, clientKey: key });
  await Attempt.updateOne({ _id: attempt._id }, { $set: { providerId: `pi_${lock._id}`, state: 'pending' } });
  return Attempt.findById(attempt._id).select('+metadata');
}
async function existingQueuedRefund(id, actor, note) {
  const record = await Attempt.findById(id);
  record.closureRefund = {
    requestId: 'rv-refund-' + randomUUID(), provider: record.provider, status: 'queued',
    amount: (record.receivedMinor - record.refundedMinor) / 100,
    baseRefundedAmount: record.refundedMinor / 100, requestedAt: new Date(), nextCheckAt: new Date(),
    requestedBy: actor?._id || actor, requestNote: note,
  };
  await record.save();
}

test('capacity-one competing transactions create exactly one hold', async () => {
  const results = await Promise.allSettled([hold(users[0]), hold(users[1])]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'SLOT_FULL');
  assert.equal(await Lock.countDocuments(), 1);
});
test('an unpaid hold creates no reservation or payment and cancellation reopens its slot', async t => {
  const owner = await api(t), other = await api(t, users[1]);
  const selection = { roomId: String(room._id), variantLabel: slot.variantLabel, date: slot.date, timeIn: slot.timeIn, duration: slot.duration };
  const create = base => fetch(base + '/bookings/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) });
  const response = await create(owner);
  assert.equal(response.status, 201);
  const lock = await response.json();
  assert.equal(await Lock.countDocuments(), 1);
  assert.equal(await Booking.countDocuments(), 0);
  assert.equal(await Attempt.countDocuments(), 0);
  assert.equal((await create(other)).status, 409);
  assert.equal((await fetch(other + '/bookings/lock/' + lock.id, { method: 'DELETE' })).status, 404);
  assert.equal(await Lock.countDocuments(), 1);
  assert.equal((await fetch(owner + '/bookings/lock/' + lock.id, { method: 'DELETE' })).status, 200);
  assert.equal(await Lock.countDocuments(), 0);
  assert.equal((await create(other)).status, 201);
  assert.equal(await Booking.countDocuments(), 0);
  assert.equal(await Attempt.countDocuments(), 0);
});

test('successful reservation occupies its slot after the temporary hold is gone', async t => {
  const lock = await hold(users[0]);
  const attempt = await attemptFor(lock, users[0]);
  const confirmed = await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_confirmed_capacity', paymentMethodType: 'gcash' });
  assert.equal((await Booking.findById(confirmed.bookingId)).status, 'Confirmed');
  assert.equal(await Lock.countDocuments(), 0);
  const owner = await api(t);
  assert.equal((await fetch(owner + '/bookings/lock/' + lock._id, { method: 'DELETE' })).status, 404);
  await assert.rejects(hold(users[1]), error => error.code === 'SLOT_FULL');
  assert.equal(await Booking.countDocuments(), 1);
});

test('capacity-many allows two competing units, adjacent times and expired rows', async () => {
  await Room.updateOne({ _id: room._id }, { $set: { 'variants.0.roomCount': 2 } });
  const results = await Promise.allSettled(users.slice(0, 3).map(user => hold(user)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  await hold(users[2], { timeIn: '12:00' });
  await Lock.updateMany({}, { $set: { expiresAt: new Date(0) } });
  await validateAndPriceBooking({ ...slot, roomId: room._id });
});
test('holds exclude their owner, existing bookings exclude by ID, and overnight closures use service dates', async () => {
  await hold(users[0]);
  await validateAndPriceBooking({ ...slot, roomId: room._id, excludeLockUserId: users[0] });
  await assert.rejects(validateAndPriceBooking({ ...slot, roomId: room._id }), error => error.code === 'SLOT_FULL');
  await Settings.updateOne({ _id: 'global' }, { $set: { holidays: [{ date: '2099-01-01', name: 'Demo closure', fullDay: true }] } });
  await assert.rejects(validateAndPriceBooking({ ...slot, roomId: room._id, timeIn: '00:00' }), error => error.code === 'VENUE_CLOSED');
});
test('concurrent provider/browser finalization converges on one booking and receipt job', async () => {
  const lock = await hold(users[0]);
  const attempt = await attemptFor(lock, users[0]);
  const results = await Promise.all([finalizeVerifiedAttempt(attempt, { paymentId: 'pay_demo_one', paymentMethodType: 'gcash' }), finalizeVerifiedAttempt(attempt, { paymentId: 'pay_demo_one', paymentMethodType: 'gcash' })]);
  assert.equal(String(results[0].bookingId), String(results[1].bookingId));
  assert.equal(await Booking.countDocuments(), 1);
  assert.equal(await Receipt.countDocuments(), 1);
  assert.equal((await Attempt.findById(attempt._id)).resolution, 'booked');
});
test('verified paid conflict survives repeated callbacks without duplicating incidents', async () => {
  const lock = await hold(users[0]);
  const attempt = await attemptFor(lock, users[0]);
  await Lock.deleteMany({});
  await hold(users[1]);
  const a = await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_conflict', paymentMethodType: 'gcash' });
  const b = await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_conflict', paymentMethodType: 'gcash' });
  assert.equal(a.status, 'paid_slot_unavailable');
  assert.equal(b.attemptId, a.attemptId);
  assert.equal(await Booking.countDocuments(), 0);
  const incident = await Attempt.findById(attempt._id);
  assert.equal(incident.receivedMinor, 10000);
  assert.equal(incident.events.filter(event => event.action === 'paid_reservation_conflict').length, 1);
  assert.equal(await Notification.countDocuments(), 0);
});
test('provider verification rejects wrong amount, currency, user, intent and payment association', async () => {
  const lock = await hold(users[0]);
  const attempt = await attemptFor(lock, users[0]);
  const intent = { data: { id: attempt.providerId, attributes: { amount: 10000, currency: 'PHP', status: 'succeeded', metadata: { ...attempt.metadata, attemptId: attempt._id }, payments: [{ id: 'pay_verified', attributes: { amount: 10000, currency: 'PHP', status: 'paid', payment_intent_id: attempt.providerId } }] } } };
  assert.equal((await verifyPaymongoIntent(intent, { userId: users[0] })).paidPayment.id, 'pay_verified');
  for (const patch of [{ amount: 10001 }, { currency: 'USD' }, { metadata: { ...intent.data.attributes.metadata, bookedBy: String(users[1]) } }]) {
    await assert.rejects(verifyPaymongoIntent({ data: { ...intent.data, attributes: { ...intent.data.attributes, ...patch } } }));
  }
  await assert.rejects(verifyPaymongoIntent(intent, { userId: users[1] }), error => error.status === 403);
  await assert.rejects(verifyPaymongoIntent({ data: { ...intent.data, id: 'pi_foreign' } }));
});
test('receipt SMTP failure preserves booking, retries and converges across two workers', async () => {
  const attempt = await attemptFor(await hold(users[0]), users[0]);
  const result = await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_receipt', paymentMethodType: 'gcash' });
  const job = await Receipt.findOne({ booking: result.bookingId });
  await deliverReceipts({ send: async () => { throw new Error('SMTP failure'); } });
  assert.equal((await Booking.findById(result.bookingId)).status, 'Confirmed');
  assert.equal((await Receipt.findById(job._id)).state, 'pending');
  await Receipt.updateOne({ _id: job._id }, { $set: { nextAttemptAt: new Date(0) } });
  let sent = 0;
  await Promise.all([deliverReceipts({ send: async () => { sent++; } }), deliverReceipts({ send: async () => { sent++; } })]);
  assert.equal(sent, 1);
  assert.equal((await Receipt.findById(job._id)).state, 'sent');
  await queueReceipt(await Booking.findById(result.bookingId));
  assert.equal(await Receipt.countDocuments(), 1);
});
test('expired receipt lease recovers and exhausted jobs require attention', async () => {
  const attempt = await attemptFor(await hold(users[0]), users[0]);
  await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_crash', paymentMethodType: 'gcash' });
  await Receipt.updateOne({}, { $set: { state: 'sending', leaseToken: 'old-worker', leaseExpiresAt: new Date(0), attempts: 1 } });
  await deliverReceipts({ send: async () => {} });
  assert.equal((await Receipt.findOne()).state, 'sent');
  await Receipt.updateOne({}, { $set: { state: 'pending', attempts: 4, nextAttemptAt: new Date(0) } });
  await deliverReceipts({ send: async () => { throw new Error('SMTP failure'); } });
  assert.equal((await Receipt.findOne()).state, 'attention');
});
test('shared limiter instances atomically count and logically expire windows', async () => {
  let now = new Date('2099-01-01');
  const a = new MongoRateLimitStore('fixture', { now: () => now });
  const b = new MongoRateLimitStore('fixture', { now: () => now });
  a.init({ windowMs: 1000 }); b.init({ windowMs: 1000 });
  const counts = await Promise.all([a.increment('2001:db8::/56'), b.increment('2001:db8::/56')]);
  assert.deepEqual(counts.map(count => count.totalHits).sort(), [1, 2]);
  now = new Date(now.getTime() + 1001);
  assert.equal((await b.increment('2001:db8::/56')).totalHits, 1);
});
test('distributed leases fence old workers after crash/expiry and allow cold-start recovery', async () => {
  const now = new Date('2099-01-01');
  const [a, b] = await Promise.all([claimLease('fixture', { now, leaseMs: 1000 }), claimLease('fixture', { now, leaseMs: 1000 })]);
  const first = a || b;
  assert.equal(Boolean(a) + Boolean(b), 1);
  const after = new Date(now.getTime() + 1001);
  const next = await claimLease('fixture', { now: after, leaseMs: 1000 });
  assert.equal(await renewLease(first, { now: after }), false);
  assert.equal((await releaseLease(first, { now: after })).modifiedCount, 0);
  assert.equal(await renewLease(next, { now: after, leaseMs: 2000 }), true);
});
test('verified unbooked refunds update financial state once and keep an audit trail', async () => {
  const attempt = await attemptFor(await hold(users[0]), users[0]);
  await Lock.deleteMany({}); await hold(users[1]);
  await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_refund', paymentMethodType: 'gcash' });
  await existingQueuedRefund(attempt._id, await User.findById(users[3]), 'Synthetic verified slot conflict');
  let record = await Attempt.findById(attempt._id);
  await Attempt.updateOne({ _id: record._id }, { $set: { 'closureRefund.gatewayAmount': 100, 'closureRefund.paymentId': 'pay_refund' } });
  const response = { data: { id: 'ref_fixture', attributes: { payment_id: 'pay_refund', amount: 10000, currency: 'PHP', status: 'succeeded', metadata: { riverview_refund_request: record.closureRefund.requestId } } } };
  await Promise.all([applyVerifiedRefund(record._id, response, 'paymongo', { kind: 'attempt' }), applyVerifiedRefund(record._id, response, 'paymongo', { kind: 'attempt' })]);
  record = await Attempt.findById(record._id);
  assert.equal(record.refundedMinor, 10000);
  assert.equal(record.resolution, 'refunded');
  assert.ok(record.events.some(event => event.action.includes('refund')));
  await finalizeVerifiedAttempt(await Attempt.findById(record._id).select('+metadata'), { paymentId: 'pay_refund', paymentMethodType: 'gcash' });
  assert.equal(await Booking.countDocuments(), 0);
});

async function api(t, userId = users[0]) {
  const user = await User.findById(userId);
  const app = express();
  app.post('/webhook', express.raw({ type: 'application/json' }), require('../../routes/paymongoRoutes').webhookHandler);
  app.post('/xendit-webhook', express.json(), require('../../routes/xenditRoutes').webhookHandler);
  app.use(express.json());
  app.use((req, res, next) => { req.session = { userId, sessionVersion: user.sessionVersion, cookie: {} }; next(); });
  app.use((req, res, next) => withJobDeadline(Date.now() + 2000, next));
  app.use('/bookings', require('../../routes/bookingRoutes'));
  app.use('/payments', require('../../routes/paymongoRoutes').router);
  app.use('/xendit', require('../../routes/xenditRoutes').router);
  app.use('/monitor-rooms', require('../../routes/monitoringRoutes').roomsRouter);
  app.use((error, req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
function providerFixture(t, send) {
  const request = global.fetch;
  const previous = { PAYMONGO_SECRET_KEY: process.env.PAYMONGO_SECRET_KEY, PAYMONGO_WEBHOOK_SECRET: process.env.PAYMONGO_WEBHOOK_SECRET, XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY, XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN, XENDIT_RETURN_BASE_URL: process.env.XENDIT_RETURN_BASE_URL };
  process.env.PAYMONGO_SECRET_KEY = 'sk_test_local_fixture_only';
  process.env.PAYMONGO_WEBHOOK_SECRET = 'local-fixture-signing-secret';
  process.env.XENDIT_SECRET_KEY = 'local-fixture-fallback-only';
  process.env.XENDIT_WEBHOOK_TOKEN = 'local-fixture-callback-only';
  process.env.XENDIT_RETURN_BASE_URL = 'https://example.test';
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  t.mock.method(global, 'fetch', (url, options) => String(url).startsWith('http://127.0.0.1:') ? request(url, options) : send(String(url), options));
}
const checkout = () => ({ ...slot, roomId: String(room._id), guestName: 'Synthetic Customer', guestContact: '09123456789', guestEmail: 'customer@example.test', paymentChoice: 'deposit', attemptKey: randomUUID() });
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
function sign(body) { const timestamp = String(Math.floor(Date.now() / 1000)); return `t=${timestamp},te=${createHmac('sha256', 'local-fixture-signing-secret').update(`${timestamp}.${body}`).digest('hex')}`; }

for (const accepted of [false, true]) test(`uncertain provider POST ${accepted ? 'after acceptance' : 'before acceptance'} preserves identity and prevents fallback/repeated charges`, async t => {
  const origin = await api(t), payload = checkout(); await hold(users[0]);
  let writes = 0, fallback = 0, remote;
  providerFixture(t, (url, options) => {
    if (url.includes('xendit')) { fallback++; throw new Error('Fallback is forbidden after an uncertain write'); }
    assert.equal(options.method, 'POST'); writes++;
    if (accepted) remote = JSON.parse(options.body).data.attributes.metadata.attemptId;
    return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Fixture connection lost', 'AbortError')), { once: true }));
  });
  const post = () => fetch(`${origin}/payments/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const first = await post(); assert.equal(first.status, 202);
  const data = await first.json(), attempt = await Attempt.findById(data.attemptId);
  assert.equal(attempt.state, 'uncertain'); assert.equal(attempt.clientKey, payload.attemptKey);
  if (accepted) assert.equal(remote, data.attemptId);
  const retry = await post(); assert.equal(retry.status, 202); assert.equal((await retry.json()).attemptId, data.attemptId);
  assert.equal(writes, 1); assert.equal(fallback, 0); assert.equal(await Attempt.countDocuments(), 1);
});

test('provider creation/save gap recovers from a verified return and concurrent authenticated callbacks', async t => {
  const origin = await api(t), payload = checkout(); await hold(users[0]);
  let metadata, writes = 0;
  providerFixture(t, (url, options) => {
    if (options.method === 'POST') { writes++; metadata = JSON.parse(options.body).data.attributes.metadata; return json({ data: { id: 'pi_save_gap', attributes: { client_key: 'synthetic-client-token' } } }); }
    assert.match(url, /payment_intents\/pi_save_gap$/);
    return json({ data: { id: 'pi_save_gap', attributes: { metadata, currency: 'PHP', amount: 10000, status: 'succeeded', payments: [{ id: 'pay_save_gap', attributes: { currency: 'PHP', amount: 10000, status: 'paid', payment_intent_id: 'pi_save_gap' } }] } } });
  });
  const update = Attempt.updateOne;
  let gap = true;
  t.mock.method(Attempt, 'updateOne', function (...args) { if (gap && args[1].$set?.providerId === 'pi_save_gap') { gap = false; throw new Error('Fixture database acknowledgment lost'); } return update.apply(this, args); });
  const response = await fetch(`${origin}/payments/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal(response.status, 202); const data = await response.json();
  assert.equal((await Attempt.findById(data.attemptId)).providerId ?? null, null);
  const returned = await fetch(`${origin}/payments/status/pi_save_gap`); assert.equal(returned.status, 200);
  const event = JSON.stringify({ data: { attributes: { type: 'payment_intent.succeeded', data: { id: 'pi_save_gap' } } } });
  const callback = () => fetch(`${origin}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': sign(event) }, body: event });
  const callbacks = await Promise.all([callback(), callback()]); assert.ok(callbacks.every(result => result.status === 200));
  assert.equal(writes, 1); assert.equal(await Booking.countDocuments(), 1); assert.equal(await Receipt.countDocuments(), 1);
  assert.equal((await Attempt.findById(data.attemptId)).providerId, 'pi_save_gap');
  const invalid = await fetch(`${origin}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': 'incorrect' }, body: event });
  assert.equal(invalid.status, 400);
});

test('a webhook arriving before the browser return converges and a persistence failure is retryable', async t => {
  const origin = await api(t), attempt = await attemptFor(await hold(users[0]), users[0]);
  const intent = { data: { id: attempt.providerId, attributes: { metadata: { ...attempt.metadata, attemptId: attempt._id }, currency: 'PHP', amount: 10000, status: 'succeeded', payments: [{ id: 'pay_webhook_first', attributes: { amount: 10000, currency: 'PHP', status: 'paid' } }] } } };
  providerFixture(t, () => json(intent));
  const event = JSON.stringify({ data: { attributes: { type: 'payment_intent.succeeded', data: { id: attempt.providerId } } } });
  const callback = () => fetch(`${origin}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Paymongo-Signature': sign(event) }, body: event });
  const original = Receipt.findOneAndUpdate; let fail = true;
  t.mock.method(Receipt, 'findOneAndUpdate', function (...args) { if (fail) { fail = false; throw new Error('Fixture outbox persistence failure'); } return original.apply(this, args); });
  assert.equal((await callback()).status, 500); assert.equal(await Booking.countDocuments(), 0);
  assert.equal((await callback()).status, 200);
  const returned = await fetch(`${origin}/payments/status/${attempt.providerId}`); assert.equal(returned.status, 200);
  assert.equal(await Booking.countDocuments(), 1); assert.equal(await Receipt.countDocuments(), 1);
});

test('Xendit creation, authenticated duplicate callbacks and browser return converge on one financial outcome', async t => {
  const origin = await api(t); await hold(users[0]); let reference, writes = 0;
  providerFixture(t, (url, options) => {
    if (options.method === 'POST') {
      writes++; reference = JSON.parse(options.body).reference_id;
      return json({ payment_session_id: 'ps_synthetic', reference_id: reference, payment_link_url: 'https://checkout.xendit.co/synthetic-fixture' });
    }
    if (url.includes('/sessions/')) return json({ payment_session_id: 'ps_synthetic', reference_id: reference, payment_request_id: 'pr_synthetic', payment_id: 'pay_xendit', amount: 100, currency: 'PHP', session_type: 'PAY', status: 'COMPLETED' });
    return json({ payment_id: 'pay_xendit', payment_request_id: 'pr_synthetic', request_amount: 100, currency: 'PHP', type: 'PAY', status: 'SUCCEEDED', channel_code: 'GCASH' });
  });
  delete process.env.PAYMONGO_SECRET_KEY;
  const created = await fetch(`${origin}/payments/intent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checkout()) });
  assert.equal(created.status, 201); assert.equal((await created.json()).gateway, 'xendit');
  const event = JSON.stringify({ event: 'payment_session.completed', data: { payment_session_id: 'ps_synthetic', reference_id: reference } });
  const callback = token => fetch(`${origin}/xendit-webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-callback-token': token }, body: event });
  assert.equal((await callback('incorrect')).status, 401);
  const results = await Promise.all([callback('local-fixture-callback-only'), callback('local-fixture-callback-only'), fetch(`${origin}/xendit/status/${reference}`)]);
  assert.ok(results.every(result => result.status === 200)); assert.equal(writes, 1); assert.equal(await Booking.countDocuments(), 1); assert.equal(await Receipt.countDocuments(), 1);
});

test('recovery refuses to bind a foreign provider ID to an uncertain original attempt', async () => {
  const attempt = await attemptFor(await hold(users[0]), users[0]);
  await Attempt.updateOne({ _id: attempt._id }, { $set: { providerId: null, state: 'uncertain' } });
  await assert.rejects(verifyPaymongoIntent({ data: { id: 'pi_foreign', attributes: { amount: 99999, currency: 'USD', metadata: { attemptId: attempt._id, bookedBy: String(users[1]) } } } }));
  assert.equal((await Attempt.findById(attempt._id)).providerId, null);
});

test('historical paid PayMongo callbacks retain one payment record without inventing a booking', async () => {
  const original = await attemptFor(await hold(users[0]), users[0]);
  await Attempt.deleteMany({});
  const intent = { data: { id: original.providerId, attributes: { amount: 10000, currency: 'PHP', status: 'succeeded', metadata: original.metadata, payments: [{ id: 'pay_legacy', attributes: { amount: 10000, currency: 'PHP', status: 'paid', payment_intent_id: original.providerId } }] } } };
  const verified = await Promise.all([verifyPaymongoIntent(intent), verifyPaymongoIntent(intent)]);
  assert.equal(verified[0].attempt._id, verified[1].attempt._id);
  await Promise.all(verified.map(value => finalizeVerifiedAttempt(value.attempt, { paymentId: 'pay_legacy', paymentMethodType: 'gcash' })));
  assert.equal(await Booking.countDocuments(), 0); assert.equal(await Attempt.countDocuments(), 1); assert.equal(await Notification.countDocuments(), 0);
  assert.equal((await Attempt.findOne()).issue, 'paid_unbooked');
  await assert.rejects(verifyPaymongoIntent(intent, { userId: users[1] }), error => error.status === 403);
});

test('historical booked PayMongo callbacks preserve the existing ledger and receipt', async () => {
  const original = await attemptFor(await hold(users[0]), users[0]);
  const result = await finalizeVerifiedAttempt(original, { paymentId: 'pay_legacy_booked', paymentMethodType: 'gcash' });
  await Attempt.deleteMany({});
  const intent = { data: { id: original.providerId, attributes: { amount: 10000, currency: 'PHP', status: 'succeeded', metadata: original.metadata, payments: [{ id: 'pay_legacy_booked', attributes: { amount: 10000, currency: 'PHP', status: 'paid', payment_intent_id: original.providerId } }] } } };
  const imported = await verifyPaymongoIntent(intent);
  const repeated = await finalizeVerifiedAttempt(imported.attempt, { paymentId: 'pay_legacy_booked', paymentMethodType: 'gcash' });
  assert.equal(String(repeated.bookingId), String(result.bookingId)); assert.equal(await Booking.countDocuments(), 1); assert.equal(await Receipt.countDocuments(), 1);
  assert.equal((await Booking.findById(result.bookingId)).paidAmount, 100); assert.equal(imported.attempt.resolution, 'booked');
});

test('a monitor database lookup failure remains a recoverable service error', async t => {
  const origin = await api(t, users[3]);
  t.mock.method(require('../../model/monitoring').MonitorRoom, 'findById', async () => { throw new Error('Fixture lookup unavailable'); });
  const response = await fetch(`${origin}/monitor-rooms/${room._id}`);
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'ROOM_UNAVAILABLE');
});

test('refresh resumes only the original unpaid checkout with a live hold and unchanged quote', async t => {
  const origin = await api(t), attempt = await attemptFor(await hold(users[0]), users[0]);
  let reads = 0;
  providerFixture(t, (_url, options) => {
    assert.equal(options.method, 'GET'); reads++;
    return json({ data: { id: attempt.providerId, attributes: { amount: 10000, currency: 'PHP', status: 'awaiting_payment_method', client_key: 'synthetic-client-token', metadata: { ...attempt.metadata, attemptId: attempt._id }, payments: [] } } });
  });
  const response = await fetch(`${origin}/payments/attempts/${attempt._id}`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.resume.checkout.paymentIntentId, attempt.providerId);
  assert.equal(data.resume.checkout.clientKey, 'synthetic-client-token');
  assert.equal(data.resume.draft.serviceDate, slot.date);
  assert.equal(String(data.resume.hold.id), String(attempt.hold));
  await Room.updateOne({ _id: room._id }, { $set: { 'variants.0.price': 150 } });
  assert.equal((await (await fetch(`${origin}/payments/attempts/${attempt._id}`)).json()).resume, null);
  await Lock.deleteMany({});
  assert.equal((await (await fetch(`${origin}/payments/attempts/${attempt._id}`)).json()).resume, null);
  assert.equal(reads, 3); assert.equal(await Attempt.countDocuments(), 1); assert.equal(await Booking.countDocuments(), 0);
  const stranger = await api(t, users[1]);
  assert.equal((await fetch(`${stranger}/payments/attempts/${attempt._id}`)).status, 404);
});

test('scheduler simultaneous runs serialize and a failed stage does not block independent work', async () => {
  let start, finish; const started = new Promise(resolve => { start = resolve; }), blocked = new Promise(resolve => { finish = resolve; });
  const first = runReservationJobs({ stages: [['fixture', async () => { start(); await blocked; return { processed: 1 }; }]] });
  await started;
  assert.equal((await runReservationJobs({ stages: [] })).status, 'already_running'); finish(); assert.equal((await first).status, 'completed');
  let later = false;
  await assert.rejects(runReservationJobs({ stages: [['broken', async () => { throw new Error('Fixture failure'); }], ['independent', async () => { later = true; return 2; }]] }), error => error.result.status === 'partial_failure' && error.result.failedStages.includes('broken'));
  assert.equal(later, true); assert.equal((await JobLease.findById('reservations')).status, 'partial_failure');
  assert.equal((await runReservationJobs({ stages: [] })).status, 'completed');
});



test('password, role and active-status changes invalidate real stored account sessions', async () => {
  for (const [field, value] of [['password', 'SyntheticChanged2026!'], ['role', 'staff'], ['isActive', false]]) {
    const user = await User.findById(users[0]); const version = user.sessionVersion;
    user[field] = value; await user.save(); assert.notEqual(user.sessionVersion, version);
    const status = await new Promise(resolve => ensureAuthenticated({ session: { userId: user._id, sessionVersion: version, destroy: done => done() } }, { status: code => ({ json: () => resolve(code) }) }, () => resolve(200)));
    assert.equal(status, 401);
  }
});

test('customer checkout status is authenticated and scoped to the original owner', async t => {
  const attempt = await attemptFor(await hold(users[0]), users[0], randomUUID());
  await Attempt.updateOne({ _id: attempt._id }, { $set: { state: 'failed' } });
  const owner = await api(t, users[0]), other = await api(t, users[1]);
  for (const route of ['/payments/attempts/' + attempt._id, '/payments/attempts/client/' + attempt.clientKey]) {
    const response = await fetch(owner + route);
    assert.equal(response.status, 200);
    const outcome = await response.json();
    assert.equal(outcome.status, 'failed'); assert.equal(outcome.attemptId, attempt._id);
    assert.equal(outcome.metadata, undefined); assert.equal(outcome.providerId, undefined);
    assert.equal((await fetch(other + route)).status, 404);
  }
  assert.equal((await fetch(owner + '/payments/attempts/client/invalid')).status, 400);
  assert.equal((await fetch(owner + '/payments/attempts/invalid')).status, 400);
  const user = await User.findById(users[0]); user.isActive = false; await user.save();
  assert.equal((await fetch(owner + '/payments/attempts/' + attempt._id)).status, 401);
  assert.equal(await Attempt.countDocuments(), 1); assert.equal(await Booking.countDocuments(), 0);
});

test('an ambiguous accepted refund is reconciled before another submission and updates the ledger once', async t => {
  const attempt = await attemptFor(await hold(users[0]), users[0]); await Lock.deleteMany({}); await hold(users[1]);
  await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_ambiguous_refund', paymentMethodType: 'gcash' });
  await existingQueuedRefund(attempt._id, await User.findById(users[3]), 'Synthetic paid slot conflict');
  let writes = 0, refund;
  providerFixture(t, (url, options) => {
    if (url.includes('/payment_intents/')) return json({ data: { id: attempt.providerId, attributes: { payments: [{ id: 'pay_ambiguous_refund', attributes: { status: 'paid' } }] } } });
    if (url.includes('/payments/')) return json({ data: { id: 'pay_ambiguous_refund', attributes: { amount: 10000, currency: 'PHP', status: 'paid' } } });
    if (options.method === 'POST' && url.endsWith('/refunds')) {
      writes++; const attributes = JSON.parse(options.body).data.attributes;
      refund = { id: 'ref_ambiguous', attributes: { ...attributes, currency: 'PHP', status: 'succeeded' } };
      return Promise.reject(new TypeError('Fixture provider accepted the refund, then disconnected'));
    }
    if (url.includes('/refunds?')) return json({ data: refund ? [refund] : [], has_more: false });
    throw new Error(`Unexpected fixture request: ${url}`);
  });
  const { processClosureRefund } = require('../../utils/closureRefunds');
  await processClosureRefund(attempt._id, { kind: 'attempt' });
  assert.equal((await Attempt.findById(attempt._id)).closureRefund.status, 'review_required');
  await processClosureRefund(attempt._id, { kind: 'attempt', force: true });
  await processClosureRefund(attempt._id, { kind: 'attempt', force: true });
  const record = await Attempt.findById(attempt._id);
  assert.equal(writes, 1); assert.equal(record.refundedMinor, 10000); assert.equal(record.resolution, 'refunded');
});

test('a crashed receipt worker cannot overwrite a later delivery claim', async () => {
  const attempt = await attemptFor(await hold(users[0]), users[0]); await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_fenced_receipt', paymentMethodType: 'gcash' });
  let started, accepted; const sending = new Promise(resolve => { started = resolve; }), delayed = new Promise(resolve => { accepted = resolve; });
  const old = deliverReceipts({ limit: 1, send: async () => { started(); await delayed; } }); await sending;
  await Receipt.updateOne({}, { $set: { leaseExpiresAt: new Date(0) } });
  await deliverReceipts({ limit: 1, send: async () => {} }); const newer = await Receipt.findOne();
  accepted(); await old; const final = await Receipt.findOne();
  assert.equal(final.state, 'sent'); assert.equal(final.sentAt.getTime(), newer.sentAt.getTime());
  assert.equal(final.history.filter(event => event.action === 'sent').length, 1);
});

test('refund status checks never submit; only an unsubmitted preflight can be retried', async t => {
  const attempt = await attemptFor(await hold(users[0]), users[0]);
  await Lock.deleteMany({}); await hold(users[1]);
  await finalizeVerifiedAttempt(attempt, { paymentId: 'pay_retry_safely', paymentMethodType: 'gcash' });
  await existingQueuedRefund(attempt._id, users[3], 'Synthetic preflight recovery');
  let failPreflight = true, writes = 0;
  providerFixture(t, (url, options) => {
    if (options.method === 'POST') {
      writes++; const fields = JSON.parse(options.body).data.attributes;
      return json({ data: { id: 'ref_retry_safely', attributes: { ...fields, currency: 'PHP', status: 'succeeded' } } });
    }
    if (failPreflight) return new Response(JSON.stringify({ errors: [{ detail: 'Synthetic rejected preflight' }] }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    if (url.includes('/refunds?')) return json({ data: [], has_more: false });
    if (url.includes('/payments/pay_retry_safely')) return json({ data: { id: 'pay_retry_safely', attributes: { status: 'paid', amount: 10000, currency: 'PHP', payment_intent_id: attempt.providerId } } });
    assert.ok(url.includes('/payment_intents/'));
    return json({ data: { id: attempt.providerId, attributes: { amount: 10000, currency: 'PHP', payments: [{ id: 'pay_retry_safely', attributes: { status: 'paid', amount: 10000 } }] } } });
  });
  const engine = require('../../utils/closureRefunds');
  await engine.processClosureRefund(attempt._id, { kind: 'attempt', readOnly: true });
  assert.equal((await Attempt.findById(attempt._id)).closureRefund.status, 'queued'); assert.equal(writes, 0);
  await engine.processClosureRefund(attempt._id, { kind: 'attempt' });
  const unsubmitted = await Attempt.findById(attempt._id);
  assert.equal(unsubmitted.closureRefund.submissionStartedAt, undefined); assert.equal(writes, 0);
  failPreflight = false;
  await engine.retryUnsubmittedClosureRefund(attempt._id, { kind: 'attempt', actor: await User.findById(users[3]) });
  assert.equal((await Attempt.findById(attempt._id)).refundedMinor, 10000); assert.equal(writes, 1);
  await assert.rejects(engine.retryUnsubmittedClosureRefund(attempt._id, { kind: 'attempt' }), error => error.status === 409);
});
