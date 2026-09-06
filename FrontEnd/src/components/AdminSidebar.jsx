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
      { to: '/admin/bookings', icon: 'ti-calendar-event', label: 'Reservations' },
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
  bookings: 'Reservations',
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

function AdminSidebar({ compact = false, mobileOpen = false, onClose, triggerRef }) {
  const { user, roleLabel, hasPermission, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);
  const sidebarRef = useRef(null);
  const closeButtonRef = useRef(null);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const isCollapsed = collapsed && !compact;

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
    }
  }, [collapsed]);

  useEffect(() => {
    if (compact && !mobileOpen) return;
    const activeItem = navRef.current?.querySelector('.sb-item.active');
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [location.pathname, compact, mobileOpen]);

  useEffect(() => {
    if (!compact || !mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = [...sidebarRef.current.querySelectorAll('a[href], button:not([disabled])')]
        .filter((element) => element.offsetParent !== null);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      triggerRef?.current?.focus();
    };
  }, [compact, mobileOpen, onClose, triggerRef]);

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside
      id="sidebar"
      ref={sidebarRef}
      className={`${isCollapsed ? 'collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
      role={compact ? 'dialog' : undefined}
      aria-label="Admin navigation"
      aria-modal={compact && mobileOpen ? true : undefined}
      aria-hidden={compact && !mobileOpen ? true : undefined}
      inert={compact && !mobileOpen ? '' : undefined}
    >
      <button
        type="button"
        className="sb-toggle-btn"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        aria-controls="admin-sidebar-navigation"
      >
        <i className={`ti ${collapsed ? 'ti-chevron-right' : 'ti-chevron-left'}`}></i>
      </button>

      <button
        ref={closeButtonRef}
        type="button"
        className="admin-drawer-close"
        onClick={onClose}
        aria-label="Close navigation menu"
      >
        <i className="ti ti-x" aria-hidden="true"></i>
      </button>

      <div className="sb-brand">
        <img className="sb-logo" src={logo} alt="Riverview Logo" />
        {!isCollapsed && (
          <div>
            <div className="sb-title">Riverview</div>
            <div className="sb-sub">Admin Panel</div>
          </div>
        )}
      </div>

      <nav className="sb-nav" id="admin-sidebar-navigation" ref={navRef} aria-label="Administration">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(
            (item) =>
              (!item.permission || hasPermission(item.permission)) &&
              (!item.roles || item.roles.includes(user?.role))
          );
          if (visibleItems.length === 0 && section.items.length > 0) {
            return isCollapsed ? null : (
              <div key={section.label}>
                <div className="sb-section">{section.label}</div>
              </div>
            );
          }
          return (
            <div key={section.label}>
              {!isCollapsed && <div className="sb-section">{section.label}</div>}
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
                  title={item.label}
                  data-tooltip={item.label}
                  aria-label={item.label}
                  onClick={compact ? onClose : undefined}
                >
                  <i className={`ti ${item.icon}`} aria-hidden="true"></i>
                  {!isCollapsed && item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="sb-bottom">
        <div className="admin-info-row">
          <div className="admin-av" id="sb-admin-av" title={fullName(user)} data-tooltip={fullName(user)}>
            {initialsOf(user)}
          </div>
          {!isCollapsed && (
            <div className="admin-user-details">
              <div className="admin-name" id="sb-admin-name">{fullName(user)}</div>
              <div className="admin-role" id="sb-admin-role">{roleLabel || 'Admin'}</div>
            </div>
          )}
          <button
            type="button"
            className="sb-logout-button"
            id="admin-logout-btn"
            onClick={handleLogout}
            title="Logout"
            aria-label="Log out"
          >
            <i className="ti ti-logout" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </aside>
  );
}

export default AdminSidebar;
