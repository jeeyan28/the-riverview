import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/admin/shared.css';
import AdminSidebar, { PAGE_TITLES } from '../components/AdminSidebar';
import ThemeToggle from '../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';

const ADMIN_THEME_KEY = 'rv_admin_theme';

function AdminLayout() {
  const { initializing, isAdmin } = useAuth();
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname.split('/').pop()] || 'Dashboard';
  const [liveTime, setLiveTime] = useState('');
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

  function toggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  useEffect(() => {
    function tick() {
      setLiveTime(new Date().toLocaleTimeString());
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (initializing) {
    return (
      <div style={{ padding: '3rem', fontFamily: 'sans-serif', color: 'var(--muted, #888)' }}>
        Checking your session…
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div id="app" data-theme={theme}>
      <AdminSidebar />

      <div id="main">
        <div className="topbar">
          <span className="page-title" id="page-title">{pageTitle}</span>
          <div className="topbar-right">
            <div className="tb-chip"><i className="ti ti-map-pin"></i>San Rafael Caingin</div>
            <div className="tb-chip"><i className="ti ti-clock"></i><span id="live-time">{liveTime}</span></div>
            <a
              className="tb-chip"
              id="view-user-site-btn"
              href="/"
              target="_blank"
              rel="noreferrer"
              style={{
                cursor: 'pointer',
                background: 'rgba(239,62,109,.08)',
                borderColor: 'rgba(239,62,109,.25)',
                color: 'var(--teal)',
                textDecoration: 'none',
              }}
              title="Open the public-facing site in a new tab"
            >
              <i className="ti ti-external-link"></i>View User Site
            </a>
            <button className="notif-btn" aria-label="Notifications">
              <i className="ti ti-bell"></i><span className="notif-dot"></span>
            </button>
            <ThemeToggle id="admin-theme-toggle" theme={theme} onToggle={toggleTheme} />
          </div>
        </div>

        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;