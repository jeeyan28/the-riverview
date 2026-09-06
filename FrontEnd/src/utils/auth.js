const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];

export function redirectAfterLogin(user) {
  const isAdmin = ADMIN_ROLES.includes(user?.role);
  window.location.href = isAdmin ? '/admin/dashboard' : '/';
}
