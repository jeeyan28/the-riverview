import { Link, Outlet } from 'react-router-dom';
import '../styles/login.css';
import logo from '../assets/logo/logoo.png';

// ─────────────────────────────────────────────────────────────────────────
// AuthLayout — the plain header-only shell shared by login.html,
// register.html, forgot-password.html and reset-password.html.
//
// IMPORTANT DECISION (Phase 6): these four pages do NOT use MainLayout.
// In the original project they never had the full nav menu / promo banner
// / footer that index.html has — each one only had:
//
//     <header>
//       <a href="index.html" class="logo">...</a>
//     </header>
//
// Reusing MainLayout here would have added a nav bar and footer that never
// existed on these pages, changing the design. So this is a second, smaller
// layout instead. This matches the original 100%.
//
// CSS note: login.css and register.css both redeclare an identical `header`
// / `.logo` rule (duplicate code — flagged in the Phase 1 analysis). This
// layout imports login.css for that shared rule, since it's needed by all
// four pages. When Register.jsx is built in Phase 8, it will additionally
// import register.css for the rules unique to the register form itself;
// the duplicate header/.logo rule in register.css just harmlessly
// re-applies the same values and can be deleted later in Phase 15 cleanup.
//
// PHASE 8 FIX: the original login.html/register.html/forgot-password.html/
// reset-password.html each also had an identical <footer> (copyright +
// Privacy/Terms/Help links) that Phase 6 missed when this layout was first
// built — it only ported the header. Verified byte-for-byte identical
// across all four source files, so it belongs here rather than being
// copy-pasted into every page component in Phase 8.
// ─────────────────────────────────────────────────────────────────────────
function AuthLayout() {
  return (
    <>
      <header className="auth-header">
        <Link to="/" className="auth-logo">
          <img src={logo} alt="The Riverview" />
          <span className="auth-logo-name">The Riverview</span>
        </Link>
      </header>

      <Outlet />

      <footer className="auth-footer">
        <span>© 2026 The Riverview</span>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Use</a>
          <a href="#">Help</a>
        </div>
      </footer>
    </>
  );
}

export default AuthLayout;