import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';
import { useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Rooms from './pages/Rooms';
import Contact from './pages/Contact';
import Login from './pages/Login';
import Dashboard from './pages/Admin/Dashboard';
import Bookings from './pages/Admin/Bookings';
import Monitor from './pages/Admin/Monitor';
import LobbyMonitor from './pages/Admin/LobbyMonitor';
import Analytics from './pages/Admin/Analytics';
import Users from './pages/Admin/Users';
import Reports from './pages/Admin/Reports';
import Settings from './pages/Admin/Settings';
import RoomManagement from './pages/Admin/RoomManagement';
import Forecasting from './pages/Admin/Forecasting';
import LoginHistory from './pages/Admin/LoginHistory';


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
        <Route path="/rooms" element={<Rooms />} />
        <Route path="/contact" element={<Contact />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
      </Route>

      <Route path="/lobby-monitor" element={<LobbyMonitor />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="reports" element={<Reports />} />
        <Route path="forecasting" element={<Forecasting />} />
        <Route path="users" element={<RequirePermission permission="admin:manage"><Users /></RequirePermission>} />
        <Route path="logs" element={<LoginHistory />} />
        <Route path="room-management" element={<RoomManagement />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;