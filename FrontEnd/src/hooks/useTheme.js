import { useEffect, useState } from 'react';

// Site-wide light/dark preference shared by customer, authentication, and admin surfaces.
const THEME_KEY = 'riverview-theme';

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage unavailable (private mode, etc.) — theme still applies
      // for the session, it just won't persist.
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }

  return [theme, toggleTheme];
}
