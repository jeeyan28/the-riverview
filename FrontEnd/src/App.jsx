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
import RoomManagement from './pages/Admin/RoomManagement';
import Analytics from './pages/Admin/Analytics';
import Users from './pages/Admin/Users';
import Reports from './pages/Admin/Reports';
import Settings from './pages/Admin/Settings';
import Profile from './pages/Admin/Profile';
import Forecasting from './pages/Admin/Forecasting';


function TempPage({ name }) {
  return (
    <div style={{ padding: '3rem', fontFamily: 'sans-serif' }}>
      <p>
        <strong>{name}</strong> — placeholder content.
      </p>
    </div>
  );
}


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
        <Route path="room-management" element={<RoomManagement />} />
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