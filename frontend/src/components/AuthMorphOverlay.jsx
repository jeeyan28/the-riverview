import { motion, useReducedMotion } from 'motion/react';
import RiverviewLoader from './RiverviewLoader';
import ModalPortal from './ModalPortal';

function AuthMorphOverlay({ stage, onRetry }) {
  const reduceMotion = useReducedMotion();
  if (stage === 'idle') return null;

  const title = stage === 'error'
    ? 'Let’s try that again'
    : stage === 'success'
      ? 'Welcome back!'
      : 'Signing you in';
  const note = stage === 'error'
    ? 'We couldn’t open your dashboard.'
    : stage === 'success'
      ? 'Your dashboard is ready.'
      : 'Opening the right workspace for your account…';

  return (
    <ModalPortal>
      <motion.div
        className={`auth-morph-overlay is-${stage}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: [0.23, 1, 0.32, 1] }}
      >
        <motion.div
          className="auth-morph-card"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0.08 : 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          <RiverviewLoader title={title} message={note} state={stage} fullscreen={false} />
          {stage === 'error' && (
            <button type="button" className="auth-morph-retry" onClick={onRetry}>
              Try again
            </button>
          )}
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}

export default AuthMorphOverlay;
