import { useEffect, useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import '../styles/style.css';
import '../styles/enhancements.css';
import '../styles/auth-ui.css';
import '../styles/skeleton.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProfileModal from '../components/ProfileModal';
import PageSkeleton from '../components/PageSkeleton';
import PageTransition from '../components/PageTransition';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../context/AuthContext';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useAnnouncements } from '../hooks/useAnnouncements';

function MainLayout() {
  const { initializing } = useAuth();
  const { settings } = useSiteSettings();
  const announcements = useAnnouncements(settings.announcements);
  const [theme, toggleTheme] = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
  }, [mobileNavOpen]);

  if (initializing) {
    return <PageSkeleton />;
  }

  return (
    <>
      <Navbar
        announcements={announcements}
        mobileNavOpen={mobileNavOpen}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onCloseMobileNav={() => setMobileNavOpen(false)}
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
    </>
  );
}

export default MainLayout;