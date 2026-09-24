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

export function reservationPresentation(booking, now = Date.now()) {
  const rawStatus = booking?.status || 'Pending';
  if (rawStatus === 'Confirmed' && booking?.cancellationStatus !== 'Requested') {
    const window = reservationWindow(booking);
    if (window && now >= window.end) return { status: 'No Show', warning: '' };
    if (window && now >= window.start + MINUTE_MS && now < window.end) return { status: 'Overdue', warning: '' };
  }
  if (rawStatus === 'Ongoing') return { status: 'Ongoing', warning: '' };
  if (rawStatus === 'Pending Payment Verification') return { status: 'Pending', warning: 'Verify payment' };
  if (rawStatus === 'Awaiting Online Payment') return { status: 'Pending', warning: 'Awaiting payment' };
  // Old records may contain this persisted status. It is no longer produced.
  if (rawStatus === 'Overdue') return { status: 'Pending', warning: 'Past scheduled date' };
  return { status: rawStatus, warning: '' };
}
