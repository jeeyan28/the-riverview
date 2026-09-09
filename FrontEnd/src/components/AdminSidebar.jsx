import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  CalendarDays,
  FileBarChart,
  History,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo/logoo.png';

const SIDEBAR_COLLAPSED_KEY = 'rv_admin_sidebar_collapsed';

const MANAGER_UP = ['manager', 'super_admin'];

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: MANAGER_UP },
      { to: '/admin/monitor', icon: BarChart3, label: 'Live Monitor' },
      { to: '/admin/bookings', icon: CalendarDays, label: 'Reservations' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/admin/analytics', icon: BarChart3, label: 'Analytics', roles: MANAGER_UP },
      { to: '/admin/reports', icon: FileBarChart, label: 'Reports', permission: 'reports:view' },
      { to: '/admin/forecasting', icon: TrendingUp, label: 'Forecasting', permission: 'forecasting:view' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/users', icon: Users, label: 'Team & Users', permission: 'admin:manage' },
      { to: '/admin/logs', icon: History, label: 'Login History', roles: MANAGER_UP },
      { to: '/admin/room-management', icon: Building2, label: 'Facilities', permission: 'room:manage' },
      { to: '/admin/settings', icon: Settings, label: 'Settings', permission: 'settings:view' },
    ],
  },
];

export const PAGE_TITLES = {
  dashboard: 'Dashboard',
  monitor: 'Live Monitor',
  bookings: 'Reservations',
  analytics: 'Analytics',
  reports: 'Reports',
  forecasting: 'Forecasting',
  users: 'Team & Users',
  logs: 'Login History',
  'room-management': 'Facilities',
  settings: 'Settings',
};

export const PAGE_CONTEXT = {
  dashboard: 'Business overview',
  monitor: 'Live operations',
  bookings: 'Booking operations',
  analytics: 'Performance insights',
  reports: 'Financial records',
  forecasting: 'Revenue planning',
  users: 'Access management',
  logs: 'Security activity',
  'room-management': 'Inventory & pricing',
  settings: 'Business configuration',
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
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());

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
      cancelAnimationFrame(focusFrame);
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
        {collapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
      </button>

      <button
        ref={closeButtonRef}
        type="button"
        className="admin-drawer-close"
        onClick={onClose}
        aria-label="Close navigation menu"
      >
        <X size={18} aria-hidden="true" />
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
                  <item.icon size={18} aria-hidden="true" />
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
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default AdminSidebar;
