import { Outlet } from 'react-router-dom';
import '../styles/login.css';

function AuthLayout() {
  return (
    <main className="auth-content">
      <Outlet />
    </main>
  );
}

export default AuthLayout;