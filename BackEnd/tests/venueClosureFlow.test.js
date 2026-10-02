const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../model/booking');
const Settings = require('../model/settings');
const User = require('../model/user');
const Room = require('../model/room');
const BookingLock = require('../model/bookingLock');
const Notification = require('../model/notification');
const AuditLog = require('../model/auditLog');
const { RoomSession } = require('../model/monitoring');
const mailer = require('../utils/mailer');
const paymongo = require('../utils/paymongo');
const xendit = require('../utils/xendit');

const ownerId = '507f1f77bcf86cd799439011';
const otherId = '507f1f77bcf86cd799439012';
const staffId = '507f1f77bcf86cd799439013';
const roomId = '507f1f77bcf86cd799439014';
const restores = [];
let bookings, notifications, settings, paidRefunds, createdRefunds, emails, failure, refundStatus, server, base;
let emailFailure, postEntered, releasePost;

function stub(target, key, value) {
  const original = target[key]; target[key] = value;
  restores.push(() => { target[key] = original; });
}

function get(object, path) { return path.split('.').reduce((value, key) => value?.[key], object); }
function set(object, path, value) {
  const keys = path.split('.'); const last = keys.pop();
  let current = object;
  for (const key of keys) current = current[key] || (current[key] = {});
  current[last] = value;
}
function matches(object, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some(item => matches(object, item));
    const value = get(object, key);
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof mongoose.Types.ObjectId)) {
      if ('$in' in expected) return expected.$in.some(item => String(item) === String(value));
      if ('$ne' in expected) return String(value) !== String(expected.$ne);
      if ('$lte' in expected) return value != null && value <= expected.$lte;
      if ('$exists' in expected) return (value !== undefined && value !== null) === expected.$exists;
    }
    return expected === null ? value == null : String(value) === String(expected);
  });
}
function update(object, changes) {
  Object.entries(changes.$set || changes).forEach(([key, value]) => { if (!key.startsWith('$')) set(object, key, value); });
  Object.entries(changes.$inc || {}).forEach(([key, value]) => set(object, key, Number(get(object, key) || 0) + value));
  return object;
}
function query(value) {
  let fields;
  return {
    session() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; },
    select(selection) { fields = selection; return this; },
    lean: async () => Array.isArray(value) ? value.map(item => fields ? Object.fromEntries(['_id', ...fields.split(' ')].map(key => [key, get(item, key)])) : item) : value,
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
  };
}
function makeBooking(fields = {}) {
  const booking = new Booking({
    reservationCode: `BIL-${bookings.length + 1}`, guestName: 'Test Customer', guestEmail: 'customer@example.test', guestContact: '09123456789',
    room: roomId, roomLabel: 'Billiards', date: '2099-12-24', timeIn: '13:00', duration: 2,
    status: 'Confirmed', amount: 600, paidAmount: 300, downPayment: 300, firstHourPayment: 300,
    paymentProvider: 'paymongo', paymentMethod: 'GCash', paymongoPaymentIntentId: 'pi_test', paymongoPaymentId: 'pay_test',
    bookedBy: ownerId, hourlyRates: [300, 300], ...fields,
  });
  bookings.push(booking); return booking;
}
function reset() {
  bookings = []; notifications = []; paidRefunds = []; createdRefunds = []; emails = [];
  settings = new Settings({ _id: 'global', operatingHours: { openTime: '07:00', closeTime: '02:00', openDays: [0,1,2,3,4,5,6] } });
  failure = ''; refundStatus = 'succeeded';
  emailFailure = false; postEntered = null; releasePost = null;
}
function refundResponse(args, status = refundStatus) {
  return { data: { id: 'ref_test', type: 'refund', attributes: { amount: Math.round(args.amount * 100), currency: 'PHP', payment_id: args.paymentId, status, metadata: { riverview_refund_request: args.requestId } } } };
}
const put = (path, body = {}, user = ownerId) => fetch(`${base}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, body: JSON.stringify(body) });
const post = (path, body, user = staffId) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': user }, body: JSON.stringify(body) });

before(async () => {
  stub(mongoose, 'startSession', async () => ({ withTransaction: async work => work(), endSession() {} }));
  stub(mailer, 'sendNotificationEmail', async notification => {
    if (emailFailure) throw Object.assign(new Error('SMTP temporary failure'), { code: 'ETIMEDOUT' });
    emails.push(notification.eventKey);
  });
  stub(Settings, 'getSingleton', async () => settings);
  stub(Settings.prototype, 'save', async function () { return this; });
  stub(Booking.prototype, 'save', async function () { return this; });
  stub(Booking, 'findById', id => query(bookings.find(item => String(item._id) === String(id)) || null));
  stub(Booking, 'findOne', filter => query(bookings.find(item => matches(item, filter)) || null));
  stub(Booking, 'find', filter => query(bookings.filter(item => matches(item, filter))));
  stub(Booking, 'findOneAndUpdate', async (filter, changes) => { const item = bookings.find(item => matches(item, filter)); return item ? update(item, changes) : null; });
  stub(Booking, 'findByIdAndUpdate', async (id, changes) => { const item = bookings.find(item => String(item._id) === String(id)); return item ? update(item, changes) : null; });
  stub(Booking, 'updateOne', async (filter, changes) => { const item = bookings.find(item => matches(item, filter)); if (item) update(item, changes); return { matchedCount: item ? 1 : 0 }; });
  const customer = { _id: ownerId, role: 'user', email: 'customer@example.test', isVerified: true, isActive: true };
  const staffCustomer = { ...customer, _id: staffId, role: 'super_admin', email: 'owner@example.test' };
  const otherCustomer = { ...customer, _id: otherId, email: 'other@example.test' };
  const users = [customer, staffCustomer, otherCustomer];
  stub(User, 'findById', id => query(users.find(user => String(user._id) === String(id)) || null));
  stub(User, 'findOne', filter => {
    if (filter.email) return query(users.find(user => user.email === filter.email) || null);
    return query(users.find(user => String(user._id) === String(filter._id)) || null);
  });
  stub(RoomSession, 'exists', () => query(false));
  stub(Room, 'findOneAndUpdate', async () => ({ _id: roomId, name: 'Billiards', price: 300, variants: [] }));
  stub(BookingLock, 'find', () => query([]));
  stub(AuditLog, 'create', async () => ({}));
  stub(Notification, 'findOneAndUpdate', async (filter, changes, options = {}) => {
    let item = notifications.find(item => matches(item, filter));
    if (!item && options.upsert) { item = new Notification(changes.$setOnInsert); notifications.push(item); }
    if (item && !changes.$setOnInsert) update(item, changes);
    return item || null;
  });
  stub(Notification, 'find', filter => query(notifications.filter(item => matches(item, filter))));
  stub(Notification, 'countDocuments', async filter => notifications.filter(item => matches(item, filter)).length);
  stub(Notification, 'updateOne', async (filter, changes) => { const item = notifications.find(item => matches(item, filter)); if (item) update(item, changes); return { matchedCount: item ? 1 : 0 }; });
  stub(Notification, 'updateMany', async (filter, changes) => { notifications.filter(item => matches(item, filter)).forEach(item => update(item, changes)); });
  stub(paymongo, 'getRefundPayment', async booking => {
    if (failure === 'read-timeout') throw Object.assign(new Error('timeout'), { status: 504 });
    return { paymentId: 'pay_test', amount: booking.downPayment };
  });
  stub(paymongo, 'listRefunds', async () => paidRefunds);
  stub(paymongo, 'createRefund', async args => {
    createdRefunds.push(args);
    if (failure === 'reject') throw Object.assign(new Error('insufficient balance'), { status: 400 });
    const response = refundResponse(args); paidRefunds.push(response.data);
    if (failure === 'slow') { postEntered?.(); await new Promise(resolve => { releasePost = resolve; }); }
    if (failure === 'timeout') throw Object.assign(new Error('timeout'), { status: 504 });
    return response;
  });
  stub(paymongo, 'retrieveRefund', async () => ({ data: paidRefunds[0] }));
  stub(xendit, 'getRefundPayment', async booking => ({ paymentId: 'py_test', paymentRequestId: 'pr_test', amount: booking.downPayment }));
  stub(xendit, 'listRefunds', async () => []);
  stub(xendit, 'createRefund', async args => { createdRefunds.push(args); return { id: 'rfd_test', reference_id: args.requestId, payment_request_id: args.paymentRequestId, currency: 'PHP', amount: args.amount, status: 'SUCCEEDED' }; });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: req.get('x-test-user') || ownerId, cookie: {} }; next(); });
  app.use('/settings', require('../routes/settingsRoutes'));
  app.use('/bookings', require('../routes/bookingRoutes'));
  app.use('/notifications', require('../routes/notificationRoutes'));
  app.use('/sessions', require('../routes/monitoringRoutes').sessionsRouter);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { restores.reverse().forEach(restore => restore()); await new Promise(resolve => server.close(resolve)); });

test('closing a service date notifies existing guests, including after-midnight bookings, without forfeiting payments', async () => {
  reset(); const first = makeBooking(); const overnight = makeBooking({ date: '2099-12-25', timeIn: '01:00' });
  const tomorrow = makeBooking({ date: '2099-12-25', timeIn: '13:00' });
  const started = makeBooking({ status: 'Ongoing' });
  const response = await post('/settings/holidays', { name: 'Christmas closure', date: '2099-12-24', fullDay: true, note: 'Sorry for the change.' });
  assert.equal(response.status, 201); assert.equal((await response.json()).affectedReservationCount, 2);
  assert.equal(first.venueClosure.status, 'pending'); assert.equal(overnight.venueClosure.status, 'pending');
  assert.equal(tomorrow.venueClosure, undefined); assert.equal(started.venueClosure, undefined);
  assert.equal(first.paidAmount, 300); assert.equal(first.refundedAmount, 0);
  assert.equal(notifications.length, 2); assert.equal(emails.length, 2);
  assert.equal((await post('/settings/holidays', { name: 'Duplicate', date: '2099-12-24' })).status, 409);
  assert.equal(notifications.length, 2);
});

async function closeBooking(fields = {}) {
  const booking = makeBooking(fields);
  const response = await post('/settings/holidays', { name: 'Venue closure', date: '2099-12-24', fullDay: true });
  assert.equal(response.status, 201); return booking;
}

test('full closure refund cancels once, keeps the original deposit, and emails completion once even after duplicate requests/webhooks', async () => {
  reset(); const booking = await closeBooking();
  assert.equal((await put(`/bookings/${booking._id}/closure-refund`)).status, 200);
  assert.equal(booking.status, 'Cancelled'); assert.equal(booking.cancellationRefundException, true);
  assert.equal(booking.refundedAmount, 300); assert.equal(booking.downPayment, 300); assert.equal(booking.paidAmount, 300);
  assert.equal(booking.closureRefund.status, 'completed'); assert.equal(createdRefunds.length, 1);
  await put(`/bookings/${booking._id}/closure-refund`);
  const { handleRefundWebhook } = require('../utils/closureRefunds');
  await handleRefundWebhook('paymongo', paidRefunds[0]); await handleRefundWebhook('paymongo', paidRefunds[0]);
  assert.equal(createdRefunds.length, 1); assert.equal(booking.refundedAmount, 300);
  assert.equal(notifications.filter(item => item.type === 'refund_completed').length, 1);
  assert.equal(emails.filter(key => key.includes('refund_completed')).length, 1);
});

test('a provider processing response changes the ledger only after verified success', async () => {
  reset(); const booking = await closeBooking(); refundStatus = 'pending';
  await put(`/bookings/${booking._id}/closure-refund`);
  assert.equal(booking.closureRefund.status, 'processing'); assert.equal(booking.refundedAmount, 0);
  assert.equal(notifications.some(item => item.type === 'refund_completed'), false);
  paidRefunds[0].attributes.status = 'succeeded';
  await require('../utils/closureRefunds').handleRefundWebhook('paymongo', paidRefunds[0]);
  assert.equal(booking.closureRefund.status, 'completed'); assert.equal(booking.refundedAmount, 300);
});

test('an accepted refund with a timed-out response is reconciled by reads without repeating the POST', async () => {
  reset(); const booking = await closeBooking(); failure = 'timeout';
  await put(`/bookings/${booking._id}/closure-refund`);
  assert.equal(booking.closureRefund.status, 'review_required'); assert.equal(booking.refundedAmount, 0);
  await require('../utils/closureRefunds').processClosureRefund(booking._id, { force: true });
  assert.equal(booking.closureRefund.status, 'completed'); assert.equal(booking.refundedAmount, 300);
  assert.equal(createdRefunds.length, 1);
});

test('a definite provider rejection records no returned money and permits a documented staff refund', async () => {
  reset(); const booking = await closeBooking(); failure = 'reject';
  await put(`/bookings/${booking._id}/closure-refund`);
  assert.equal(booking.closureRefund.status, 'manual_required'); assert.equal(booking.refundedAmount, 0);
  const response = await put(`/bookings/${booking._id}/cancellation-review`, { decision: 'approve', refundedAmount: 300, note: 'Payment returned by staff.' }, staffId);
  assert.equal(response.status, 200); assert.equal(booking.closureRefund.status, 'completed');
  assert.equal(booking.refundedAmount, 300); assert.equal(createdRefunds.length, 1);
  assert.match(notifications.find(item => item.type === 'refund_completed').message, /recorded.*returned/);
});

test('manual refunds cannot be recorded while an online submission remains uncertain', async () => {
  reset(); const booking = await closeBooking(); failure = 'timeout';
  await put(`/bookings/${booking._id}/closure-refund`);
  const response = await put(`/bookings/${booking._id}/cancellation-review`, { decision: 'approve', refundedAmount: 300 }, staffId);
  assert.equal(response.status, 409); assert.equal(booking.refundedAmount, 0);
});

test('mixed payments return only the original gateway amount automatically and notify again after the cash remainder is returned', async () => {
  reset(); const booking = await closeBooking({ paidAmount: 600 });
  await put(`/bookings/${booking._id}/closure-refund`);
  assert.equal(createdRefunds[0].amount, 300); assert.equal(booking.refundedAmount, 300);
  assert.equal(booking.closureRefund.status, 'manual_required');
  assert.equal(notifications.some(item => item.type === 'refund_completed'), false);
  assert.equal((await put(`/bookings/${booking._id}/cancellation-review`, { decision: 'approve', refundedAmount: 600, note: 'Cash remainder returned.' }, staffId)).status, 200);
  assert.equal(booking.closureRefund.status, 'completed'); assert.equal(booking.refundedAmount, 600);
  assert.match(notifications.find(item => item.type === 'refund_completed').message, /remaining payment as returned/);
});

test('a verified guest account receives a staff-created reservation notice and may request its cash refund', async () => {
  reset(); const booking = await closeBooking({ source: 'walk-in', bookedBy: staffId, paymentProvider: 'manual', paymentMethod: 'Cash' });
  assert.equal(String(booking.venueClosure.customerUserId), ownerId); assert.equal(String(notifications[0].user), ownerId);
  const response = await put(`/bookings/${booking._id}/closure-refund`);
  assert.equal(response.status, 200); assert.equal(booking.closureRefund.status, 'manual_required'); assert.equal(createdRefunds.length, 0);
});

test('an online reservation owner receives closure notices even when their account has an admin role', async () => {
  reset(); const booking = await closeBooking({ bookedBy: staffId, guestEmail: 'owner@example.test' });
  assert.equal(String(booking.venueClosure.customerUserId), staffId);
  assert.equal(String(notifications[0].user), staffId);
  const response = await fetch(`${base}/notifications`, { headers: { 'x-test-user': staffId } });
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.items.length, 1); assert.equal(data.unreadCount, 1);
});

test('legacy unassigned notices recover for their online owner without resending mail or resetting read state', async () => {
  reset(); const booking = await closeBooking({ bookedBy: staffId, guestEmail: 'owner@example.test' });
  booking.venueClosure.customerUserId = undefined;
  notifications[0].user = undefined;
  notifications[0].readAt = new Date('2026-10-01T00:00:00Z');
  const beforeEmails = emails.length;
  const foreign = new Notification({ eventKey: 'already-linked', booking: booking._id, user: ownerId, reservationCode: booking.reservationCode, type: 'refund_processing', title: 'Update', message: 'An already assigned notice', emailStatus: 'sent' });
  notifications.push(foreign);
  const data = await (await fetch(`${base}/notifications`, { headers: { 'x-test-user': staffId } })).json();
  assert.equal(data.items.length, 1); assert.equal(data.unreadCount, 0);
  assert.equal(String(notifications[0].user), staffId); assert.equal(notifications[0].emailStatus, 'sent');
  assert.equal(String(foreign.user), ownerId); assert.equal(emails.length, beforeEmails);
});

test('an unrelated customer cannot claim an unassigned online reservation notice', async () => {
  reset(); await closeBooking(); notifications[0].user = undefined;
  const data = await (await fetch(`${base}/notifications`, { headers: { 'x-test-user': otherId } })).json();
  assert.equal(data.items.length, 0); assert.equal(notifications[0].user, undefined);
  assert.equal((await (await fetch(`${base}/notifications`)).json()).items.length, 1);
});

test('ownership repair respects an explicitly linked guest account', async () => {
  reset(); const booking = await closeBooking({ bookedBy: staffId });
  booking.venueClosure.customerUserId = ownerId; notifications[0].user = undefined;
  const staff = await (await fetch(`${base}/notifications`, { headers: { 'x-test-user': staffId } })).json();
  assert.equal(staff.items.length, 0); assert.equal(notifications[0].user, undefined);
  assert.equal((await (await fetch(`${base}/notifications`)).json()).items.length, 1);
  assert.equal(String(notifications[0].user), ownerId);
});

test('an unassigned manual reservation notice goes to its verified guest, not the staff member who entered it', async () => {
  reset(); const booking = await closeBooking({ source: 'walk-in', bookedBy: staffId });
  booking.venueClosure.customerUserId = undefined; notifications[0].user = undefined;
  const staff = await (await fetch(`${base}/notifications`, { headers: { 'x-test-user': staffId } })).json();
  assert.equal(staff.items.length, 0); assert.equal(notifications[0].user, undefined);
  assert.equal((await (await fetch(`${base}/notifications`)).json()).items.length, 1);
  assert.equal(String(notifications[0].user), ownerId);
});

test('staff-assistance notices remain in the bell but are skipped by email, including older queued jobs', async () => {
  reset(); const booking = await closeBooking(); failure = 'reject';
  await put(`/bookings/${booking._id}/closure-refund`);
  const attention = notifications.find(item => item.type === 'refund_attention');
  assert.ok(attention); assert.equal(String(attention.user), ownerId); assert.equal(attention.emailStatus, 'skipped');
  assert.equal(emails.some(key => key.includes('refund_attention')), false);
  attention.emailStatus = 'pending'; attention.emailRetryAt = new Date(0);
  await require('../utils/reservationNotifications').deliverNotificationEmails();
  assert.equal(attention.emailStatus, 'skipped'); assert.equal(emails.some(key => key.includes('refund_attention')), false);
});

test('another customer cannot read notices, mark them read, reschedule, or refund the affected reservation', async () => {
  reset(); const booking = await closeBooking();
  const response = await fetch(`${base}/notifications`, { headers: { 'x-test-user': otherId } });
  assert.deepEqual((await response.json()).items, []);
  assert.equal((await post(`/notifications/${notifications[0]._id}/read`, {}, otherId)).status, 404);
  assert.equal((await put(`/bookings/${booking._id}/closure-refund`, {}, otherId)).status, 403);
  assert.equal((await put(`/bookings/${booking._id}/reschedule`, { date: '2099-12-26', timeIn: '13:00' }, otherId)).status, 403);
  assert.equal(createdRefunds.length, 0); assert.equal(booking.status, 'Confirmed');
});

test('a closure reschedule bypasses the expired cutoff and exhausted allowance while keeping funds and checking availability', async () => {
  reset(); const booking = await closeBooking({ rescheduleCount: 2 });
  booking.date = '2020-01-01';
  const response = await put(`/bookings/${booking._id}/reschedule`, { date: '2099-12-26', timeIn: '13:00' });
  assert.equal(response.status, 200); assert.equal(booking.venueClosure.status, 'rescheduled');
  assert.equal(booking.rescheduleCount, 2); assert.equal(booking.paidAmount, 300); assert.equal(booking.refundedAmount, 0);
  assert.equal(notifications.filter(item => item.type === 'rescheduled').length, 1);
  assert.equal((await put(`/bookings/${booking._id}/reschedule`, { date: '2099-12-27', timeIn: '13:00' })).status, 409);
});

test('closure options still reject past targets, closed dates, and ordinary cancellation routes', async () => {
  reset(); const booking = await closeBooking();
  assert.equal((await put(`/bookings/${booking._id}/reschedule`, { date: '2020-01-01', timeIn: '13:00' })).status, 400);
  assert.equal((await put(`/bookings/${booking._id}/reschedule`, { date: '2099-12-24', timeIn: '14:00' })).status, 409);
  assert.equal((await put(`/bookings/${booking._id}/cancellation-request`, { reason: 'Closure' })).status, 409);
});

test('Xendit refunds use pesos and its verified original payment request', async () => {
  reset(); const booking = await closeBooking({ paymentProvider: 'xendit', xenditPaymentId: 'py_test', xenditPaymentSessionId: 'session_test' });
  await put(`/bookings/${booking._id}/closure-refund`);
  assert.equal(createdRefunds[0].amount, 300); assert.equal(createdRefunds[0].paymentRequestId, 'pr_test');
  assert.equal(booking.refundedAmount, 300); assert.equal(booking.closureRefund.status, 'completed');
});

test('refund responses with another payment, currency or amount never update the ledger', () => {
  reset(); const { normalizeRefund } = require('../utils/closureRefunds');
  const job = { paymentId: 'pay_test', requestId: 'request', gatewayAmount: 300 };
  const response = refundResponse({ ...job, amount: 300 }, 'succeeded');
  assert.equal(normalizeRefund('paymongo', response, job).status, 'succeeded');
  for (const [key, value] of [['payment_id', 'pay_other'], ['currency', 'USD'], ['amount', 30001]]) {
    assert.throws(() => normalizeRefund('paymongo', { data: { ...response.data, attributes: { ...response.data.attributes, [key]: value } } }, job), /does not match/);
  }
});

test('a simultaneous provider status check cannot interfere with a live submission or send a second refund', async () => {
  reset(); const booking = await closeBooking(); failure = 'slow';
  const entered = new Promise(resolve => { postEntered = resolve; });
  const response = put(`/bookings/${booking._id}/closure-refund`);
  await entered;
  await require('../utils/closureRefunds').processClosureRefund(booking._id, { force: true });
  assert.equal(booking.closureRefund.status, 'submitting'); assert.equal(createdRefunds.length, 1);
  releasePost();
  assert.equal((await response).status, 200); assert.equal(booking.closureRefund.status, 'completed');
  assert.equal(booking.refundedAmount, 300); assert.equal(createdRefunds.length, 1);
});

test('a temporary email failure leaves a durable retry and does not undo the closure', async () => {
  reset(); emailFailure = true;
  const booking = await closeBooking();
  assert.equal(booking.venueClosure.status, 'pending'); assert.equal(notifications[0].emailStatus, 'pending');
  assert.equal(notifications[0].emailAttempts, 1); assert.equal(emails.length, 0);
  emailFailure = false;
  await require('../utils/reservationNotifications').deliverNotificationEmails({ now: new Date(Date.now() + 3600000) });
  assert.equal(notifications[0].emailStatus, 'sent'); assert.equal(notifications[0].emailAttempts, 2); assert.equal(emails.length, 1);
});

test('bell reads persist for their owner and the API omits email delivery internals', async () => {
  reset(); await closeBooking();
  const initial = await (await fetch(`${base}/notifications`)).json();
  assert.equal(initial.unreadCount, 1); assert.equal(initial.items[0].email, undefined); assert.equal(initial.items[0].emailStatus, undefined);
  assert.equal((await post(`/notifications/${notifications[0]._id}/read`, {}, ownerId)).status, 200);
  const next = await (await fetch(`${base}/notifications`)).json();
  assert.equal(next.unreadCount, 0); assert.ok(next.items[0].readAt);
});

test('a closure-affected reservation cannot start a monitoring session', async () => {
  reset(); const booking = await closeBooking();
  const response = await post('/sessions', { bookingId: String(booking._id), roomId, duration: 2, paidAmount: 0, paymentTiming: 'After' });
  assert.equal(response.status, 409); assert.match((await response.json()).message, /venue closure/);
  assert.equal(booking.status, 'Confirmed'); assert.equal(booking.paidAmount, 300);
});
