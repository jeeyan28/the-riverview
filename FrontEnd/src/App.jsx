import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import { useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Admin/Dashboard';
import Bookings from './pages/Admin/Bookings';
import Monitor from './pages/Admin/Monitor';
import Analytics from './pages/Admin/Analytics';
import Users from './pages/Admin/Users';
import Reports from './pages/Admin/Reports';
import Settings from './pages/Admin/Settings';
import Profile from './pages/Admin/Profile';
import Forecasting from './pages/Admin/Forecasting';



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