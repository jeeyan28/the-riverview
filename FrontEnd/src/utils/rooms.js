// rooms.js — small stateless helpers shared by the Home page's room grid
// and by BookingModal.jsx's calendar/slots (same original functions in
// js/index.js, split out so both consumers share one copy instead of
// duplicating them across pages).
const API_BASE_URL = 'http://localhost:3000';

// dateKey — migrated 1:1 from js/index.js. Formats a Date's year/month
// (0-indexed)/day into the "YYYY-MM-DD" string the backend's availability
// endpoints expect.
export function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// getRoomCapacity — migrated 1:1 from js/index.js. A room's capacity comes
// from its own `capacity` field (set by an admin under Room Management).
// 0/unset means "no limit enforced" so rooms created before this field
// existed keep working exactly as before.
export function getRoomCapacity(room) {
  const cap = Number(room?.capacity);
  return Number.isFinite(cap) && cap > 0 ? cap : null;
}

// Per-room, per-date cache of reserved hours, mirroring the module-level
// `RESERVED` cache in the original js/index.js so re-checking the same
// room/date (e.g. re-rendering the grid) doesn't refetch needlessly.
const reservedCache = {};

// fetchReservedHours — migrated from loadAvailability() in js/index.js.
// Returns the flat list of hours already reserved for a given room+date,
// e.g. a 2-hour booking starting at 14:00 contributes [14, 15].
export async function fetchReservedHours(roomId, dateStr) {
  const key = `${roomId}|${dateStr}`;
  if (reservedCache[key]) return reservedCache[key];

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/bookings/availability?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(dateStr)}`,
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error('Failed to load availability');
    const bookings = await res.json();

    const hours = [];
    bookings.forEach((b) => {
      const startHour = parseInt(b.timeIn.split(':')[0], 10);
      for (let h = startHour; h < startHour + b.duration; h++) hours.push(h);
    });
    reservedCache[key] = hours;
  } catch (err) {
    console.error(err);
  }
  return reservedCache[key] || [];
}

// clearReservedHours — invalidates one room/date's cached reserved-hours
// entry. Mirrors `delete RESERVED[key]` in the original's
// payOnlineAutomatically(), called right before redirecting to PayMongo so
// a held slot doesn't look stale if the visitor comes back via browser
// back instead of PayMongo's own cancel link.
export function clearReservedHours(roomId, dateStr) {
  delete reservedCache[`${roomId}|${dateStr}`];
}

// ─────────────────────────────────────────────────────────────────────────
// Booking Modal phase additions (below). Same source functions as above —
// migrated 1:1 from js/index.js — split out here per this file's original
// plan so Home.jsx's room grid and BookingModal.jsx's calendar/slots share
// one copy instead of duplicating them.
// ─────────────────────────────────────────────────────────────────────────

// Per-room, per-month cache of that month's bookings, mirroring the
// module-level `MONTH_AVAILABILITY` cache in the original js/index.js.
const monthAvailabilityCache = {};

// loadMonthAvailability — migrated 1:1 from js/index.js. Returns
// { "YYYY-MM-DD": [{ timeIn, duration }, ...] } for every day in the given
// month that has at least one booking for this room.
export async function loadMonthAvailability(roomId, year, month /* 1-12 */) {
  const key = `${roomId}|${year}-${month}`;
  if (monthAvailabilityCache[key]) return monthAvailabilityCache[key];

  try {
    const res = await fetch(
      `${API_BASE_URL}/api/bookings/availability-month?roomId=${encodeURIComponent(roomId)}&year=${year}&month=${month}`,
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error('Failed to load month availability');
    monthAvailabilityCache[key] = await res.json();
  } catch (err) {
    console.error(err);
    monthAvailabilityCache[key] = {};
  }
  return monthAvailabilityCache[key];
}

// clearMonthAvailability — invalidates one room/month's cached entry.
// Mirrors `delete MONTH_AVAILABILITY[key]` in payOnlineAutomatically().
export function clearMonthAvailability(roomId, year, month /* 1-12 */) {
  delete monthAvailabilityCache[`${roomId}|${year}-${month}`];
}

// isDayFullyBooked — migrated 1:1 from js/index.js. A day is "fully
// booked" for a room if every operating hour from openHour to closeHour is
// covered by at least one active booking. openHour/closeHour are passed in
// (from useSiteSettings) instead of read off a global, since this is now a
// pure function.
export function isDayFullyBooked(dayBookings, openHour, closeHour) {
  if (!dayBookings || !dayBookings.length) return false;
  const covered = new Array(closeHour - openHour).fill(false);
  dayBookings.forEach((b) => {
    const start = parseInt(String(b.timeIn).split(':')[0], 10);
    for (let h = start; h < start + b.duration; h++) {
      if (h >= openHour && h < closeHour) covered[h - openHour] = true;
    }
  });
  return covered.every(Boolean);
}

// isHolidayDate — migrated 1:1 from js/index.js. `holidays` is
// useSiteSettings' `settings.holidays` array.
export function isHolidayDate(dateStr, holidays) {
  return (holidays || []).some((h) => h.date === dateStr && h.fullDay);
}

// isOperatingDay — migrated 1:1 from js/index.js. `operatingHours` is
// useSiteSettings' `settings.operatingHours` (may be null before load).
export function isOperatingDay(dateObj, operatingHours) {
  const oh = operatingHours;
  if (!oh || !Array.isArray(oh.openDays) || !oh.openDays.length) return true;
  return oh.openDays.includes(dateObj.getDay());
}

// computeDownPayment — migrated 1:1 from js/index.js. Mirrors the
// server-side calculation in Backend/utils/bookingHelper.js so the amount
// shown in the modal matches what the backend will actually require. The
// down payment equals the room/variant's FIRST HOUR rate — not a
// percentage of the total — regardless of how many hours are booked. The
// server always recomputes and enforces this itself; this is display-only.
export function computeDownPayment(unitPrice) {
  return Math.max(0, Math.round(Number(unitPrice) || 0));
}
