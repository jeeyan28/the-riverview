import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo/logoo.png';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import AnnouncementsBell from './AnnouncementsBell';
import LogoutConfirmDialog from './LogoutConfirmDialog';

function Navbar({
  announcements,
  mobileNavOpen,
  onOpenMobileNav,
  onCloseMobileNav,
  scrolled,
  onOpenProfile,
  theme,
  onToggleTheme,
}) {
  const [chipMenuOpen, setChipMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const chipRef = useRef(null);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isRooms = location.pathname === '/rooms';
  const isContact = location.pathname === '/contact';

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

  function handleSectionLink(e, id) {
    e.preventDefault();
    if (isHome) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(`/#${id}`);
    }
  }

  const loggedIn = !!user;
  const chipFullName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '';
  const chipInitial = (chipFullName || user?.email || 'U').trim().charAt(0).toUpperCase() || 'U';
  const chipName = chipFullName || 'Account';

  async function handleLogout() {
    setChipMenuOpen(false);
    setShowLogoutConfirm(true);
  }

  async function confirmLogout() {
    setShowLogoutConfirm(false);
    await logout();
    navigate('/');
  }

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

  useEffect(() => {
    if (!mobileNavOpen) return;
    const menu = menuRef.current;
    const background = [...document.querySelectorAll('.public-site > #site-header, .public-site > .guest-banner, .public-site > main, .public-site > footer')];
    const previousInert = background.map((element) => element.inert);
    background.forEach((element) => { element.inert = true; });
    menu?.querySelector('button')?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobileNav();
      }
      if (event.key !== 'Tab') return;
      const controls = [...menu.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    function handleResize() {
      if (window.matchMedia('(min-width: 1201px)').matches) onCloseMobileNav();
    }
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      background.forEach((element, index) => { element.inert = previousInert[index]; });
      menuButtonRef.current?.focus({ preventScroll: true });
    };
  }, [mobileNavOpen, onCloseMobileNav]);

  useEffect(() => {
    onCloseMobileNav();
    setChipMenuOpen(false);
  }, [location.pathname, onCloseMobileNav]);

  return (
    <>
      <header id="site-header" className={scrolled ? 'scrolled' : ''}>
        <Link to="/" className="logo" aria-label="The Riverview home">
          <img src={logo} alt="Riverview Logo" />
          <span className="logo-name">The Riverview</span>
        </Link>

        <nav id="nav-menu" aria-label="Main navigation">
          <a href="/#home" className={isHome && activeSection === 'home' ? 'active' : ''} onClick={(e) => handleSectionLink(e, 'home')}>Home</a>
          <Link to="/rooms" className={isRooms ? 'active' : ''}>Facilities</Link>
          <a href="/#about" className={isHome && activeSection === 'about' ? 'active' : ''} onClick={(e) => handleSectionLink(e, 'about')}>About</a>
          <Link to="/contact" className={isContact ? 'active' : ''}>Contact</Link>
        </nav>

        <div className="nav-buttons">
          <AnnouncementsBell variant="desktop" {...announcements} />

          {(isHome || isRooms || isContact) && <ThemeToggle id="nav-theme-toggle" theme={theme} onToggle={onToggleTheme} />}

          <Link
            to="/login"
            className="btn-login"
            id="login-button"
            style={{ display: loggedIn ? 'none' : '' }}
          >
            Log in
          </Link>

          <div
            className="user-chip"
            id="user-chip"
            style={{ display: loggedIn ? 'flex' : 'none' }}
            ref={chipRef}
          >
            <button
              type="button"
              className="user-chip-trigger"
              aria-expanded={chipMenuOpen}
              aria-controls="user-chip-menu"
              aria-label={`Account menu for ${chipName}`}
              onClick={() => setChipMenuOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setChipMenuOpen(false);
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
            <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
            </button>
            <div
              className={`user-chip-menu${chipMenuOpen ? ' open' : ''}`}
              id="user-chip-menu"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setChipMenuOpen(false);
                  chipRef.current?.querySelector('.user-chip-trigger')?.focus();
                }
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setChipMenuOpen(false);
                  onOpenProfile?.();
                }}
              >
                <i className="fa-solid fa-user"></i> Account & reservations
              </button>
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

        <div className="mobile-header-actions">
          <AnnouncementsBell variant="mobile" {...announcements} />

          <button
            type="button"
            className={`hamburger${mobileNavOpen ? ' active' : ''}`}
            id="hamburger"
            aria-label="Open menu"
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-nav"
            ref={menuButtonRef}
            onClick={onOpenMobileNav}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="mobile-nav-backdrop" onClick={onCloseMobileNav}>
          <div
            className="mobile-nav open"
            id="mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-nav-title"
            ref={menuRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-nav-heading">
              <div>
                <span className="mobile-nav-eyebrow">THE RIVERVIEW</span>
                <h2 id="mobile-nav-title">Plan your visit</h2>
              </div>
              <button type="button" className="mobile-nav-close" id="nav-close" aria-label="Close menu" onClick={onCloseMobileNav}>✕</button>
            </div>
            <nav className="mobile-nav-links" aria-label="Mobile navigation">
              <a href="/#home" aria-current={isHome && activeSection === 'home' ? 'page' : undefined} onClick={(e) => { handleSectionLink(e, 'home'); onCloseMobileNav(); }}>Home <i className="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
              <Link to="/rooms" aria-current={isRooms ? 'page' : undefined} onClick={onCloseMobileNav}>Facilities <i className="fa-solid fa-arrow-right" aria-hidden="true"></i></Link>
              <a href="/#about" aria-current={isHome && activeSection === 'about' ? 'page' : undefined} onClick={(e) => { handleSectionLink(e, 'about'); onCloseMobileNav(); }}>About us <i className="fa-solid fa-arrow-right" aria-hidden="true"></i></a>
              <Link to="/contact" aria-current={isContact ? 'page' : undefined} onClick={onCloseMobileNav}>Contact <i className="fa-solid fa-arrow-right" aria-hidden="true"></i></Link>
            </nav>
            <div className="mobile-nav-account">
              <Link className="mobile-nav-primary" id="mobile-book-btn" to="/rooms" onClick={onCloseMobileNav}>Reserve a space <i className="fa-solid fa-arrow-right" aria-hidden="true"></i></Link>
              {loggedIn ? (
                <>
                  <button type="button" className="mobile-nav-secondary" onClick={() => { onCloseMobileNav(); onOpenProfile?.(); }}><i className="fa-regular fa-user" aria-hidden="true"></i> Account & reservations</button>
                  {isAdmin && <Link className="mobile-nav-secondary" to="/admin/dashboard" onClick={onCloseMobileNav}><i className="fa-solid fa-gauge" aria-hidden="true"></i> Admin dashboard</Link>}
                  <button type="button" className="mobile-nav-secondary" id="mobile-logout-button" onClick={() => { onCloseMobileNav(); handleLogout(); }}><i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Log out</button>
                </>
              ) : (
                <Link className="mobile-nav-secondary" to="/login" onClick={onCloseMobileNav}><i className="fa-regular fa-user" aria-hidden="true"></i> Log in to your account</Link>
              )}
            </div>
            <div className="mobile-nav-preferences">
              <span>Appearance <small>{theme === 'dark' ? 'Dark' : 'Light'} mode</small></span>
              <ThemeToggle id="mobile-theme-toggle" theme={theme} onToggle={onToggleTheme} />
            </div>
          </div>
        </div>
      )}

      <LogoutConfirmDialog
        open={showLogoutConfirm}
        isGuest={!!user?.isGuest}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}

export default Navbar;
