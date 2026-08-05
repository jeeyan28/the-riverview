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

const PROMO_DISMISS_KEY = 'riverview-promo-dismissed';

function MainLayout() {
  const { initializing } = useAuth();
  const { settings } = useSiteSettings();
  const announcement = settings.announcements?.[0] || null;
  const [theme, toggleTheme] = useTheme();
  const [promoVisible, setPromoVisible] = useState(
    () => sessionStorage.getItem(PROMO_DISMISS_KEY) !== '1'
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    function setBannerHeightVar() {
      const banner = document.getElementById('promo-banner');
      const h = promoVisible && banner ? banner.offsetHeight : 0;
      document.documentElement.style.setProperty('--banner-h', `${h}px`);
    }
    setBannerHeightVar();
    window.addEventListener('resize', setBannerHeightVar);
    return () => window.removeEventListener('resize', setBannerHeightVar);
  }, [promoVisible, announcement]);

  function dismissPromo() {
    setPromoVisible(false);
    sessionStorage.setItem(PROMO_DISMISS_KEY, '1');
  }

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
        announcement={announcement}
        promoVisible={promoVisible}
        onDismissPromo={dismissPromo}
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