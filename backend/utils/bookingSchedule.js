const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const { bookingStartMs } = require('./bookingLifecycle');

function shiftDate(date, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  const start = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(start)) return null;
  return new Date(start + days * DAY_MS).toISOString().slice(0, 10);
}

function nearbyDates(date) {
  return [shiftDate(date, -1), date, shiftDate(date, 1)].filter(Boolean);
}

function relativeHour(serviceDate, actualDate, timeIn) {
  const serviceDay = Date.parse(`${serviceDate}T00:00:00Z`);
  const actualDay = Date.parse(`${actualDate}T00:00:00Z`);
  const clockHour = Number.parseInt(String(timeIn).split(':')[0], 10);
  return Math.round((actualDay - serviceDay) / DAY_MS) * 24 + clockHour;
}

function availabilityRows(rows, serviceDate) {
  return rows.map((row) => ({
    timeIn: `${relativeHour(serviceDate, row.date, row.timeIn)}:00`,
    duration: row.duration,
  }));
}

function operatingWindowForStart(date, timeIn, openTime, closeTime) {
  const openHour = Number.parseInt(String(openTime || '00:00').split(':')[0], 10);
  let closeHour = Number.parseInt(String(closeTime || '00:00').split(':')[0], 10);
  if (closeHour <= openHour) closeHour += 24;
  const clockHour = Number.parseInt(String(timeIn).split(':')[0], 10);
  const serviceDate = closeHour > 24 && clockHour < closeHour - 24 ? shiftDate(date, -1) : date;
  return { serviceDate, serviceHour: relativeHour(serviceDate, date, timeIn), openHour, closeHour };
}

function occupiedCountAt(rows, hourStart) {
  return rows.filter((row) => {
    const start = bookingStartMs(row.date, row.timeIn);
    return hourStart >= start && hourStart < start + Number(row.duration) * HOUR_MS;
  }).length;
}

module.exports = { HOUR_MS, shiftDate, nearbyDates, relativeHour, availabilityRows, operatingWindowForStart, occupiedCountAt };
