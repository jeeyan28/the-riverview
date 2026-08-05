import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import logo from '../assets/logo/logoo.png';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';

function Navbar({
  announcement,
  promoVisible,
  onDismissPromo,
  mobileNavOpen,
  onOpenMobileNav,
  onCloseMobileNav,
  scrolled,
  onOpenProfile,
  theme,
  onToggleTheme,
}) {
  const [chipMenuOpen, setChipMenuOpen] = useState(false);
  const chipRef = useRef(null);
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
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
  return (
    <>
      {announcement && (
        <div
          id="promo-banner"
          className={`promo-banner${promoVisible ? '' : ' is-hidden'}`}
        >
          <p className="promo-text" id="promo-text-line">
            <span className="promo-emoji">{announcement.emoji}</span>
            {announcement.message}
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
      )}

      <header id="site-header" className={scrolled ? 'scrolled' : ''}>
        <div className="logo">
          <img src={logo} alt="Riverview Logo" />
          <span className="logo-name">The Riverview</span>
        </div>

        <nav id="nav-menu">
          <a href="/#home" className={activeSection === 'home' ? 'active' : ''} onClick={(e) => handleSectionLink(e, 'home')}>Home</a>
          <a href="/#rooms" className={activeSection === 'rooms' ? 'active' : ''} onClick={(e) => handleSectionLink(e, 'rooms')}>Rooms</a>
          <a href="/#about" className={activeSection === 'about' ? 'active' : ''} onClick={(e) => handleSectionLink(e, 'about')}>About</a>
          <Link to="/contact" className={isContact ? 'active' : ''}>Contact</Link>
        </nav>

        <div className="nav-buttons">
          {isHome && <ThemeToggle id="nav-theme-toggle" theme={theme} onToggle={onToggleTheme} />}

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

      <div className={`mobile-nav${mobileNavOpen ? ' open' : ''}`} id="mobile-nav">
        <button className="mobile-nav-close" id="nav-close" onClick={onCloseMobileNav}>✕</button>
        {isHome && <ThemeToggle id="mobile-theme-toggle" theme={theme} onToggle={onToggleTheme} style={{ marginBottom: '1rem' }} />}
        <a href="/#home" onClick={(e) => { handleSectionLink(e, 'home'); onCloseMobileNav(); }}>Home</a>
        <a href="/#rooms" onClick={(e) => { handleSectionLink(e, 'rooms'); onCloseMobileNav(); }}>Rooms</a>
        <a href="/#about" onClick={(e) => { handleSectionLink(e, 'about'); onCloseMobileNav(); }}>About</a>
        <Link to="/contact" onClick={onCloseMobileNav}>Contact</Link>
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