import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import { useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Admin/Dashboard';
import Bookings from './pages/Admin/Bookings';
import Monitor from './pages/Admin/Monitor';
import Analytics from './pages/Admin/Analytics';
import Users from './pages/Admin/Users';
import Reports from './pages/Admin/Reports';
import Settings from './pages/Admin/Settings';
import Profile from './pages/Admin/Profile';
import Forecasting from './pages/Admin/Forecasting';

// ─────────────────────────────────────────────────────────────────────────
// Phase 6 — Layout Migration. Phase 8/9/10 — Page Migration (now complete;
// every real admin.html panel has a migrated React page — see the
// route → old file mapping below. /admin/logs is the sole intentional
// exception, a permanent TempPage by design, not a gap).
//
// POS (/admin/pos ← admin.html panel-pos) was intentionally REMOVED post-
// migration per product decision — feature not needed. Route, sidebar
// entry, page component, and service file deleted. Backend /api/pos/*
// endpoints were left untouched (not part of this removal's scope).
//
// This wires the three shells built in Phase 6 (MainLayout, AuthLayout,
// AdminLayout) into React Router. Remaining routes below still render a
// one-line TEMPORARY placeholder (marked clearly below); Phase 8 replaces
// each with its real src/pages/*.jsx file one page (or small group) at a
// time, without needing to touch this routing structure again.
//
// Route → old file mapping (confirmed against pages/README.md from Phase 5):
//   /                    ← index.html            (MainLayout)   — DONE (Home.jsx)
//   /login               ← login.html            (AuthLayout)   — DONE
//   /register            ← register.html         (AuthLayout)   — DONE
//   /forgot-password     ← forgot-password.html   (AuthLayout)   — DONE
//   /reset-password      ← reset-password.html    (AuthLayout)   — DONE
//   /admin/dashboard      ← admin.html panel-dashboard (AdminLayout) — DONE
//   /admin/bookings       ← admin.html panel-bookings  (AdminLayout) — DONE
//   /admin/monitor        ← admin.html panel-monitor   (AdminLayout) — DONE
//   /admin/analytics      ← admin.html panel-analytics (AdminLayout) — DONE
//   /admin/users          ← admin.html panel-users  (AdminLayout)   — DONE (Phase 8, part 8)
//   /admin/reports        ← admin.html panel-reports (AdminLayout)  — DONE (Phase 8, part 9)
//   /admin/settings       ← admin.html panel-settings (AdminLayout) — DONE (Phase 8,
//                            parts 10a–10e: all 6 tabs — Facilities, Pricing,
//                            Promotion, Announcements, Payment Methods, Audit
//                            Log — see Settings.jsx header)
//   /admin/profile        ← admin.html panel-profile  (AdminLayout) — DONE (Phase 9;
//                            see Profile.jsx header — NOT static like Settings'
//                            Pricing/Promotion/Audit tabs, has real save/
//                            change-password wiring via a second legacy script,
//                            js/admin-profile.js, that Phase 8's investigations
//                            hadn't needed to look at)
//   /admin/forecasting    ← admin.html panel-forecasting (AdminLayout) — DONE (Phase 10;
//                            see Forecasting.jsx header — real GET /api/forecast data,
//                            not mock like Analytics.jsx; permission gating
//                            [data-requires-permission="forecasting:view"] still
//                            DEFERRED to Phase 11's AuthContext, same as every
//                            other admin page so far — server-side Owner-only
//                            enforcement via requirePermission still applies)
//
// /admin/logs stays a TempPage on purpose (Phase 8, part 8): admin.html's
// own panel-logs is itself just a static "not tracked yet, see the Manage
// Users Last Login column" notice — there's no real panel content to
// port yet. See Users.jsx's header comment.
//
// PHASE 11: AuthContext (src/context/AuthContext.jsx) now wraps the whole
// app (see main.jsx) and AdminLayout.jsx guards every /admin/* route —
// unauthenticated or non-admin access redirects to /login. No route
// structure below changed; this is purely the cross-cutting auth/
// permission layer admin.js's guardAdminPage() used to provide. See
// AuthContext.jsx's own header comment for the two explicit design
// decisions made (source-of-truth on mount; central vs per-page guarding).
//
// "/reset-password/:token" (a path param). The backend actually emails
// links as "reset-password.html?token=..." (a query string — see
// Backend/routes/auth.js's resetUrl), so the path-param route would never
// match a real emailed link. Corrected to a plain path; ResetPassword.jsx
// reads ?token= via useSearchParams instead.
//
// Home.jsx (this phase) covers only the STATIC parts of the old index.html:
// hero carousel, live room grid, Spaces, About. The booking modal and
// profile modal (both overlays that live "inside" index.html, not separate
// routes) are each their own upcoming phase — see Home.jsx's header comment.
// ─────────────────────────────────────────────────────────────────────────

// TEMPORARY placeholders — deleted in Phase 8 once the real page exists.
function TempPage({ name }) {
  return (
    <div style={{ padding: '3rem', fontFamily: 'sans-serif' }}>
      <p>
        <strong>{name}</strong> — placeholder content. Built in Phase 8 (Page Migration).
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// RequirePermission — POST-AUDIT CLEANUP follow-up. Users.jsx's own header
// comment flagged that its guardPermission('admin:manage', ...) call sites
// (ported from admin.js's renderUsersPanel()/openAddUserModal()) only run
// *after* the page has already mounted — so someone lacking admin:manage
// who navigates straight to /admin/users directly sees a blank page (the
// guard's alert fires, but nothing ever loads), not a redirect. AdminLayout
// already redirects for the coarser "not an admin at all" case (`isAdmin`),
// but admin:manage is a finer-grained permission some admin roles may
// still lack, so it can't be folded into that same role-level check
// without affecting every other /admin/* route.
//
// This wraps just the /admin/users route below, reusing AuthContext's
// existing hasPermission() — no new permission logic invented. No
// `initializing` branch is needed here: by the time <Outlet/> (and
// therefore this element) renders inside AdminLayout, `initializing` is
// already guaranteed false — AdminLayout returns its own loading screen
// instead of <Outlet/> while initializing is true.
// ─────────────────────────────────────────────────────────────────────────
function RequirePermission({ permission, children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return children;
}

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="reports" element={<Reports />} />
        <Route path="forecasting" element={<Forecasting />} />
        <Route path="users" element={<RequirePermission permission="admin:manage"><Users /></RequirePermission>} />
        <Route path="logs" element={<TempPage name="Admin / Login History" />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  );
}

export default App;