const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];

export function safeReturnPath(value) {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '';
  return path;
}

export function isAdminPath(value) {
  const path = safeReturnPath(value);
  const pathname = path.split(/[?#]/, 1)[0];
  return Boolean(path && (pathname === '/admin' || pathname.startsWith('/admin/')));
}

export function isAdminReturnPath(value) {
  const path = safeReturnPath(value);
  const pathname = path.split(/[?#]/, 1)[0];
  const isLoginPath = pathname === '/admin/login' || pathname.startsWith('/admin/login/');
  return isAdminPath(path) && !isLoginPath;
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
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  const returnPath = safeReturnPath(requestedPath);
  if (isAdmin) {
    const adminReturnPath = isAdminReturnPath(returnPath) ? returnPath : '';
    window.location.href = adminReturnPath || (user.role === 'staff' ? '/admin/monitor' : '/admin/dashboard');
    return;
  }
  window.location.href = isAdminPath(returnPath) ? '/rooms' : (returnPath || '/rooms');
}
