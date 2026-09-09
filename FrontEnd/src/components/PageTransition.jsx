import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router-dom';

function PageTransition({ variant = 'public' }) {
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!location.hash) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        className={`page-transition page-transition--${variant}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.18, ease: [0.23, 1, 0.32, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

export default PageTransition;
