const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const User = require('../model/user');
const Booking = require('../model/booking');
const AuditLog = require('../model/auditLog');
const { RoomSession } = require('../model/monitoring');
const bookingRoutes = require('../routes/bookingRoutes');

const id = '507f1f77bcf86cd799439011';
const restores = [];
let existing, saved, server, base;

function stub(target, key, replacement) {
  const original = target[key];
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
}

before(async () => {
  stub(mongoose, 'startSession', async () => ({
    withTransaction: async (work) => work(),
    endSession() {},
  }));
  stub(User, 'findOne', async () => ({ _id: id, role: 'super_admin', isActive: true }));
  stub(Booking, 'findById', () => ({ session: async () => existing }));
  stub(Booking, 'findByIdAndUpdate', async (_id, fields) => {
    saved = fields;
    return { ...existing, ...fields };
  });
  stub(RoomSession, 'exists', () => ({ session: async () => false }));
  stub(AuditLog, 'create', async () => ({}));

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: id, cookie: {} };
    next();
  });
  app.use('/bookings', bookingRoutes);
  server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  base = `http://127.0.0.1:${server.address().port}/bookings/${id}`;
});

after(async () => {
  restores.reverse().forEach((restore) => restore());
  await new Promise((resolve) => server.close(resolve));
});

test('Cancel Reservation approves a customer request without changing the recorded payment', async () => {
  saved = null;
  existing = {
    _id: id, reservationCode: 'BIL-1', guestName: 'Cabahug, Jian',
    status: 'Confirmed', cancellationStatus: 'Requested', cancellationSource: 'customer',
    cancellationRequestedAt: new Date('2026-10-01T00:00:00Z'),
    amount: 1300, paidAmount: 1300, downPayment: 1300, refundedAmount: 0,
    firstHourPayment: 300, date: '2026-10-02', timeIn: '12:00', duration: 3,
  };

  const response = await fetch(base, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Cancelled' }),
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'Cancelled');
  assert.equal(saved.cancellationStatus, 'Approved');
  assert.equal(saved.cancellationSource, 'customer');
  assert.equal(saved.paidAmount, 1300);
  assert.equal(saved.refundedAmount, 0);
});
