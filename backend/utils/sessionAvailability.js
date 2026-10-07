const { bookingStartMs } = require('./bookingLifecycle');
const { businessDate } = require('./businessDate');
const { nearbyDates, HOUR_MS } = require('./bookingSchedule');
const { catalogVariantForMonitorRoom } = require('./monitorRoomRate');
const { TIME_ZONE } = require('./constants');

const RESERVED_STATUSES = ['Pending', 'Pending Payment Verification', 'Awaiting Online Payment', 'Confirmed'];
const id = (value) => String(value?._id || value || '');

function sessionEndMs(session) {
  return session.scheduledEndTime
    ? new Date(session.scheduledEndTime).getTime()
    : new Date(session.startTime).getTime() + Number(session.duration) * HOUR_MS;
}

function extensionAvailability({ session, rooms, sessions, bookings, endTime, proposedEndTime, now = Date.now(), action = 'extension' }) {
  const start = Math.max(Number(endTime), Number(now));
  const end = Number(proposedEndTime);
  const available = { canExtend: true, notice: '' };
  if (end <= start) return available;

  const inventory = rooms.filter((room) => ['Available', 'Occupied'].includes(room.status));
  const roomIds = new Set(inventory.map(id));
  const currentRoomId = id(session.room);
  const activeSessions = sessions.filter((other) => other.status === 'Active' && id(other) !== id(session) && roomIds.has(id(other.room)));
  const linkedBookingIds = new Set([id(session.booking), ...activeSessions.map((other) => id(other.booking))].filter(Boolean));
  const occupiedRoomIds = new Set([currentRoomId, ...activeSessions.map((other) => id(other.room))]);
  const occupied = activeSessions.map((other) => {
    const scheduledEnd = sessionEndMs(other);
    return { start: Number(now), end: scheduledEnd > now ? scheduledEnd : Infinity };
  });
  inventory.filter((room) => room.status === 'Occupied' && !occupiedRoomIds.has(id(room)))
    .forEach(() => occupied.push({ start: Number(now), end: Infinity }));

  const reservations = bookings.filter((booking) => RESERVED_STATUSES.includes(booking.status) && !linkedBookingIds.has(id(booking)))
    .map((booking) => {
      const reservedStart = bookingStartMs(booking.date, booking.timeIn);
      return { start: reservedStart, end: reservedStart + Number(booking.duration) * HOUR_MS };
    })
    .filter((booking) => booking.start < end && booking.end > start)
    .sort((a, b) => a.start - b.start);
  const points = [...new Set([start, ...reservations.flatMap((booking) => [booking.start, booking.end]), ...occupied.map((other) => other.end)])]
    .filter((point) => point >= start && point < end).sort((a, b) => a - b);
  for (const point of points) {
    const incoming = reservations.filter((booking) => booking.start <= point && booking.end > point);
    const inUse = occupied.filter((other) => other.start <= point && other.end > point).length;
    if (incoming.length && inUse + incoming.length + (roomIds.has(currentRoomId) ? 1 : 0) > inventory.length) {
      const reservationStart = new Date(incoming[0].start);
      const time = reservationStart.toLocaleString('en-PH', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
      return {
        canExtend: false,
        reservationStart,
        notice: action === 'start'
          ? `A reservation starts at ${time}. This session would still be running then, so there would be no matching table free. End it before the reservation, or free up another table.`
          : `A reservation starts at ${time}. This extension would still be running then, so there would be no matching table free. Pick a shorter extension or keep the current end time.`,
      };
    }
  }
  return available;
}

async function getExtensionAvailability(session, room, endTime, proposedEndTime, action = 'extension') {
  const Room = require('../model/room');
  const Booking = require('../model/booking');
  const { MonitorRoom, RoomSession } = require('../model/monitoring');
  const [catalog, rooms] = await Promise.all([
    Room.findOne({ name: room.facilityName }).select('name variants').lean(),
    MonitorRoom.find({ facilityName: room.facilityName, roomName: room.roomName, isTemporary: { $ne: true }, status: { $in: ['Available', 'Occupied'] } }).lean(),
  ]);
  const variant = catalogVariantForMonitorRoom(room, catalog);
  const dates = [...new Set([...nearbyDates(businessDate(endTime)), ...nearbyDates(businessDate(proposedEndTime))])];
  const [sessions, bookings] = await Promise.all([
    RoomSession.find({ room: { $in: rooms.map((entry) => entry._id) }, status: 'Active' }).lean(),
    Booking.find({
      ...(catalog ? { room: catalog._id } : { roomLabel: room.facilityName }),
      variantLabel: variant?.label || (catalog && !catalog.variants?.length ? null : room.roomName),
      date: { $in: dates },
      status: { $in: RESERVED_STATUSES },
    }).select('date timeIn duration status').lean(),
  ]);
  return extensionAvailability({ session, rooms, sessions, bookings, endTime, proposedEndTime, action });
}

async function getSessionStartAvailability(room, duration) {
  const now = Date.now();
  const availability = await getExtensionAvailability(
    { room: room._id }, room, now, now + Number(duration) * HOUR_MS, 'start'
  );
  return { canStart: availability.canExtend, notice: availability.notice, reservationStart: availability.reservationStart };
}

module.exports = { extensionAvailability, getExtensionAvailability, getSessionStartAvailability };
