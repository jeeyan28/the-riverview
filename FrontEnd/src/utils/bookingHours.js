const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function shiftBookingDate(date, days) {
  const start = Date.parse(`${date}T00:00:00Z`);
  return new Date(start + days * DAY_MS).toISOString().slice(0, 10);
}

export function slotStartMs(serviceDate, serviceHour) {
  return Date.parse(`${serviceDate}T00:00:00+08:00`) + serviceHour * HOUR_MS;
}

export function slotBookingFields(serviceDate, serviceHour) {
  const dayOffset = Math.floor(serviceHour / 24);
  return {
    date: shiftBookingDate(serviceDate, dayOffset),
    timeIn: `${String(serviceHour % 24).padStart(2, '0')}:00`,
  };
}

export function relativeBookingHour(serviceDate, actualDate, timeIn) {
  const serviceDay = Date.parse(`${serviceDate}T00:00:00Z`);
  const actualDay = Date.parse(`${actualDate}T00:00:00Z`);
  return Math.round((actualDay - serviceDay) / DAY_MS) * 24 + Number.parseInt(String(timeIn).split(':')[0], 10);
}
