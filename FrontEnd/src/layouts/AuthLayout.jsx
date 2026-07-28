import { Outlet } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/login.css';

function AuthLayout() {
  return (
    <main className="auth-content">
      <Outlet />
    </main>
  );
}

export default AuthLayout;