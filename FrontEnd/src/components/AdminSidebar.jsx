import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo/logoo.png';

const SIDEBAR_COLLAPSED_KEY = 'rv_admin_sidebar_collapsed';

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
      { to: '/admin/room-management', icon: 'ti-building', label: 'Room Management', permission: 'room:manage' },
      { to: '/admin/settings', icon: 'ti-settings', label: 'Settings', permission: 'settings:view' },
    ],
  },
];

export const PAGE_TITLES = {
  dashboard: 'Dashboard',
  monitor: 'Room Monitor',
  bookings: 'Bookings',
  analytics: 'Analytics',
  reports: 'Reports',
  forecasting: 'Forecasting',
  users: 'Manage Users',
  logs: 'Login History',
  'room-management': 'Room Management',
  settings: 'Settings',
};

function fullName(user) {
  if (!user) return 'Admin';
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  return name || 'Admin';
}

function initialsOf(user) {
  if (!user) return 'A';
  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('');
  return (initials || 'A').toUpperCase();
}

function AdminSidebar() {
  const { user, roleLabel, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
    }
  }, [collapsed]);

  useEffect(() => {
    const activeItem = navRef.current?.querySelector('.sb-item.active');
    activeItem?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div id="sidebar" className={collapsed ? 'collapsed' : ''}>
      <button
        type="button"
        className="sb-toggle-btn"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <i className={`ti ${collapsed ? 'ti-chevron-right' : 'ti-chevron-left'}`}></i>
      </button>

      <div className="sb-brand">
        <img className="sb-logo" src={logo} alt="Riverview Logo" />
        {!collapsed && (
          <div>
            <div className="sb-title">Riverview</div>
            <div className="sb-sub">Admin Panel</div>
          </div>
        )}
      </div>

      <div className="sb-nav" ref={navRef}>
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (item) =>
              (!item.permission || hasPermission(item.permission)) &&
              (!item.roles || item.roles.includes(user?.role))
          );
          if (visibleItems.length === 0 && section.items.length > 0) {
            return collapsed ? null : (
              <div key={section.label}>
                <div className="sb-section">{section.label}</div>
              </div>
            );
          }
          return (
            <div key={section.label}>
              {!collapsed && <div className="sb-section">{section.label}</div>}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
                  title={item.label}
                  data-tooltip={item.label}
                >
                  <i className={`ti ${item.icon}`}></i>
                  {!collapsed && item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </div>

      <div className="sb-bottom">
        <div className="admin-info-row">
          <div className="admin-av" id="sb-admin-av" title={fullName(user)} data-tooltip={fullName(user)}>
            {initialsOf(user)}
          </div>
          {!collapsed && (
            <div>
              <div className="admin-name" id="sb-admin-name">{fullName(user)}</div>
              <div className="admin-role" id="sb-admin-role">{roleLabel || 'Admin'}</div>
            </div>
          )}
          <i
            className="ti ti-logout sb-logout-icon"
            id="admin-logout-btn"
            onClick={handleLogout}
            title="Logout"
            style={{ fontSize: 14, marginLeft: collapsed ? 0 : 'auto' }}
          ></i>
        </div>
      </div>
    </div>
  );
}

export default AdminSidebar;