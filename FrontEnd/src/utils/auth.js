const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];

export function redirectAfterLogin(user) {
  if (user?.role === 'staff') {
    window.location.href = '/admin/monitor';
    return;
  }
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  window.location.href = isAdmin ? '/admin/dashboard' : '/rooms';
}
