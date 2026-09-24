const test = require('node:test');
const assert = require('node:assert/strict');
const { completeReservationFields } = require('../utils/bookingLifecycle');

const reservation = { status: 'Confirmed', date: '2026-09-23', timeIn: '13:00', duration: 1 };
const at = (time) => Date.parse(`2026-09-23T${time}:00+08:00`);

test('a no-show can be corrected to done without changing its payment fields', () => {
  const booking = { ...reservation, status: 'No Show', noShowAt: new Date(at('14:00')), paidAmount: 150, amount: 600 };
  assert.deepEqual(completeReservationFields(booking, { now: at('14:01') }), { status: 'Done', noShowAt: null });
});

test('an expired confirmed reservation can be marked done even before the no-show scheduler runs', () => {
  assert.deepEqual(completeReservationFields(reservation, { now: at('14:01') }), { status: 'Done', noShowAt: null });
  assert.throws(() => completeReservationFields(reservation, { now: at('12:59') }), /before its start time/);
});

test('linked sessions still finish through Room Monitoring', () => {
  assert.throws(() => completeReservationFields({ ...reservation, status: 'No Show' }, { hasMonitorSession: true }), /Room Monitoring/);
});
