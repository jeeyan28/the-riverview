import { businessDate } from './businessDate.js';

// Reservation times are stored as Manila local date and time strings.
const MANILA_OFFSET = '+08:00';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const RESERVATION_STATUS_FILTERS = ['Confirmed', 'Overdue', 'Ongoing', 'Done', 'Cancelled', 'No Show'];

export function reservationWindow(booking) {
  const { date, timeIn } = booking || {};
  const duration = Number(booking?.duration);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(timeIn)) || !Number.isFinite(duration) || duration <= 0) return null;
  const start = Date.parse(`${date}T${timeIn}:00${MANILA_OFFSET}`);
  if (!Number.isFinite(start) || new Date(start + 8 * HOUR_MS).toISOString().slice(0, 10) !== date) return null;
  return { start, end: start + duration * HOUR_MS };
}

export function showOnRoomMonitor(booking, now = Date.now()) {
  const window = reservationWindow(booking);
  return booking?.status === 'Confirmed' && booking?.cancellationStatus !== 'Requested' && booking?.venueClosure?.status !== 'pending' && !!window && window.end > now;
}

export function roomMonitorSchedule(bookings, now = Date.now()) {
  const date = businessDate(now);
  const scheduled = bookings.filter((booking) => showOnRoomMonitor(booking, now))
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeIn.localeCompare(b.timeIn));
  const today = scheduled.filter((booking) => booking.date === date);
  const upcoming = scheduled.filter((booking) => booking.date > date);
  const earlier = scheduled.filter((booking) => booking.date < date)
    .sort((a, b) => b.date.localeCompare(a.date) || a.timeIn.localeCompare(b.timeIn));
  return { bookings: scheduled, today, upcoming, earlier, defaultPeriod: today.length ? 'today' : upcoming.length ? 'upcoming' : earlier.length ? 'earlier' : 'today' };
}

export function reservationPresentation(booking, now = Date.now()) {
  const rawStatus = booking?.status || 'Pending';
  if (booking?.venueClosure?.status === 'pending' && ['Confirmed', 'Overdue', 'Pending', 'Pending Payment Verification', 'Awaiting Online Payment'].includes(rawStatus)) {
    return { status: ['Confirmed', 'Overdue'].includes(rawStatus) ? 'Confirmed' : 'Pending', warning: 'Venue closed' };
  }
  if (rawStatus === 'Confirmed' && booking?.cancellationStatus !== 'Requested') {
    const window = reservationWindow(booking);
    if (window && now >= window.end) return { status: 'No Show', warning: '' };
    if (window && now >= window.start + MINUTE_MS && now < window.end) return { status: 'Overdue', warning: '' };
  }
  if (rawStatus === 'Ongoing') return { status: 'Ongoing', warning: '' };
  if (rawStatus === 'Confirmed' && booking?.cancellationStatus === 'Requested') return { status: 'Confirmed', warning: 'Cancellation requested' };
  if (rawStatus === 'Pending Payment Verification') return { status: 'Pending', warning: 'Verify payment' };
  if (rawStatus === 'Awaiting Online Payment') return { status: 'Pending', warning: 'Awaiting payment' };
  // Older records can still carry a persisted Overdue status. Resolve it from
  // the scheduled window just as we do for current Confirmed reservations.
  if (rawStatus === 'Overdue') {
    if (booking?.cancellationStatus === 'Requested') return { status: 'Confirmed', warning: 'Cancellation requested' };
    const window = reservationWindow(booking);
    if (window && now >= window.end) return { status: 'No Show', warning: '' };
    if (window && now < window.start + MINUTE_MS) return { status: 'Confirmed', warning: '' };
    return { status: 'Overdue', warning: '' };
  }
  return { status: rawStatus, warning: '' };
}
