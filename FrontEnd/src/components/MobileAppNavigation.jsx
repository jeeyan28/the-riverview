import { useEffect, useRef } from 'react';
import { Activity, BarChart3, CalendarDays, DoorOpen, House, LayoutDashboard, Menu, MessageCircle, UserRound } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { buildLoginPath } from '../utils/auth';

function scrollNavWithWheel(event) {
  const nav = event.currentTarget;
  if (nav.scrollWidth <= nav.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
  event.preventDefault();
  nav.scrollLeft += event.deltaY;
}

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
      className={`customer-app-nav app-nav-scrollable${obscured ? ' is-obscured' : ''}`}
      aria-label="Customer app navigation"
      aria-hidden={obscured || undefined}
      inert={obscured ? '' : undefined}
      onWheel={scrollNavWithWheel}
    >
      <NavLink to="/" end className={({ isActive }) => `app-nav-item${isActive ? ' active' : ''}`}>
        <House size={20} aria-hidden="true" />
        <span>Home</span>
      </NavLink>
      <NavLink to={user ? '/rooms' : buildLoginPath('/rooms')} className={({ isActive }) => `app-nav-item${isActive ? ' active' : ''}`}>
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
        <span>{user ? 'Account' : 'Sign in'}</span>
      </button>
    </nav>
  );
}

function AdminAppNavigation({ hasPermission, menuOpen = false, onOpenMenu }) {
  const location = useLocation();
  const navRef = useRef(null);
  const candidates = [
    { to: '/admin/monitor', label: 'Monitor', icon: Activity, permission: 'room:view' },
    { to: '/admin/bookings', label: 'Bookings', icon: CalendarDays, permission: 'booking:view' },
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'reports:view' },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3, permission: 'reports:view' },
    { to: '/admin/room-management', label: 'Spaces', icon: DoorOpen, permission: 'room:manage' },
  ];
  const links = candidates.filter((item) => !item.permission || hasPermission(item.permission));
  const moreActive = menuOpen || !links.some((item) => location.pathname === item.to);

  useEffect(() => {
    navRef.current?.querySelector('.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [location.pathname, menuOpen]);

  return (
    <nav className="admin-app-nav" aria-label="Staff app navigation">
      <div ref={navRef} className="admin-app-nav-links app-nav-scrollable" onWheel={scrollNavWithWheel}>
        {links.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `app-nav-item${isActive ? ' active' : ''}`}>
            <item.icon size={20} aria-hidden="true" />
            <span>{item.label === 'Bookings' ? 'Reservations' : item.label}</span>
          </NavLink>
        ))}
      </div>
      <button
        type="button"
        className={`app-nav-item admin-app-nav-more${moreActive ? ' active' : ''}`}
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
