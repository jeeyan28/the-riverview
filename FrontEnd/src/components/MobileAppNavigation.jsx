import { Activity, CalendarDays, DoorOpen, House, LayoutDashboard, Menu, MessageCircle, UserRound } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

function CustomerAppNavigation({ user, profileOpen = false, obscured = false, onOpenProfile }) {
  const navigate = useNavigate();

  function handleAccount() {
    if (user) {
      onOpenProfile?.();
      return;
    }
    navigate('/login');
  }

  return (
    <nav
      className={`customer-app-nav${obscured ? ' is-obscured' : ''}`}
      aria-label="Customer app navigation"
      aria-hidden={obscured || undefined}
      inert={obscured ? '' : undefined}
    >
      <NavLink to="/" end className={({ isActive }) => `app-nav-item${isActive ? ' active' : ''}`}>
        <House size={20} aria-hidden="true" />
        <span>Home</span>
      </NavLink>
      <NavLink to="/rooms" className={({ isActive }) => `app-nav-item app-nav-item--primary${isActive ? ' active' : ''}`}>
        <DoorOpen size={20} aria-hidden="true" />
        <span>Reserve</span>
      </NavLink>
      <NavLink to="/contact" className={({ isActive }) => `app-nav-item${isActive ? ' active' : ''}`}>
        <MessageCircle size={20} aria-hidden="true" />
        <span>Contact</span>
      </NavLink>
      <button
        type="button"
        className={`app-nav-item${profileOpen ? ' active' : ''}`}
        aria-pressed={profileOpen}
        onClick={handleAccount}
      >
        <UserRound size={20} aria-hidden="true" />
        <span>{user ? 'Account' : 'Log in'}</span>
      </button>
    </nav>
  );
}

function AdminAppNavigation({ hasPermission, menuOpen = false, onOpenMenu }) {
  const location = useLocation();
  const candidates = [
    { to: '/admin/monitor', label: 'Monitor', icon: Activity, permission: 'room:view' },
    { to: '/admin/bookings', label: 'Bookings', icon: CalendarDays, permission: 'booking:view' },
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'reports:view' },
    { to: '/admin/room-management', label: 'Facilities', icon: DoorOpen, permission: 'room:manage' },
  ];
  const links = candidates.filter((item) => hasPermission(item.permission)).slice(0, 3);
  const moreActive = menuOpen || !links.some((item) => location.pathname === item.to);

  return (
    <nav className="admin-app-nav" aria-label="Staff app navigation">
      {links.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `app-nav-item${isActive ? ' active' : ''}`}>
          <item.icon size={20} aria-hidden="true" />
          <span>{item.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={`app-nav-item${moreActive ? ' active' : ''}`}
        aria-expanded={menuOpen}
        aria-controls="sidebar"
        onClick={onOpenMenu}
      >
        <Menu size={20} aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}

export { AdminAppNavigation, CustomerAppNavigation };
