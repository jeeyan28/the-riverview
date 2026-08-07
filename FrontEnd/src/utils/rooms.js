import { API_BASE_URL } from '../services/api';

export function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function getPaxCapacity(paxText) {
  if (!paxText) return null;
  const matches = String(paxText).match(/\d+/g);
  if (!matches || !matches.length) return null;
  const max = Math.max(...matches.map(Number));
  return max > 0 ? max : null;
}

const reservedCache = {};

export async function fetchReservedHours(roomId, dateStr, variantLabel) {
  const key = `${roomId}|${dateStr}|${variantLabel || ''}`;
  if (reservedCache[key]) return reservedCache[key];

  try {
    const params = new URLSearchParams({ roomId, date: dateStr });
    if (variantLabel) params.set('variantLabel', variantLabel);
    const res = await fetch(
      `${API_BASE_URL}/api/bookings/availability?${params.toString()}`,
      { credentials: 'include' }
    );
    if (!res.ok) throw new Error('Failed to load availability');
    const bookings = await res.json();

    const hourCounts = {};

    bookings.forEach((b) => {
      const startHour = parseInt( String(b.timeIn).split(':')[0], 10 );
      for ( let h = startHour; h < startHour + Number(b.duration); h++ ) 
      { hourCounts[h] = (hourCounts[h] || 0) + 1; }
    });
    reservedCache[key] = hourCounts;
  } catch (err) {
  console.error(err);
  }
  return reservedCache[key] || {};
}

export function clearReservedHours(
  roomId,
  dateStr,
  variantLabel
) {
  const prefix = `${roomId}|${dateStr}|`;

  Object.keys(reservedCache).forEach((key) => {
    if (key.startsWith(prefix)) {
      delete reservedCache[key];
    }
  });
}

const monthAvailabilityCache = {};

export async function loadMonthAvailability(roomId, year, month, variantLabel) {
  const key = `${roomId}|${year}-${month}|${variantLabel || ''}`;
  if (monthAvailabilityCache[key]) return monthAvailabilityCache[key];

  try {
    const params = new URLSearchParams({ roomId, year, month });
    if (variantLabel) params.set('variantLabel', variantLabel);

    const res = await fetch(
      `${API_BASE_URL}/api/bookings/availability-month?${params.toString()}`,
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

export function clearMonthAvailability(roomId, year, month) {
  const prefix = `${roomId}|${year}-${month}|`;
  Object.keys(monthAvailabilityCache).forEach((key) => {
    if (key.startsWith(prefix)) delete monthAvailabilityCache[key];
  });
}

function coveredHours(dayBookings, openHour, closeHour, totalRooms = 1) {
  const counts = new Array(Math.max(0, closeHour - openHour)).fill(0);
  (dayBookings || []).forEach((b) => {
    const start = parseInt(String(b.timeIn).split(':')[0], 10);
    for (let h = start; h < start + b.duration; h++) {
      if (h >= openHour && h < closeHour) counts[h - openHour] += 1;
    }
  });
  return counts.map((count) => count >= (Number(totalRooms) || 1));
}

export function isDayFullyBooked(dayBookings, openHour, closeHour, totalRooms = 1) {
  if (!dayBookings || !dayBookings.length) return false;
  return coveredHours(dayBookings, openHour, closeHour, totalRooms).every(Boolean);
}

export function getFreeSlotCount(dayBookings, openHour, closeHour, totalRooms = 1) {
  return coveredHours(dayBookings, openHour, closeHour, totalRooms).filter((covered) => !covered).length;
}

export function getAvailableRoomCount(
  reservedCounts,
  roomCount,
  selectedHour
) {
  const totalRooms = Number(roomCount) || 1;
  const bookedRooms = Number(
    reservedCounts?.[selectedHour] || 0
  );

  return Math.max(
    0,
    totalRooms - bookedRooms
  );
}

export function isHolidayDate(dateStr, holidays) {
  return (holidays || []).some((h) => h.date === dateStr && h.fullDay);
}

export function isOperatingDay(dateObj, operatingHours) {
  const oh = operatingHours;
  if (!oh || !Array.isArray(oh.openDays) || !oh.openDays.length) return true;
  return oh.openDays.includes(dateObj.getDay());
}

export function getFacilityAvailability(reserved, openHour, closeHour, opts = {}) {
  const { totalRooms, overlappingConfirmedBookings, now = new Date() } = opts;

  if (totalRooms != null && overlappingConfirmedBookings != null) {
    const availableRooms = totalRooms - overlappingConfirmedBookings;
    return availableRooms > 0 ? 'Available' : 'Fully Booked';
  }

  const currentHour = Math.max(openHour, now.getHours());
  let fullyBooked = currentHour < closeHour;
  for (let h = currentHour; h < closeHour && fullyBooked; h++) {
    if (!reserved.includes(h)) fullyBooked = false;
  }
  return fullyBooked ? 'Fully Booked' : 'Available';
}

export function computeDownPayment(unitPrice) {
  return Math.max(0, Math.round(Number(unitPrice) || 0));
}

export function isHourBooked(hour, reserved, totalRooms) {
  return Number(reserved?.[hour] || 0) >= totalRooms;
}

export function canBookDuration(startHour, duration, closeHour, reserved, totalRooms) {
  if (startHour + duration > closeHour) return false;
  for (let hour = startHour; hour < startHour + duration; hour++) {
    const bookedRooms = Number(reserved?.[hour] || 0);
    if (bookedRooms >= totalRooms) return false;
  }
  return true;
}

export function getSlotState(startHour, duration, closeHour, reserved, totalRooms) {
  if (isHourBooked(startHour, reserved, totalRooms)) return 'booked';
  if (startHour + duration > closeHour) return 'insufficient';
  if (!canBookDuration(startHour, duration, closeHour, reserved, totalRooms)) return 'booked';
  return 'available';
}

export function getLatestStartTime(openHour, closeHour, duration) {
  const latest = closeHour - duration;
  return latest >= openHour ? latest : null;
}

export function buildHourCounts(dayBookings) {
  const counts = {};
  (dayBookings || []).forEach((b) => {
    const start = parseInt(String(b.timeIn).split(':')[0], 10);
    for (let h = start; h < start + Number(b.duration); h++) {
      counts[h] = (counts[h] || 0) + 1;
    }
  });
  return counts;
}

export function getFreeHourCount(dayBookings, openHour, closeHour, totalRooms) {
  const reserved = buildHourCounts(dayBookings);
  let count = 0;
  for (let h = openHour; h < closeHour; h++) {
    if (!isHourBooked(h, reserved, totalRooms)) count++;
  }
  return count;
}

export function getTimePeriod(hour) {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

export function priceOptionsFor(room) {
  return room.variants && room.variants.length
    ? room.variants
    : [{
        label: 'Standard',
        price: room.price || 0,
        pax: '',
        image: room.image || '',
        description: room.description || '',
        features: room.features || [],
        roomCount: 1,
        status: 'Available',
      }];
}