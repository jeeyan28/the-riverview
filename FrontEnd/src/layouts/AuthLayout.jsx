import { Outlet } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/login.css';
import ThemeToggle from '../components/ThemeToggle';
import { useTheme } from '../hooks/useTheme';

function AuthLayout() {
  const [theme, toggleTheme] = useTheme();

  return (
    <main className="auth-content">
      <div className="auth-theme-control">
        <span>Appearance</span>
        <ThemeToggle id="auth-theme-toggle" theme={theme} onToggle={toggleTheme} />
      </div>
      <Outlet />
    </main>
  );
}

export default AuthLayout;
