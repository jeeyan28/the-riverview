const test = require('node:test');
const assert = require('node:assert/strict');
const { extensionAvailability } = require('../../utils/sessionAvailability');

const time = (value) => Date.parse(`2026-10-01T${value}:00+08:00`);
const room = (_id, status = 'Available') => ({ _id, status });
const session = { _id: 's1', room: 'r1', booking: 'b1', status: 'Active', startTime: time('15:00'), duration: 1 };
const booking = (_id, timeIn = '16:00', overrides = {}) => ({ _id, date: '2026-10-01', timeIn, duration: 1, status: 'Confirmed', ...overrides });
function availability(overrides = {}) {
  return extensionAvailability({ session, rooms: [room('r1', 'Occupied')], sessions: [session], bookings: [], endTime: time('16:00'), proposedEndTime: time('17:00'), now: time('15:00'), ...overrides });
}

test('an incoming reservation blocks an extension when its only table is in use', () => {
  const result = availability({ bookings: [booking('b2')] });
  assert.equal(result.canExtend, false);
  assert.match(result.notice, /reservation starts.*no matching table/i);
  assert.equal(result.reservationStart.getTime(), time('16:00'));
});

test('a free table of the same type allows the extension', () => {
  assert.equal(availability({ rooms: [room('r1', 'Occupied'), room('r2')], bookings: [booking('b2')] }).canExtend, true);
});

test('another table must be free by the incoming reservation time', () => {
  const rooms = [room('r1', 'Occupied'), room('r2', 'Occupied')];
  const other = { _id: 's2', room: 'r2', status: 'Active', startTime: time('15:00'), duration: 1.5 };
  assert.equal(availability({ rooms, sessions: [session, other], bookings: [booking('b2')] }).canExtend, false);
  assert.equal(availability({ rooms, sessions: [session, { ...other, duration: 1 }], bookings: [booking('b2')] }).canExtend, true);
});

test('overlapping reservations compete for the spare tables', () => {
  assert.equal(availability({ rooms: [room('r1', 'Occupied'), room('r2')], bookings: [booking('b2'), booking('b3')] }).canExtend, false);
});

test('non-overlapping reservations can reuse a spare table', () => {
  assert.equal(availability({ rooms: [room('r1', 'Occupied'), room('r2')], bookings: [booking('b2'), booking('b3', '17:00')], proposedEndTime: time('18:00') }).canExtend, true);
});

test('ending exactly when a reservation begins is allowed', () => {
  assert.equal(availability({ bookings: [booking('b2', '17:00')] }).canExtend, true);
  assert.equal(availability({ bookings: [booking('b2')], endTime: time('15:30'), proposedEndTime: time('16:00') }).canExtend, true);
});

test('unavailable tables and overdue occupied tables cannot hold a reservation', () => {
  for (const status of ['Inactive', 'Under Maintenance']) {
    assert.equal(availability({ rooms: [room('r1', 'Occupied'), room('r2', status)], bookings: [booking('b2')] }).canExtend, false);
  }
  const rooms = [room('r1', 'Occupied'), room('r2', 'Occupied')];
  assert.equal(availability({ rooms, bookings: [booking('b2')] }).canExtend, false);
  const overdue = { _id: 's2', room: 'r2', status: 'Active', startTime: time('14:00'), duration: 1 };
  assert.equal(availability({ rooms, sessions: [session, overdue], bookings: [booking('b2')] }).canExtend, false);
});

test('the current booking and active linked bookings are counted only once', () => {
  assert.equal(availability({ bookings: [booking('b1')] }).canExtend, true);
  const other = { _id: 's2', room: 'r2', booking: 'b2', status: 'Active', startTime: time('15:00'), duration: 1 };
  assert.equal(availability({ rooms: [room('r1', 'Occupied'), room('r2', 'Occupied')], sessions: [session, other], bookings: [booking('b2'), booking('b3')] }).canExtend, true);
});

test('cancelled, rejected and no-show reservations do not block an extension', () => {
  for (const status of ['Cancelled', 'Rejected', 'No Show', 'Done']) {
    assert.equal(availability({ bookings: [booking('b2', '16:00', { status })] }).canExtend, true);
  }
});

test('capacity checks cross midnight in Manila', () => {
  assert.equal(availability({ endTime: time('23:30'), proposedEndTime: Date.parse('2026-10-02T00:30:00+08:00'), bookings: [booking('b2', '00:00', { date: '2026-10-02' })] }).canExtend, false);
});

test('the fourth five-hour walk-in cannot consume the table needed by an incoming reservation', () => {
  const rooms = [room('r1', 'Occupied'), room('r2', 'Occupied'), room('r3', 'Occupied'), room('r4')];
  const sessions = ['r1', 'r2', 'r3'].map((roomId) => ({ _id: `session-${roomId}`, room: roomId, status: 'Active', startTime: time('15:00'), duration: 5 }));
  const input = { session: { room: 'r4' }, rooms, sessions, bookings: [booking('incoming')], endTime: time('15:00'), proposedEndTime: time('20:00'), now: time('15:00'), action: 'start' };
  const blocked = extensionAvailability(input);
  assert.equal(blocked.canExtend, false);
  assert.match(blocked.notice, /reservation starts.*no matching table/i);
  assert.equal(extensionAvailability({ ...input, rooms: [rooms[0], rooms[1], room('r3'), rooms[3]], sessions: sessions.slice(0, 2) }).canExtend, true);
  assert.equal(extensionAvailability({ ...input, proposedEndTime: time('16:00') }).canExtend, true);
});
