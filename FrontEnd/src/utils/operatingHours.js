const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatClock(value, fallback) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return fallback;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${suffix}`;
}

export function operatingHoursSummary(settings, { includeDays = true } = {}) {
  const hours = settings?.operatingHours;
  const open = formatClock(hours?.openTime, '7AM');
  const close = formatClock(hours?.closeTime, '12AM');
  const openDays = Array.isArray(hours?.openDays) ? [...new Set(hours.openDays)] : [0, 1, 2, 3, 4, 5, 6];

  if (!includeDays) return `${open}–${close}`;
  if (openDays.length === 7) return `Open daily ${open}–${close}`;
  if (openDays.length === 0) return 'Temporarily closed';

  const labels = DAY_NAMES.filter((_, index) => openDays.includes(index));
  return `${labels.join(', ')} · ${open}–${close}`;
}
