const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../model/user');
const Room = require('../model/room');
const Booking = require('../model/booking');
const { MonitorRoom, RoomSession } = require('../model/monitoring');
const { sessionsRouter } = require('../routes/monitoringRoutes');
const { businessDate } = require('../utils/businessDate');

const sessionId = '507f1f77bcf86cd799439011';
const roomId = '507f1f77bcf86cd799439012';
const bookingId = '507f1f77bcf86cd799439013';
const reservedStart = Math.ceil((Date.now() + 3600000) / 3600000) * 3600000;
const room = { _id: roomId, facilityName: 'Billiards', roomName: 'Classic', roomNumber: '1', price: 100, status: 'Occupied' };
const catalog = { _id: '507f1f77bcf86cd799439014', name: 'Billiards', variants: [{ label: 'Classic', roomCount: 1, price: 100, status: 'Available' }] };
const reservation = { _id: bookingId, date: businessDate(reservedStart), timeIn: new Date(reservedStart).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), duration: 1, status: 'Confirmed' };
const query = (value) => ({ select() { return this; }, lean: async () => value });
const restores = [];
let currentSession, inventory, bookings, saves, releases, restoredBooking, server, base;

function stub(target, key, value) {
  const original = target[key];
  target[key] = value;
  restores.push(() => target[key] = original);
}

function reset() {
  currentSession = {
    _id: sessionId, room: roomId, facilityName: 'Billiards', roomName: 'Classic', roomNumber: '1',
    status: 'Active', startTime: new Date(reservedStart - 1.5 * 3600000), duration: 1,
    rate: 100, amount: 100, roomCharge: 100, hourlyRates: [100], paidAmount: 0, refundedAmount: 0,
    paymentStatus: 'Unpaid', save: async () => { saves += 1; },
  };
  inventory = [room];
  bookings = [];
  saves = 0;
  releases = 0;
  restoredBooking = null;
}

before(async () => {
  stub(User, 'findOne', async () => ({ _id: 'operator', role: 'super_admin', isActive: true }));
  stub(Room, 'findOne', () => query(catalog));
  stub(MonitorRoom, 'findById', async () => room);
  stub(MonitorRoom, 'find', () => query(inventory));
  stub(MonitorRoom, 'findOneAndUpdate', async () => { releases += 1; return { ...room, status: 'Available' }; });
  stub(RoomSession, 'findById', async () => currentSession);
  stub(RoomSession, 'find', () => query([currentSession]));
  stub(RoomSession, 'findOneAndUpdate', async (filter, update) => {
    if (filter._id !== sessionId || currentSession.status !== filter.status) return null;
    Object.assign(currentSession, update.$set);
    return currentSession;
  });
  stub(RoomSession, 'exists', async (filter) => filter._id === sessionId);
  stub(Booking, 'find', () => query(bookings));
  stub(Booking, 'findByIdAndUpdate', async (id, fields) => { restoredBooking = { id, ...fields }; });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: 'operator', cookie: {} }; next(); });
  app.use('/sessions', sessionsRouter);
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/sessions/${sessionId}`;
});

after(async () => {
  restores.reverse().forEach((restore) => restore());
  await new Promise((resolve) => server.close(resolve));
});

const extend = () => fetch(`${base}/extend`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ addedHours: 1, collectNow: false, expectedCharge: 100 }) });

test('an unavailable extension quote explains the reservation and submitting it is rejected', async () => {
  reset();
  bookings = [reservation];
  const quote = await fetch(`${base}/extend?addedHours=1`);
  assert.equal(quote.status, 200);
  const body = await quote.json();
  assert.equal(body.canExtend, false);
  assert.match(body.notice, /reservation starts.*no matching table/i);
  assert.equal((await extend()).status, 409);
  assert.equal(saves, 0);
  assert.equal(currentSession.duration, 1);
});

test('submitting rechecks a reservation that arrives after an available quote', async () => {
  reset();
  assert.equal((await (await fetch(`${base}/extend?addedHours=1`)).json()).canExtend, true);
  bookings = [reservation];
  assert.equal((await extend()).status, 409);
  assert.equal(saves, 0);
});

test('a shorter extension may end at the next reservation start', async () => {
  reset();
  bookings = [reservation];
  const quote = await (await fetch(`${base}/extend?addedHours=0.5`)).json();
  assert.equal(quote.canExtend, true);
  assert.equal(quote.addedCharge, 50);
  assert.equal(Date.parse(quote.scheduledEndTime), reservedStart);
});

test('a spare matching table allows the extension and preserves its charge', async () => {
  reset();
  inventory = [room, { ...room, _id: '507f1f77bcf86cd799439015', roomNumber: '2', status: 'Available' }];
  bookings = [reservation];
  assert.equal((await extend()).status, 200);
  assert.equal(saves, 1);
  assert.equal(currentSession.duration, 2);
  assert.equal(currentSession.amount, 200);
  assert.equal(currentSession.roomCharge, 200);
  assert.equal(currentSession.paidAmount, 0);
});

test('cancellation returns the released table, keeps payment history and restores the booking', async () => {
  reset();
  currentSession.booking = bookingId;
  currentSession.paidAmount = 100;
  const response = await fetch(base, { method: 'DELETE' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.session.status, 'Cancelled');
  assert.equal(body.session.amount, 100);
  assert.equal(body.session.paidAmount, 100);
  assert.equal(body.room.status, 'Available');
  assert.deepEqual(restoredBooking, { id: bookingId, status: 'Confirmed' });
  assert.equal((await fetch(base, { method: 'DELETE' })).status, 409);
  assert.equal(releases, 1);
});
