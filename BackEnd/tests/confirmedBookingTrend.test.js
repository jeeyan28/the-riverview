const test = require('node:test');
const assert = require('node:assert/strict');
const { trendPeriods, populatePeriods, CONFIRMED_STATUSES } = require('../utils/confirmedBookingTrend');

test('daily trend includes today and fills dates without confirmed bookings', () => {
  const periods = populatePeriods(trendPeriods('daily', '2026-09-25'), [
    { _id: '2026-09-24', count: 22 },
    { _id: '2026-09-25', count: 15 },
  ]);
  assert.equal(periods.length, 14);
  assert.deepEqual(periods.at(-2), { start: '2026-09-24', end: '2026-09-24', count: 22 });
  assert.deepEqual(periods.at(-1), { start: '2026-09-25', end: '2026-09-25', count: 15 });
  assert.equal(periods[0].count, 0);
});

test('weekly and monthly trend buckets use calendar boundaries', () => {
  const weeks = populatePeriods(trendPeriods('weekly', '2026-09-25'), [
    { _id: '2026-09-20', count: 2 },
    { _id: '2026-09-21', count: 3 },
    { _id: '2026-09-25', count: 4 },
  ]);
  assert.deepEqual(weeks.at(-1), { start: '2026-09-21', end: '2026-09-27', count: 7 });
  assert.equal(weeks.at(-2).count, 2);

  const months = populatePeriods(trendPeriods('monthly', '2026-09-25'), [
    { _id: '2026-08-31', count: 5 },
    { _id: '2026-09-01', count: 6 },
  ]);
  assert.deepEqual(months.at(-1), { start: '2026-09-01', end: '2026-09-30', count: 6 });
  assert.equal(months.at(-2).count, 5);
});

test('confirmed trend includes completed sessions but excludes unconfirmed and cancelled reservations', () => {
  assert.deepEqual(CONFIRMED_STATUSES, ['Confirmed', 'Ongoing', 'Overdue', 'Done', 'No Show']);
  assert.throws(() => trendPeriods('yearly', '2026-09-25'), /Choose daily, weekly, or monthly/);
});
