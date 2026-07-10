import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import '../styles/style.css';
import '../styles/enhancements.css';
import '../styles/auth-ui.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProfileModal from '../components/ProfileModal';


const PROMO_DISMISS_KEY = 'riverview-promo-dismissed';

function MainLayout() {
  const [promoVisible, setPromoVisible] = useState(
    () => sessionStorage.getItem(PROMO_DISMISS_KEY) !== '1'
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Keeps --banner-h in sync so the page content below the fixed header
  // doesn't jump/overlap when the banner is dismissed. Mirrors
  // setBannerHeightVar() from the old index.js — including the
  // window 'resize' listener the original registered (missed in the
  // initial port; added back here since the banner's height can change
  // on viewport resize/orientation change, not just on dismiss).
  useEffect(() => {
    const banner = document.getElementById('promo-banner');
    function setBannerHeightVar() {
      const h = promoVisible && banner ? banner.offsetHeight : 0;
      document.documentElement.style.setProperty('--banner-h', `${h}px`);
    }
    setBannerHeightVar();
    window.addEventListener('resize', setBannerHeightVar);
    return () => window.removeEventListener('resize', setBannerHeightVar);
  }, [promoVisible]);

  function dismissPromo() {
    setPromoVisible(false);
    sessionStorage.setItem(PROMO_DISMISS_KEY, '1');
  }

  // Header "scrolled" shadow/background state.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40);
    }
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Prevent body scroll while the mobile nav drawer is open.
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
  }, [mobileNavOpen]);

  return (
    <>
      <Navbar
        promoVisible={promoVisible}
        onDismissPromo={dismissPromo}
        mobileNavOpen={mobileNavOpen}
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onCloseMobileNav={() => setMobileNavOpen(false)}
        scrolled={scrolled}
        onOpenProfile={() => setProfileOpen(true)}
      />

      <main>
        <Outlet />
      </main>

      <Footer />

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

export default MainLayout;