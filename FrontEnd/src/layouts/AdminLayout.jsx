import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Clock3, ExternalLink, MapPin, Menu } from 'lucide-react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/admin/shared.css';
import AdminSidebar, { PAGE_CONTEXT, PAGE_TITLES } from '../components/AdminSidebar';
import ThemeToggle from '../components/ThemeToggle';
import PageTransition from '../components/PageTransition';
import RiverviewLoader from '../components/RiverviewLoader';
import { useAuth } from '../context/AuthContext';
import { AdminAppNavigation } from '../components/MobileAppNavigation';

const ADMIN_THEME_KEY = 'rv_admin_theme';

function AdminLayout() {
  const { initializing, isAdmin, hasPermission } = useAuth();
  const location = useLocation();
  const pageKey = location.pathname.split('/').pop();
  const pageTitle = PAGE_TITLES[pageKey] || 'Dashboard';
  const pageContext = PAGE_CONTEXT[pageKey] || 'Operations workspace';
  const [liveTime, setLiveTime] = useState({ time: '', date: '' });
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia('(max-width: 1200px)').matches);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const openMobileMenu = useCallback((event) => {
    menuTriggerRef.current = event?.currentTarget || menuButtonRef.current;
    setMobileMenuOpen(true);
  }, []);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_THEME_KEY, theme);
    } catch {
    }
  }, [theme]);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1200px)');
    function updateNavigation(event) {
      setCompactNavigation(event.matches);
      if (!event.matches) setMobileMenuOpen(false);
    }
    query.addEventListener('change', updateNavigation);
    return () => query.removeEventListener('change', updateNavigation);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  useEffect(() => {
    function tick() {
      const now = new Date();
      setLiveTime({
        time: new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila',
          hour: 'numeric',
          minute: '2-digit',
        }).format(now),
        date: new Intl.DateTimeFormat('en-PH', {
          timeZone: 'Asia/Manila',
          month: 'short',
          day: 'numeric',
        }).format(now),
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (initializing) {
    return <RiverviewLoader message="Checking your staff session…" />;
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div id="app" data-theme={theme}>
      <AdminSidebar
        compact={compactNavigation}
        mobileOpen={mobileMenuOpen}
        onClose={closeMobileMenu}
        triggerRef={menuTriggerRef}
      />
      {compactNavigation && mobileMenuOpen && (
        <div className="admin-nav-backdrop" onClick={closeMobileMenu} aria-hidden="true" />
      )}

      <div id="main" inert={compactNavigation && mobileMenuOpen ? '' : undefined}>
        <div className="topbar">
          <div className="admin-topbar-heading">
            <button
              ref={menuButtonRef}
              type="button"
              className="admin-menu-button"
              aria-label="Open navigation menu"
              aria-controls="sidebar"
              aria-expanded={mobileMenuOpen}
              onClick={openMobileMenu}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="admin-title-stack">
              <span className="admin-page-eyebrow">{pageContext}</span>
              <span className="page-title" id="page-title">{pageTitle}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="tb-chip admin-location-chip"><MapPin size={14} aria-hidden="true" />Caingin, San Rafael</div>
            <div className="tb-chip admin-clock-chip" title={`Philippine time · ${liveTime.date}`}><Clock3 size={14} aria-hidden="true" /><span id="live-time">{liveTime.time}</span></div>
            <a
              className="tb-chip admin-site-link"
              id="view-user-site-btn"
              href="/"
              target="_blank"
              rel="noreferrer"
              title="Open the public-facing site in a new tab"
              aria-label="View user site (opens in a new tab)"
            >
              <ExternalLink size={14} aria-hidden="true" /><span className="admin-site-link-label">Customer site</span>
            </a>
            <ThemeToggle id="admin-theme-toggle" theme={theme} onToggle={toggleTheme} />
          </div>
        </div>

        <div className="content">
          <PageTransition variant="admin" />
        </div>

        <AdminAppNavigation
          hasPermission={hasPermission}
          menuOpen={mobileMenuOpen}
          onOpenMenu={openMobileMenu}
        />
      </div>
      <div className="modal-portal-root" data-modal-portal />
    </div>
  );
}

export default AdminLayout;
