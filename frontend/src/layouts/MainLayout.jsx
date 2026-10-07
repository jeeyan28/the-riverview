import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/style.css';
import '../styles/enhancements.css';
import '../styles/auth-ui.css';
import '../styles/skeleton.css';
import '../styles/login.css';
import Navbar from '../components/Navbar';
import AnnouncementBanner from '../components/AnnouncementBanner';
import Footer from '../components/Footer';
import ProfileModal from '../components/ProfileModal';
import PageTransition from '../components/PageTransition';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { CustomerAppNavigation } from '../components/MobileAppNavigation';
import { buildLoginPath } from '../utils/auth';
import { useNotifications } from '../hooks/useNotifications';

function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { initializing, user } = useAuth();
  const notifications = useNotifications(initializing ? null : user?._id);
  const reservationParams = new URLSearchParams(location.search);
  const reservationIntent = reservationParams.get('reservation')
    ? { code: reservationParams.get('reservation'), action: reservationParams.get('action') }
    : null;
  const { settings } = useSiteSettings();
  const [announcementHeight, setAnnouncementHeight] = useState(0);
  const [theme, toggleTheme] = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    if (!reservationIntent || initializing) return;
    if (!user) {
      navigate(buildLoginPath(`${location.pathname}${location.search}`), { replace: true });
      return;
    }
    setProfileOpen(true);
  }, [initializing, user, location.pathname, location.search]);

  function closeProfile() {
    setProfileOpen(false);
    if (reservationIntent) {
      const params = new URLSearchParams(location.search);
      params.delete('reservation');
      params.delete('action');
      navigate(`${location.pathname}${params.size ? `?${params}` : ''}`, { replace: true });
    }
  }

  useEffect(() => {
    let frame = 0;
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 40);
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [mobileNavOpen]);

  return (
    <div className="public-site" style={{ '--announcement-height': `${announcementHeight}px` }}>
      <AnnouncementBanner announcements={settings.announcements} onHeightChange={setAnnouncementHeight} />
      <Navbar
        mobileNavOpen={mobileNavOpen}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onCloseMobileNav={closeMobileNav}
        scrolled={scrolled}
        onOpenProfile={() => setProfileOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        notifications={notifications}
        onOpenNotification={(item) => {
          closeMobileNav();
          navigate(`/?${new URLSearchParams({ reservation: item.reservationCode, action: 'closure' })}`);
          setProfileOpen(true);
        }}
      />

      <main>
        <PageTransition />
      </main>

      <Footer settings={settings} />

      <CustomerAppNavigation
        user={user}
        profileOpen={profileOpen}
        obscured={mobileNavOpen}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <ProfileModal open={profileOpen} onClose={closeProfile} reservationIntent={reservationIntent} />

      <div className="modal-portal-root" data-modal-portal />
    </div>
  );
}

export default MainLayout;
