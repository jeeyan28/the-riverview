import { useEffect, useState } from 'react';

// Site-wide light/dark preference for the public Home page (Navbar toggle).
// Applied as a `data-theme` attribute on <html>, read by style.css's
// `:root[data-theme="light"]` overrides. Login has its own fixed dark
// design and no longer connects to this.
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