import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import { useAuth } from './context/AuthContext';
import RiverviewLoader from './components/RiverviewLoader';
import Login from './pages/Login';
import { isAdminReturnPath } from './utils/auth';

const Home = lazy(() => import('./pages/Home'));
const Rooms = lazy(() => import('./pages/Rooms'));
const FacilityDetails = lazy(() => import('./pages/FacilityDetails'));
const Contact = lazy(() => import('./pages/Contact'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Dashboard = lazy(() => import('./pages/Admin/Dashboard'));
const Bookings = lazy(() => import('./pages/Admin/Bookings'));
const Monitor = lazy(() => import('./pages/Admin/Monitor'));
const LobbyMonitor = lazy(() => import('./pages/Admin/LobbyMonitor'));
const Analytics = lazy(() => import('./pages/Admin/Analytics'));
const Users = lazy(() => import('./pages/Admin/Users'));
const Reports = lazy(() => import('./pages/Admin/Reports'));
const Settings = lazy(() => import('./pages/Admin/Settings'));
const AuditTrail = lazy(() => import('./pages/Admin/AuditTrail'));
const RoomManagement = lazy(() => import('./pages/Admin/RoomManagement'));
const Forecasting = lazy(() => import('./pages/Admin/Forecasting'));


function RequirePermission({ permission, children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function AdminLanding() {
  const { hasPermission } = useAuth();
  if (hasPermission('reports:view')) return <Navigate to="/admin/dashboard" replace />;
  if (hasPermission('room:view')) return <Navigate to="/admin/monitor" replace />;
  if (hasPermission('booking:view')) return <Navigate to="/admin/bookings" replace />;
  return <Navigate to="/" replace />;
}

function RouteFallback() {
  return <RiverviewLoader message="Loading your next view…" />;
}

function LegacyAdminLoginRedirect() {
  const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '';
  return <Navigate to={isAdminReturnPath(returnTo) ? returnTo : '/admin'} replace />;
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/rooms/:roomId" element={<FacilityDetails />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<LegacyAdminLoginRedirect />} />
      </Route>

      <Route path="/lobby-monitor" element={<RequirePermission permission="room:view"><LobbyMonitor /></RequirePermission>} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminLanding />} />
        <Route path="dashboard" element={<RequirePermission permission="reports:view"><Dashboard /></RequirePermission>} />
        <Route path="monitor" element={<RequirePermission permission="room:view"><Monitor /></RequirePermission>} />
        <Route path="bookings" element={<RequirePermission permission="booking:view"><Bookings /></RequirePermission>} />
        <Route path="analytics" element={<RequirePermission permission="reports:view"><Analytics /></RequirePermission>} />
        <Route path="reports" element={<RequirePermission permission="reports:view"><Reports /></RequirePermission>} />
        <Route path="forecasting" element={<RequirePermission permission="forecasting:view"><Forecasting /></RequirePermission>} />
        <Route path="users" element={<RequirePermission permission="admin:manage"><Users /></RequirePermission>} />
        <Route path="logs" element={<RequirePermission permission="admin:manage"><Navigate to="/admin/settings?tab=login" replace /></RequirePermission>} />
        <Route path="audit-trail" element={<RequirePermission permission="settings:view"><AuditTrail /></RequirePermission>} />
        <Route path="room-management" element={<RequirePermission permission="room:manage"><RoomManagement /></RequirePermission>} />
        <Route path="settings" element={<RequirePermission permission="settings:view"><Settings /></RequirePermission>} />
        <Route path="*" element={<AdminLanding />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
