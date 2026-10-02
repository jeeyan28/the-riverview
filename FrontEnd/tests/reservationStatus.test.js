import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationPresentation, roomMonitorSchedule, showOnRoomMonitor } from '../src/utils/reservationStatus.js';

const booking = { status: 'Confirmed', date: '2026-09-23', timeIn: '13:00', duration: 1 };
const at = (time) => Date.parse(`2026-09-23T${time}:00+08:00`);

test('venue closure reservations remain actionable after their slot and are hidden from the room monitor', () => {
  const closed = { ...booking, venueClosure: { status: 'pending' } };
  assert.deepEqual(reservationPresentation(closed, at('14:00')), { status: 'Confirmed', warning: 'Venue closed' });
  assert.deepEqual(reservationPresentation({ ...closed, status: 'Overdue' }, at('14:00')), { status: 'Confirmed', warning: 'Venue closed' });
  assert.equal(showOnRoomMonitor(closed, at('13:30')), false);
  assert.deepEqual(reservationPresentation({ ...closed, venueClosure: { status: 'reopened' } }, at('14:00')), { status: 'No Show', warning: '' });
});

test('confirmed reservation becomes overdue at 1:01 and no-show at 2:00', () => {
  assert.deepEqual(reservationPresentation(booking, at('13:00')), { status: 'Confirmed', warning: '' });
  assert.deepEqual(reservationPresentation(booking, at('13:01')), { status: 'Overdue', warning: '' });
  assert.deepEqual(reservationPresentation(booking, at('13:59')), { status: 'Overdue', warning: '' });
  assert.deepEqual(reservationPresentation(booking, at('14:00')), { status: 'No Show', warning: '' });
});

test('active sessions and pending cancellation requests do not become no-shows', () => {
  assert.deepEqual(reservationPresentation({ ...booking, status: 'Ongoing' }, at('14:00')), { status: 'Ongoing', warning: '' });
  assert.deepEqual(reservationPresentation({ ...booking, cancellationStatus: 'Requested' }, at('14:00')), { status: 'Confirmed', warning: 'Cancellation requested' });
});

test('legacy overdue reservations reflect their schedule instead of appearing pending', () => {
  const legacy = { ...booking, status: 'Overdue' };
  assert.deepEqual(reservationPresentation(legacy, at('12:59')), { status: 'Confirmed', warning: '' });
  assert.deepEqual(reservationPresentation(legacy, at('13:01')), { status: 'Overdue', warning: '' });
  assert.deepEqual(reservationPresentation(legacy, at('14:00')), { status: 'No Show', warning: '' });
  assert.deepEqual(reservationPresentation({ ...legacy, cancellationStatus: 'Requested' }, at('14:00')), { status: 'Confirmed', warning: 'Cancellation requested' });
  assert.deepEqual(reservationPresentation({ ...legacy, status: 'Done' }, at('14:00')), { status: 'Done', warning: '' });
});

test('payment workflow statuses stay under Pending without creating Overdue', () => {
  assert.deepEqual(reservationPresentation({ status: 'Pending Payment Verification' }, at('14:00')), { status: 'Pending', warning: 'Verify payment' });
  assert.deepEqual(reservationPresentation({ status: 'Awaiting Online Payment' }, at('14:00')), { status: 'Pending', warning: 'Awaiting payment' });
});

test('room monitor hides a reservation when its scheduled slot ends', () => {
  assert.equal(showOnRoomMonitor(booking, at('13:59')), true);
  assert.equal(showOnRoomMonitor(booking, at('14:00')), false);
  assert.equal(showOnRoomMonitor({ ...booking, cancellationStatus: 'Requested' }, at('13:30')), false);
});

const midnightBooking = { _id: 'midnight', status: 'Confirmed', date: '2026-10-02', timeIn: '00:00', duration: 1 };

test('room monitor shows next-hour midnight reservation before its booking date', () => {
  const schedule = roomMonitorSchedule([midnightBooking], Date.parse('2026-10-01T23:10:00+08:00'));
  assert.deepEqual(schedule.upcoming, [midnightBooking]);
  assert.equal(schedule.bookings.length, 1);
  assert.equal(schedule.today.length, 0);
  assert.equal(schedule.defaultPeriod, 'upcoming');
});

test('room monitor moves the midnight reservation into Today using Manila time', () => {
  const schedule = roomMonitorSchedule([midnightBooking], Date.parse('2026-10-01T16:10:00Z'));
  assert.deepEqual(schedule.today, [midnightBooking]);
  assert.equal(schedule.upcoming.length, 0);
  assert.equal(schedule.defaultPeriod, 'today');
});

test('upcoming reservations list the nearest date and start time first', () => {
  const later = { ...midnightBooking, _id: 'later', date: '2026-10-03' };
  const morning = { ...midnightBooking, _id: 'morning', timeIn: '08:00' };
  const schedule = roomMonitorSchedule([later, morning, midnightBooking], Date.parse('2026-10-01T23:10:00+08:00'));
  assert.deepEqual(schedule.upcoming.map((entry) => entry._id), ['midnight', 'morning', 'later']);
});

test('earlier overnight reservations remain visible until their slot ends', () => {
  const overnight = { ...midnightBooking, date: '2026-10-01', timeIn: '23:00', duration: 3 };
  const now = Date.parse('2026-10-02T00:10:00+08:00');
  assert.deepEqual(roomMonitorSchedule([overnight], now).earlier, [overnight]);
  assert.equal(roomMonitorSchedule([overnight], now).defaultPeriod, 'earlier');
});

test('schedule omits expired, started, and cancellation-requested reservations', () => {
  const records = [midnightBooking, { ...midnightBooking, status: 'Ongoing' }, { ...midnightBooking, cancellationStatus: 'Requested' }];
  const schedule = roomMonitorSchedule(records, Date.parse('2026-10-02T01:00:00+08:00'));
  assert.equal(schedule.bookings.length, 0);
  assert.equal(schedule.defaultPeriod, 'today');
});
