import { Moon, Sun } from 'lucide-react';

function ThemeToggle({ id, theme, onToggle, style }) {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      id={id}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={onToggle}
      style={style}
    >
      <Sun className="theme-toggle-icon theme-toggle-icon--sun" size={14} aria-hidden="true" />
      <Moon className="theme-toggle-icon theme-toggle-icon--moon" size={14} aria-hidden="true" />
      <span className="theme-toggle-thumb">
        {isDark ? <Moon size={13} aria-hidden="true" /> : <Sun size={13} aria-hidden="true" />}
      </span>
      <span className="visually-hidden">{isDark ? 'Dark appearance' : 'Light appearance'}</span>
    </button>
  );
}

export default ThemeToggle;
