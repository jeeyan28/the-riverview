import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import '../styles/admin.css';
import AdminSidebar from '../components/AdminSidebar';
import { useAuth } from '../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────
// AdminLayout — admin sidebar + topbar shell. Phase 6 built this with the
// sidebar markup inline; Phase 7 extracted the sidebar out into
// <AdminSidebar/> (src/components/AdminSidebar.jsx). Phase 11 adds the
// route guard described below. The topbar stays here (components/README
// only called out AdminSidebar specifically, and the topbar's live clock
// is the only bit of state on this page besides the guard).
//
// ── ROUTE GUARD (Phase 11) ──────────────────────────────────────────────
// admin.js's guardAdminPage() ran on every admin page load and hard-
// redirected with `window.location.href = 'login.html'` if GET
// /api/auth/me failed or came back with a non-admin role. No migrated
// page has guarded a route before now — this implements that behavior
// once, centrally, here (wrapping <Outlet/>) rather than per-page, since
// every /admin/* route needs the identical check.
//
// AuthContext.jsx already fires that /api/auth/me revalidation once on
// mount (see its header comment for why /api/auth/me is the source of
// truth rather than the cached storage value alone). This layout just
// reads the result:
//   - `initializing` true  -> still waiting on that first check; render a
//     lightweight loading state instead of either the panel or a
//     premature redirect (a logged-in admin doing a hard refresh on e.g.
//     /admin/settings must not get bounced to /login just because the
//     network call hasn't resolved yet).
//   - `initializing` false, not an admin (`isAdmin` false — covers both
//     "not logged in at all" and "logged in as a plain `user`") -> redirect
//     to /login, via React Router's <Navigate/> rather than
//     window.location.href. A client-side navigate is enough here (unlike
//     Login.jsx's post-login redirect, there's no app-wide state that
//     needs a full reload to pick up — AuthContext is already the shared
//     state) and it avoids an unnecessary full page reload.
//   - otherwise -> render the real shell + <Outlet/>.
// ─────────────────────────────────────────────────────────────────────────

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
                background: 'rgba(0,201,167,.1)',
                borderColor: 'rgba(0,201,167,.3)',
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
