import test from 'node:test';
import assert from 'node:assert/strict';
import { getDayAvailability, getBookableStartCount } from '../src/utils/rooms.js';

const date = '2030-01-01';
const beforeDate = Date.parse('2029-12-31T00:00:00+08:00');
const booking = (timeIn, duration = 1) => ({ timeIn, duration });

test('a date is full when no start time can fit the selected duration', () => {
  const bookings = [booking('08:00', 4)];
  assert.deepEqual(getDayAvailability(bookings, 8, 12, 1, 1, date, beforeDate), {
    availableStarts: 0, nearlyFull: false,
  });
  assert.equal(getBookableStartCount(bookings, 8, 12, 1, 1, date, beforeDate), 0);
});

test('a date is nearly full when only one start time remains', () => {
  const bookings = [booking('08:00', 3)];
  assert.deepEqual(getDayAvailability(bookings, 8, 12, 1, 1, date, beforeDate), {
    availableStarts: 1, nearlyFull: true,
  });
});

test('a date is nearly full when few rooms remain across its start times', () => {
  const bookings = [booking('08:00', 4)];
  assert.deepEqual(getDayAvailability(bookings, 8, 12, 3, 1, date, beforeDate), {
    availableStarts: 4, nearlyFull: true,
  });
});

test('a date with several rooms and start times stays available', () => {
  const bookings = [booking('08:00', 4)];
  assert.deepEqual(getDayAvailability(bookings, 8, 12, 5, 1, date, beforeDate), {
    availableStarts: 4, nearlyFull: false,
  });
});
