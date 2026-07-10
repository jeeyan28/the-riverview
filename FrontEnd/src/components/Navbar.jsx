import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/logo/logoo.png';
import { useAuth } from '../context/AuthContext';

// ─────────────────────────────────────────────────────────────────────────
// Navbar — the public site's promo banner + header + mobile nav drawer,
// extracted out of MainLayout.jsx (Phase 6) into its own reusable component,
// per the plan in components/README.md ("Navbar.jsx — public site header
// (currently duplicated markup in index.html)").
//
// All state (promo visibility, mobile nav open/closed, scrolled) still
// lives in MainLayout — this component only receives values + handler
// functions as props and renders markup, same as Phase 6/7.
//
// Dark/light theme toggle removed (site is dark-only now): ThemeToggle
// import, both instances (desktop + mobile), and the theme/onToggleTheme
// props all deleted.
//
// PHASE 8 (part 3, ProfileModal) ADDITION: the user-chip DROPDOWN toggle
// (open/close the `.user-chip-menu`, click-outside-to-close) was wired here
// as small self-contained UI state — it's just open/closed mechanics for a
// `.user-chip-menu.open` CSS class (see original js/index.js lines
// ~262–268), not auth *detection*, so it didn't need to wait for the real
// auth wiring below. "My Profile" opens <ProfileModal/> (owned by
// MainLayout — see MainLayout.jsx and components/ProfileModal.jsx for why
// it lives there) via the `onOpenProfile` prop.
//
// THIS PHASE — real auth-state wiring (closes out the "Phase 10 TODO"
// left in Phase 6/8): reads `user`/`isAdmin`/`logout` from AuthContext
// (Phase 11) instead of the always-`display:none` placeholders. Ported
// directly from original js/index.js's initAuthHeader()/logoutUser():
//   - `#login-button` shown only when logged out; `#user-chip` shown only
//     when logged in — exact inverse pair, matching the original's
//     `loginBtn.style.display = loggedIn ? 'none' : ''` /
//     `chip.style.display = loggedIn ? 'flex' : 'none'`.
//   - Chip avatar/name derive from `firstName`/`lastName`, falling back to
//     an "U"/"Account" placeholder — same fallback chain as the original's
//     `(user.firstname || user.name || user.email || 'U')`, updated for
//     the split firstName/lastName fields. The `user.name` fallback in
//     that original chain was already dead code (User never had a `name`
//     field) and isn't reproduced here.
//   - `#admin-dashboard-link` shown only for staff/manager/super_admin,
//     i.e. AuthContext's `isAdmin` (same ADMIN_ROLES list admin.js already
//     used) — matches the original's separate isAdmin flag rather than
//     reusing plain "logged in." Navigates to /admin/dashboard: the
//     original's comment notes "same session cookie works on admin.html
//     too," which is equally true of this migrated app's routes.
//   - `#logout-button` (desktop chip menu) and `#mobile-logout-button`
//     both call the same handler, matching the original wiring both
//     buttons to the same `logoutUser()`. AuthContext.logout() already
//     hits POST /api/auth/logout and clears storage; the original then
//     hard-redirected to index.html — reproduced here as `navigate('/')`,
//     the React-Router equivalent for a page that's already mounted at
//     "/" 99% of the time this fires (a user clicking logout from a public
//     page), rather than a full reload the SPA doesn't need.
//   - `#mobile-logout-button` visibility also follows `loggedIn`, matching
//     the original's `mobileLogoutBtn.style.display = loggedIn ?
//     'inline-block' : 'none'`. (The original also toggled a
//     `#mobile-profile-link`, but no such element exists anywhere in
//     index.html — just one stray comment mentioning it — so
//     `getElementById` always returned null there too; nothing to port.)
//   - AuthContext already revalidates against GET /api/auth/me on mount
//     and keeps `user` live, so there's no need to re-implement the
//     original's separate verifySession()/reconcileAuthHeader() dance —
//     that's precisely the duplicated logic Phase 11 centralized.
// ─────────────────────────────────────────────────────────────────────────
function Navbar({
  promoVisible,
  onDismissPromo,
  mobileNavOpen,
  onOpenMobileNav,
  onCloseMobileNav,
  scrolled,
  onOpenProfile,
}) {
  const [chipMenuOpen, setChipMenuOpen] = useState(false);
  const chipRef = useRef(null);
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  // Scroll-spy nav highlighting — ported 1:1 from the original js/index.js
  // (lines ~174-184): tracks scroll position against each `section[id]`'s
  // offsetTop and highlights whichever `nav a` matches "#" + that id.
  // Defaults to 'home', matching index.html's hardcoded `class="active"`
  // on the Home link before any scroll event has fired (the original never
  // ran the handler on load either — only registered the listener).
  //
  // Original scope note: the original selected `nav a` globally, which in
  // that markup only ever matched the desktop `#nav-menu` links (mobile-nav
  // is a plain `<div>`, not a `<nav>`, and the footer's Explore links sit in
  // a `<div class="footer-col">`) — so only the desktop nav's `.active`
  // class is reproduced here; mobile-nav links were never scroll-tracked.
  //
  // Isolated adaptation for the SPA: Navbar is now shared across every
  // MainLayout-wrapped route, not just index.html. On routes with no
  // `#home`/`#rooms`/`#about` sections (e.g. Booking, Profile), a scroll
  // event would otherwise wipe the default to '' and de-highlight "Home"
  // with nothing to replace it. Guarding on `sections.length` keeps the
  // last-known section (or the 'home' default) intact on pages that never
  // have the tracked sections in the first place.
  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => {
    function handleScroll() {
      const sections = document.querySelectorAll('section[id]');
      if (!sections.length) return;
      let current = '';
      sections.forEach((s) => {
        if (window.scrollY >= s.offsetTop - 120) current = s.id;
      });
      setActiveSection(current);
    }
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const loggedIn = !!user;
  const chipFullName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
  const chipInitial = (chipFullName || user?.email || 'U').trim().charAt(0).toUpperCase() || 'U';
  const chipName = chipFullName || 'Account';

  async function handleLogout() {
    setChipMenuOpen(false);
    await logout();
    navigate('/');
  }

  // Click-outside-to-close, matching the original's document-level
  // click listener (js/index.js lines ~266–268).
  useEffect(() => {
    if (!chipMenuOpen) return;
    function handleDocClick(e) {
      if (chipRef.current && !chipRef.current.contains(e.target)) {
        setChipMenuOpen(false);
      }
    }
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [chipMenuOpen]);
  return (
    <>
      {/* ANNOUNCEMENT / PROMO BANNER */}
      <div
        id="promo-banner"
        className={`promo-banner${promoVisible ? '' : ' is-hidden'}`}
      >
        <p className="promo-text" id="promo-text-line">
          <span className="promo-emoji">🎉</span>
          Special Promo: 20% off all bookings this weekend!
        </p>
        <button
          className="promo-close"
          id="promoClose"
          aria-label="Dismiss announcement"
          onClick={onDismissPromo}
        >
          ✕
        </button>
      </div>

      {/* HEADER */}
      <header id="site-header" className={scrolled ? 'scrolled' : ''}>
        <div className="logo">
          <img src={logo} alt="Riverview Logo" />
          <span className="logo-name">The Riverview</span>
        </div>

        <nav id="nav-menu">
          <a href="#home" className={activeSection === 'home' ? 'active' : ''}>Home</a>
          <a href="#rooms" className={activeSection === 'rooms' ? 'active' : ''}>Rooms</a>
          <a href="#about" className={activeSection === 'about' ? 'active' : ''}>About</a>
        </nav>

        <div className="nav-buttons">
          {/* Shown only when no one is logged in — matches original's
              loginBtn.style.display = loggedIn ? 'none' : ''. */}
          <Link
            to="/login"
            className="btn-login"
            id="login-button"
            style={{ display: loggedIn ? 'none' : '' }}
          >
            Log in
          </Link>

          {/* Shown instead of "Log in" once a user is logged in — matches
              original's chip.style.display = loggedIn ? 'flex' : 'none'. */}
          <div
            className="user-chip"
            id="user-chip"
            style={{ display: loggedIn ? 'flex' : 'none' }}
            ref={chipRef}
            onClick={(e) => {
              e.stopPropagation();
              setChipMenuOpen((o) => !o);
            }}
          >
            <div className="user-chip-avatar" id="user-chip-avatar">
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="" referrerPolicy="no-referrer" />
              ) : (
                chipInitial
              )}
            </div>
            <span className="user-chip-name" id="user-chip-name">{chipName}</span>
            <i className="fa-solid fa-chevron-down"></i>
            <div className={`user-chip-menu${chipMenuOpen ? ' open' : ''}`} id="user-chip-menu">
              <button
                type="button"
                onClick={() => {
                  setChipMenuOpen(false);
                  onOpenProfile?.();
                }}
              >
                <i className="fa-solid fa-user"></i> My Profile
              </button>
              {/* staff/manager/super_admin only — same ADMIN_ROLES list
                  admin.js/AuthContext already use, not just "logged in." */}
              <button
                type="button"
                id="admin-dashboard-link"
                style={{ display: isAdmin ? 'flex' : 'none' }}
                onClick={() => {
                  setChipMenuOpen(false);
                  navigate('/admin/dashboard');
                }}
              >
                <i className="fa-solid fa-gauge"></i> Admin Dashboard
              </button>
              <button type="button" id="logout-button" onClick={handleLogout}>
                <i className="fa-solid fa-right-from-bracket"></i> Log out
              </button>
            </div>
          </div>
        </div>

        <div
          className={`hamburger${mobileNavOpen ? ' active' : ''}`}
          id="hamburger"
          aria-label="Open menu"
          onClick={onOpenMobileNav}
        >
          <span></span><span></span><span></span>
        </div>
      </header>

      {/* MOBILE NAV */}
      <div className={`mobile-nav${mobileNavOpen ? ' open' : ''}`} id="mobile-nav">
        <button className="mobile-nav-close" id="nav-close" onClick={onCloseMobileNav}>✕</button>
        <a href="#home" onClick={onCloseMobileNav}>Home</a>
        <a href="#rooms" onClick={onCloseMobileNav}>Rooms</a>
        <a href="#about" onClick={onCloseMobileNav}>About</a>
        <button
          className="btn-book"
          id="mobile-book-btn"
          style={{ fontSize: '1rem', padding: '.75rem 2rem', borderRadius: '8px', marginTop: '1rem' }}
        >
          Book Now
        </button>
        <button
          className="btn-book"
          id="mobile-logout-button"
          style={{
            display: loggedIn ? 'inline-block' : 'none',
            fontSize: '1rem',
            padding: '.75rem 2rem',
            borderRadius: '8px',
            marginTop: '.5rem',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,.3)',
            color: '#fff',
          }}
          onClick={handleLogout}
        >
          Log out
        </button>
      </div>
    </>
  );
}

export default Navbar;