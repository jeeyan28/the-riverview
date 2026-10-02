const test = require('node:test');
const assert = require('node:assert/strict');
const Booking = require('../model/booking');
const { voidExpiredBookings } = require('../utils/bookingHelper');

test('the no-show scheduler expires legacy overdue reservations as well as confirmed ones', async () => {
  const originalFind = Booking.find;
  const originalUpdateMany = Booking.updateMany;
  let findFilter;
  let updated;
  try {
    Booking.find = (filter) => {
      findFilter = filter;
      return {
        select: async () => [
          { _id: 'confirmed', date: '2026-09-23', timeIn: '13:00', duration: 1 },
          { _id: 'legacy-overdue', date: '2026-09-23', timeIn: '14:00', duration: 1 },
          { _id: 'future', date: '2099-09-23', timeIn: '13:00', duration: 1 },
        ],
      };
    };
    Booking.updateMany = async (filter, changes) => { updated = { filter, changes }; };

    await voidExpiredBookings();

    assert.deepEqual(findFilter.status.$in, ['Confirmed', 'Overdue']);
    assert.deepEqual(findFilter['venueClosure.status'], { $ne: 'pending' });
    assert.deepEqual(updated.filter['venueClosure.status'], { $ne: 'pending' });
    assert.deepEqual(updated.filter._id.$in, ['confirmed', 'legacy-overdue']);
    assert.deepEqual(updated.filter.status.$in, ['Confirmed', 'Overdue']);
    assert.equal(updated.changes.status, 'No Show');
    assert.ok(updated.changes.noShowAt instanceof Date);
  } finally {
    Booking.find = originalFind;
    Booking.updateMany = originalUpdateMany;
  }
});
