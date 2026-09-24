export function timeAgo(date) {
  if (!date) return '';
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));

  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatTime12(value, fallback = '—') {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!match) return fallback;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}
