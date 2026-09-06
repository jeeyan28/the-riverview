import { useCallback, useEffect, useRef, useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/style.css';
import '../styles/enhancements.css';
import '../styles/auth-ui.css';
import '../styles/skeleton.css';
import '../styles/login.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProfileModal from '../components/ProfileModal';
import GuestBanner from '../components/GuestBanner';
import ClaimAccountModal from '../components/ClaimAccountModal';
import PageSkeleton from '../components/PageSkeleton';
import PageTransition from '../components/PageTransition';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useAnnouncements } from '../hooks/useAnnouncements';

function MainLayout() {
  const { initializing, user } = useAuth();
  const { settings } = useSiteSettings();
  const announcements = useAnnouncements(settings.announcements);
  const [theme, toggleTheme] = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [claimAccountOpen, setClaimAccountOpen] = useState(false);
  const siteRef = useRef(null);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
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

  useEffect(() => {
    document.body.classList.toggle('has-guest-banner', !!user?.isGuest);
    return () => document.body.classList.remove('has-guest-banner');
  }, [user?.isGuest]);

  useEffect(() => {
    const site = siteRef.current;
    if (!site) return;
    const banner = site.querySelector('.guest-banner');
    if (!banner) {
      site.style.setProperty('--guest-banner-h', '0px');
      return;
    }
    const updateBannerHeight = () => site.style.setProperty('--guest-banner-h', `${banner.getBoundingClientRect().height}px`);
    updateBannerHeight();
    const observer = new ResizeObserver(updateBannerHeight);
    observer.observe(banner);
    return () => observer.disconnect();
  }, [initializing, user?.isGuest]);

  if (initializing) {
    return <PageSkeleton />;
  }

  return (
    <div className="public-site" ref={siteRef}>
      <GuestBanner onSave={() => setClaimAccountOpen(true)} />

      <Navbar
        announcements={announcements}
        mobileNavOpen={mobileNavOpen}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onCloseMobileNav={closeMobileNav}
        scrolled={scrolled}
        onOpenProfile={() => setProfileOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main>
        <PageTransition />
      </main>

      <Footer />

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />

      <ClaimAccountModal open={claimAccountOpen} onClose={() => setClaimAccountOpen(false)} />
    </div>
  );
}

export default MainLayout;
