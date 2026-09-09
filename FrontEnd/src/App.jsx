import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import { useAuth } from './context/AuthContext';
import RiverviewLoader from './components/RiverviewLoader';

const Home = lazy(() => import('./pages/Home'));
const Rooms = lazy(() => import('./pages/Rooms'));
const Contact = lazy(() => import('./pages/Contact'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Admin/Dashboard'));
const Bookings = lazy(() => import('./pages/Admin/Bookings'));
const Monitor = lazy(() => import('./pages/Admin/Monitor'));
const LobbyMonitor = lazy(() => import('./pages/Admin/LobbyMonitor'));
const Analytics = lazy(() => import('./pages/Admin/Analytics'));
const Users = lazy(() => import('./pages/Admin/Users'));
const Reports = lazy(() => import('./pages/Admin/Reports'));
const Settings = lazy(() => import('./pages/Admin/Settings'));
const RoomManagement = lazy(() => import('./pages/Admin/RoomManagement'));
const Forecasting = lazy(() => import('./pages/Admin/Forecasting'));
const LoginHistory = lazy(() => import('./pages/Admin/LoginHistory'));


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

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
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
        <Route path="logs" element={<RequirePermission permission="admin:manage"><LoginHistory /></RequirePermission>} />
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
