const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];

export function safeReturnPath(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '';
  return path;
}

export function buildLoginPath(returnTo = '/rooms', options = {}) {
  const params = new URLSearchParams();
  const safePath = safeReturnPath(returnTo);
  if (safePath) params.set('returnTo', safePath);
  if (options.createAccount) params.set('mode', 'register');
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

export function buildRoomReservationPath(roomId, variantLabel = '') {
  const params = new URLSearchParams({ reserve: '1' });
  if (variantLabel) params.set('variant', variantLabel);
  return `/rooms/${encodeURIComponent(roomId)}?${params.toString()}`;
}

export function redirectAfterLogin(user, requestedPath = '') {
  if (user?.role === 'staff') {
    window.location.href = '/admin/monitor';
    return;
  }
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const returnPath = safeReturnPath(requestedPath);
  window.location.href = isAdmin ? '/admin/dashboard' : (returnPath || '/rooms');
}
