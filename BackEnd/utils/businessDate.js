const { TIME_ZONE } = require('./constants');
const DAY_MS = 86400000;

function businessDate(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(key, count) {
  return new Date(new Date(`${key}T00:00:00Z`).getTime() + count * DAY_MS).toISOString().slice(0, 10);
}

function dateRange(from, to, maxDays = 92) {
  if (!validDateKey(from) || !validDateKey(to)) throw Object.assign(new Error('Use valid dates in YYYY-MM-DD format.'), { status: 400 });
  const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1 || days > maxDays) throw Object.assign(new Error(`Choose a date range from 1 to ${maxDays} days.`), { status: 400 });
  return { from, to, days, start: new Date(`${from}T00:00:00+08:00`), end: new Date(`${addDays(to, 1)}T00:00:00+08:00`) };
}

module.exports = { businessDate, validDateKey, addDays, dateRange };
