// Light/dark switch — a sliding pill instead of a single icon button, so
// both states are visible at once instead of just "the one you'd switch to".
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
      <i className="fa-solid fa-sun theme-toggle-icon"></i>
      <i className="fa-solid fa-moon theme-toggle-icon"></i>
      <span className="theme-toggle-thumb">
        <i className={`fa-solid ${isDark ? 'fa-moon' : 'fa-sun'}`}></i>
      </span>
    </button>
  );
}

export default ThemeToggle;