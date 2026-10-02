const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../model/user');
const Room = require('../model/room');
const Booking = require('../model/booking');
const { MonitorRoom, RoomSession } = require('../model/monitoring');
const { sessionsRouter } = require('../routes/monitoringRoutes');
const { businessDate } = require('../utils/businessDate');

const HOUR_MS = 3600000;
const ids = ['507f1f77bcf86cd799439021', '507f1f77bcf86cd799439022', '507f1f77bcf86cd799439023', '507f1f77bcf86cd799439024'];
const userId = '507f1f77bcf86cd799439025';
const catalog = { _id: '507f1f77bcf86cd799439026', name: 'Billiards', variants: [{ label: 'Shared Room', price: 150, roomCount: 4 }] };
const reservationStart = Math.ceil((Date.now() + HOUR_MS) / HOUR_MS) * HOUR_MS;
const reservation = {
  _id: '507f1f77bcf86cd799439027', date: businessDate(reservationStart),
  timeIn: new Date(reservationStart).toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  duration: 1, status: 'Confirmed',
};
const query = (value) => ({ select() { return this; }, lean: async () => value });
const restores = [];
let rooms, sessions, bookings, saved, createReservationOnClaim, server, base;

function stub(target, method, replacement) {
  const original = target[method];
  target[method] = replacement;
  restores.push(() => { target[method] = original; });
}

function reset() {
  rooms = ids.map((_id, index) => ({ _id, facilityName: 'Billiards', roomName: 'Shared Room', roomNumber: String(index + 1), price: 150, status: index === 3 ? 'Available' : 'Occupied' }));
  sessions = rooms.slice(0, 3).map((room, index) => ({ _id: `active-${index}`, room: room._id, status: 'Active', startTime: new Date(), scheduledEndTime: new Date(Date.now() + 4 * HOUR_MS), duration: 5 }));
  bookings = [reservation];
  saved = 0;
  createReservationOnClaim = false;
}

before(async () => {
  stub(User, 'findOne', async () => ({ _id: userId, role: 'super_admin', isActive: true }));
  stub(Room, 'findOne', () => query(catalog));
  stub(MonitorRoom, 'findById', async (id) => rooms.find((room) => String(room._id) === String(id)) || null);
  stub(MonitorRoom, 'find', () => query(rooms));
  stub(MonitorRoom, 'findOneAndUpdate', async (filter, update) => {
    const room = rooms.find((entry) => String(entry._id) === String(filter._id) && entry.status === filter.status);
    if (!room) return null;
    room.status = update.$set.status;
    if (createReservationOnClaim && filter.status === 'Available') bookings = [reservation];
    return { ...room };
  });
  stub(MonitorRoom, 'updateOne', async (filter, update) => {
    const room = rooms.find((entry) => String(entry._id) === String(filter._id) && entry.status === filter.status);
    if (room) room.status = update.$set.status;
  });
  stub(RoomSession, 'find', () => query(sessions));
  stub(RoomSession, 'exists', async () => false);
  stub(RoomSession.prototype, 'save', async function () { saved += 1; });
  stub(Booking, 'find', () => query(bookings));
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { userId, cookie: {} }; next(); });
  app.use('/sessions', sessionsRouter);
  server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/sessions`;
});

after(async () => {
  restores.reverse().forEach((restore) => restore());
  await new Promise((resolve) => server.close(resolve));
});

const quote = (duration) => fetch(`${base}/start-availability?${new URLSearchParams({ roomId: ids[3], duration })}`);
const start = (duration) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: ids[3], duration, paymentTiming: 'After', paidAmount: 0 }) });

test('the final matching table is blocked for five hours before it is claimed', async () => {
  reset();
  const response = await quote(5);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.canStart, false);
  assert.match(body.notice, /reservation starts.*no matching table/i);
  const attemptedStart = await start(5);
  assert.equal(attemptedStart.status, 409);
  assert.match((await attemptedStart.json()).message, /reservation starts/i);
  assert.equal(rooms[3].status, 'Available');
  assert.equal(saved, 0);
});

test('a shorter session that ends before the reservation may start', async () => {
  reset();
  assert.equal((await (await quote(1)).json()).canStart, true);
  const response = await start(1);
  assert.equal(response.status, 201);
  assert.equal(rooms[3].status, 'Occupied');
  assert.equal(saved, 1);
});

test('a reservation added after the first check blocks the claim and releases the table', async () => {
  reset();
  bookings = [];
  createReservationOnClaim = true;
  assert.equal((await (await quote(5)).json()).canStart, true);
  const response = await start(5);
  assert.equal(response.status, 409);
  assert.equal(rooms[3].status, 'Available');
  assert.equal(saved, 0);
});
