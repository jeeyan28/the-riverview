const { businessDate, addDays } = require('./businessDate');
const Booking = require('../model/booking');

const CONFIRMED_STATUSES = ['Confirmed', 'Ongoing', 'Overdue', 'Done', 'No Show'];
const PERIODS = { daily: 14, weekly: 12, monthly: 12 };

function mondayOf(dateKey) {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return addDays(dateKey, -((day + 6) % 7));
}

function monthOffset(dateKey, offset) {
  const date = new Date(`${dateKey.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function trendPeriods(interval, today = businessDate()) {
  if (!Object.hasOwn(PERIODS, interval)) {
    throw Object.assign(new Error('Choose daily, weekly, or monthly.'), { status: 400 });
  }
  const count = PERIODS[interval];
  const first = interval === 'daily' ? addDays(today, 1 - count)
    : interval === 'weekly' ? addDays(mondayOf(today), (1 - count) * 7)
      : monthOffset(today, 1 - count);
  return Array.from({ length: count }, (_, index) => {
    const start = interval === 'daily' ? addDays(first, index)
      : interval === 'weekly' ? addDays(first, index * 7)
        : monthOffset(first, index);
    const end = interval === 'daily' ? start
      : interval === 'weekly' ? addDays(start, 6)
        : addDays(monthOffset(start, 1), -1);
    return { start, end, count: 0 };
  });
}

function populatePeriods(periods, dailyCounts) {
  return periods.map((period) => ({
    ...period,
    count: dailyCounts.reduce((sum, item) => sum + (item._id >= period.start && item._id <= period.end ? item.count : 0), 0),
  }));
}

async function getConfirmedBookingTrend(interval) {
  const periods = trendPeriods(interval);
  const from = periods[0].start;
  const to = businessDate();
  const dailyCounts = await Booking.aggregate([
    { $match: { date: { $gte: from, $lte: to }, status: { $in: CONFIRMED_STATUSES } } },
    { $group: { _id: '$date', count: { $sum: 1 } } },
  ]);
  return { interval, from, to, periods: populatePeriods(periods, dailyCounts) };
}

module.exports = { CONFIRMED_STATUSES, trendPeriods, populatePeriods, getConfirmedBookingTrend };
