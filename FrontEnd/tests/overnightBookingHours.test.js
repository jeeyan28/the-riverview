import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftBookingDate, slotBookingFields, slotStartMs } from '../src/utils/bookingHours.js';
import { getDayAvailability, getLatestStartTime, getSlotState } from '../src/utils/rooms.js';

test('a midnight start is saved on the next calendar date', () => {
  assert.equal(shiftBookingDate('2026-09-30', 1), '2026-10-01');
  assert.deepEqual(slotBookingFields('2026-09-25', 24), { date: '2026-09-26', timeIn: '00:00' });
  assert.equal(slotStartMs('2026-09-25', 24), Date.parse('2026-09-26T00:00:00+08:00'));
  assert.equal(getLatestStartTime(10, 29, 5), 24);
});

test('overnight availability includes next-day hours and detects overlapping bookings', () => {
  assert.equal(getDayAvailability([], 10, 29, 1, 5, '2026-09-25', 0).availableStarts, 15);
  const reserved = { 23: 1, 24: 1, 25: 1 };
  assert.equal(getSlotState(24, 2, 29, reserved, 1), 'booked');
  assert.equal(getSlotState(26, 2, 29, reserved, 1), 'available');
});
