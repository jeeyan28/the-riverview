import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import '../styles/admin.css';
import AdminSidebar from '../components/AdminSidebar';
import { useAuth } from '../context/AuthContext';


function AdminLayout() {
  // AdminSidebar reads `user`/`logout` itself via useAuth() directly — this
  // layout only needs the two route-guard fields.
  const { initializing, isAdmin } = useAuth();
  const [liveTime, setLiveTime] = useState('');
  const [pageTitle, setPageTitle] = useState('Dashboard');

  // Same one-second clock chip as the old #live-time span.
  useEffect(() => {
    function tick() {
      setLiveTime(new Date().toLocaleTimeString());
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (initializing) {
    // Deliberately plain/unstyled — this is only visible for the brief
    // window of the first /api/auth/me round-trip, same moment
    // guardAdminPage() used to leave the old static admin.html sitting
    // there un-interactive with no loading indicator at all. A minimal
    // one is strictly better than nothing and not worth over-designing.
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
    <div id="app">
      <AdminSidebar onNavigate={setPageTitle} />

      {/* ── MAIN ── */}
      <div id="main">
        <div className="topbar">
          <span className="page-title" id="page-title">{pageTitle}</span>
          <div className="topbar-right">
            <div className="tb-chip"><i className="ti ti-map-pin"></i>San Rafael Caingin</div>
            <div className="tb-chip"><i className="ti ti-clock"></i><span id="live-time">{liveTime}</span></div>
            {/* Same login session works on the public site — this just navigates,
                it never logs the admin out or requires them to sign in again. */}
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