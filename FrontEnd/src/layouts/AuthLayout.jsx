import { Outlet } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/login.css';
import { useTheme } from '../hooks/useTheme';

function AuthLayout() {
  const [theme] = useTheme();

  return (
    <div className="auth-content" data-auth-theme={theme}>
      <Outlet />
    </div>
  );
}

export default AuthLayout;
