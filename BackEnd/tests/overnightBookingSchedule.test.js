const test = require('node:test');
const assert = require('node:assert/strict');
const { bookingStartMs } = require('../utils/bookingLifecycle');
const { shiftDate, availabilityRows, operatingWindowForStart, occupiedCountAt } = require('../utils/bookingSchedule');

test('a 10 AM to 5 AM schedule treats midnight as the previous operating day', () => {
  const window = operatingWindowForStart('2026-09-26', '00:00', '10:00', '05:00');
  assert.deepEqual(window, { serviceDate: '2026-09-25', serviceHour: 24, openHour: 10, closeHour: 29 });
  assert.equal(window.serviceHour + 5, window.closeHour);
  assert.equal(operatingWindowForStart('2026-09-26', '05:00', '10:00', '05:00').serviceHour, 5);
  assert.equal(shiftDate('2026-09-30', 1), '2026-10-01');
});

test('availability carries overnight reservations into the selected operating day', () => {
  const rows = availabilityRows([
    { date: '2026-09-25', timeIn: '23:00', duration: 3 },
    { date: '2026-09-26', timeIn: '00:00', duration: 2 },
  ], '2026-09-25');
  assert.deepEqual(rows, [
    { timeIn: '23:00', duration: 3 },
    { timeIn: '24:00', duration: 2 },
  ]);
  const midnight = bookingStartMs('2026-09-26', '00:00');
  assert.equal(occupiedCountAt([{ date: '2026-09-25', timeIn: '23:00', duration: 3 }], midnight), 1);
});
