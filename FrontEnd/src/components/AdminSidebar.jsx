import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────
// AdminSidebar — the admin tab navigation, extracted out of AdminLayout.jsx
// (Phase 6) into its own component (Phase 7). Phase 11 wires the two
// pieces that were deferred since then:
//
//   1. Real logged-in admin name/avatar/role (sb-admin-name/sb-admin-av/
//      sb-admin-role) — was hardcoded "Rivera Admin" / "RA" / "Super
//      Admin". Now sourced from AuthContext's `user`, same fields
//      guardAdminPage() used: `${user.firstname} ${user.lastname}`.trim(),
//      initials from firstname[0]+lastname[0], and user.roleLabel (falling
//      back to the ROLE_LABELS mirror inside AuthContext if roleLabel is
//      ever missing — matches admin.js's own `user.roleLabel ||
//      ROLE_LABELS[user.role] || user.role` fallback chain exactly).
//
//   2. Permission- and role-gated sidebar items. A follow-up audit found
//      admin.html actually gates sidebar buttons with TWO attributes,
//      checked in two separate passes by admin.js's applyRoleVisibility():
//        - data-requires-permission (checked via hasAdminPermission()):
//          POS -> "pos:access", Reports -> "reports:view",
//          Forecasting -> "forecasting:view", Manage Users -> "admin:manage",
//          Settings -> "settings:view".
//        - data-requires-role="role1,role2" (checked via an allow-list
//          against the session role): Dashboard, Analytics, and Login
//          History all require "manager,super_admin".
//      Monitor, Bookings, and Profile have no gate in the original and
//      stay visible to every admin role. NAV_SECTIONS below has two
//      optional fields to reproduce both mechanisms: `permission` (checked
//      against AuthContext's hasPermission(), itself reading the real
//      server-provided user.permissions array) and `roles` (checked
//      directly against user.role, which AuthContext already exposes raw
//      — no need to duplicate admin.js's ROLE_PERMISSIONS table in React,
//      matching the same reasoning AuthContext's own header comment gives
//      for not re-mirroring it). applyRoleGate() in the original defaulted
//      ungated + un-annotated elements to visible, which an absent
//      `permission`/`roles` field reproduces here for free.
//
// Logout: admin.js's #admin-logout-btn handler POSTed /api/auth/logout,
// cleared both storage keys, then hard-redirected to login.html. That's
// now AuthContext's logout() — this component just calls it and then
// client-side navigates (no full reload needed; see AdminLayout.jsx's
// route-guard note for why a <Navigate/>-style client redirect is enough
// post-Phase-11, unlike Login.jsx's post-login redirect which still needs
// a full reload for unrelated reasons documented there).
// ─────────────────────────────────────────────────────────────────────────

// Role slugs allowed for every data-requires-role="manager,super_admin" item
// in admin.html (Dashboard, Analytics, Login History). Kept as one shared
// constant rather than repeating the array literal three times.
const MANAGER_UP = ['manager', 'super_admin'];

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { to: '/admin/dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard', roles: MANAGER_UP },
      { to: '/admin/monitor', icon: 'ti-device-desktop-analytics', label: 'Room Monitor' },
      { to: '/admin/bookings', icon: 'ti-calendar-event', label: 'Bookings' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/admin/analytics', icon: 'ti-chart-bar', label: 'Analytics', roles: MANAGER_UP },
      { to: '/admin/reports', icon: 'ti-file-analytics', label: 'Reports', permission: 'reports:view' },
      { to: '/admin/forecasting', icon: 'ti-trending-up', label: 'Forecasting', permission: 'forecasting:view' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/users', icon: 'ti-users-group', label: 'Manage Users', permission: 'admin:manage' },
      { to: '/admin/logs', icon: 'ti-lock-access', label: 'Login History', roles: MANAGER_UP },
      { to: '/admin/settings', icon: 'ti-settings', label: 'Settings', permission: 'settings:view' },
      { to: '/admin/profile', icon: 'ti-user-circle', label: 'Profile' },
    ],
  },
];

// Exported so AdminLayout can look up the matching page-title without
// duplicating this list.
export const PAGE_TITLES = {
  dashboard: 'Dashboard',
  monitor: 'Room Monitor',
  bookings: 'Bookings',
  analytics: 'Analytics',
  reports: 'Reports',
  forecasting: 'Forecasting',
  users: 'Manage Users',
  logs: 'Login History',
  settings: 'Settings',
  profile: 'Profile',
};

function fullName(user) {
  if (!user) return 'Admin';
  return `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'Admin';
}

function initialsOf(user) {
  if (!user) return 'A';
  const initials = (user.firstname?.[0] || '') + (user.lastname?.[0] || '');
  return (initials || 'A').toUpperCase();
}

function AdminSidebar({ onNavigate }) {
  const { user, roleLabel, hasPermission, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div id="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">RV</div>
        <div>
          <div className="sb-title">Riverview</div>
          <div className="sb-sub">Admin Panel</div>
        </div>
      </div>

      <div className="sb-nav">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (item) =>
              (!item.permission || hasPermission(item.permission)) &&
              (!item.roles || item.roles.includes(user?.role))
          );
          // A section with every item hidden (e.g. a Staff account seeing
          // an all-gated "Admin" section) still shows its label in the
          // original's DOM-hiding approach only because admin.html never
          // hides the <div class="sb-section"> heading itself — only the
          // <button> below it. Reproduced faithfully: skip rendering the
          // section only if it has zero items to begin with, never based
          // on how many survived the permission filter.
          if (visibleItems.length === 0 && section.items.length > 0) {
            // Still render the heading with no items beneath it, matching
            // that original per-button (not per-section) hiding behavior.
            return (
              <div key={section.label}>
                <div className="sb-section">{section.label}</div>
              </div>
            );
          }
          return (
            <div key={section.label}>
              <div className="sb-section">{section.label}</div>
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
                  onClick={() => onNavigate?.(PAGE_TITLES[item.to.split('/').pop()])}
                >
                  <i className={`ti ${item.icon}`}></i>
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      <div className="sb-bottom">
        <div className="admin-info-row">
          <div className="admin-av" id="sb-admin-av">{initialsOf(user)}</div>
          <div>
            <div className="admin-name" id="sb-admin-name">{fullName(user)}</div>
            <div className="admin-role" id="sb-admin-role">{roleLabel || 'Admin'}</div>
          </div>
          <i
            className="ti ti-logout"
            id="admin-logout-btn"
            onClick={handleLogout}
            style={{ fontSize: 14, color: 'var(--muted)', marginLeft: 'auto', cursor: 'pointer' }}
          ></i>
        </div>
      </div>
    </div>
  );
}

export default AdminSidebar;