import { AnimatePresence, motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router-dom';

function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}

export default PageTransition;