import { useLayoutEffect } from 'react';
import { Outlet } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/login.css';

function AuthLayout() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');

    return () => {
      if (previousTheme) root.setAttribute('data-theme', previousTheme);
      else root.removeAttribute('data-theme');
    };
  }, []);

  return (
    <div className="auth-content" data-auth-theme="dark">
      <Outlet />
    </div>
  );
}

export default AuthLayout;
