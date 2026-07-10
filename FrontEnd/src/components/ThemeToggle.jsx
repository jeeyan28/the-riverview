
function ThemeToggle({ id, theme, onToggle, style }) {
  return (
    <button
      className="theme-toggle"
      id={id}
      aria-label="Toggle dark mode"
      onClick={onToggle}
      style={style}
    >
      <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`}></i>
    </button>
  );
}

export default ThemeToggle;
