// ThemeToggle — the dark/light mode button. Extracted from the two
// theme-toggle buttons that were inline in MainLayout.jsx (Phase 6): one in
// the desktop header, one in the mobile nav drawer. Same markup/classes as
// both, just parameterized by an `id` (so the desktop and mobile copies keep
// distinct DOM ids like the original index.html did) and an optional
// `style` override (the mobile copy had `margin-top:1rem`).
//
// Theme state itself (the `theme` value + how it's toggled) still lives in
// MainLayout, via useState/useEffect — this component is presentational
// only, matching the "components/ = reusable UI, not reusable state" split
// from hooks/README.md.
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
