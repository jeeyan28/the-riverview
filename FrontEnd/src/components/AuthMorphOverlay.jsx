import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

const CIRCLE_SIZE = 152;
const RING_RADIUS = 65;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function AuthMorphOverlay({ stage, rect, progress, onRetry }) {
  const reduceMotion = useReducedMotion();
  if (stage === 'idle' || !rect) return null;

  const viewportHeight = document.documentElement.clientHeight;
  const centerY = viewportHeight * (viewportHeight <= 350 ? 0.3 : viewportHeight <= 500 ? 0.38 : 0.5);
  const percentage = stage === 'success' ? 100 : Math.max(0, Math.min(progress, 100));
  const dashOffset = CIRCUMFERENCE * (1 - percentage / 100);
  const title = stage === 'error' ? 'Let’s try that again' : stage === 'success' ? 'Welcome back!' : 'Signing you in';
  const note = stage === 'error' ? 'We couldn’t open your dashboard.' : stage === 'success' ? 'Redirecting to your dashboard…' : 'Getting your dashboard ready…';

  return (
    <div className={`auth-morph-overlay is-${stage}`} style={{ '--auth-circle-size': `${CIRCLE_SIZE}px` }}>
      <motion.div
        className="auth-morph-orb"
        aria-hidden="true"
        initial={{
          x: reduceMotion ? 0 : rect.left - (document.documentElement.clientWidth - CIRCLE_SIZE) / 2,
          y: reduceMotion ? 0 : rect.top - centerY + CIRCLE_SIZE / 2,
          width: reduceMotion ? CIRCLE_SIZE : rect.width,
          height: reduceMotion ? CIRCLE_SIZE : rect.height,
          borderRadius: reduceMotion ? CIRCLE_SIZE / 2 : 24,
        }}
        animate={{
          x: 0,
          y: 0,
          width: CIRCLE_SIZE,
          height: CIRCLE_SIZE,
          borderRadius: CIRCLE_SIZE / 2,
        }}
        transition={{ duration: reduceMotion ? 0 : 0.9, ease: [0.65, 0, 0.35, 1] }}
      />

      <AnimatePresence>
        {stage !== 'morphing' && (
          <motion.div
            className="auth-morph-details"
            initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeOut' }}
          >
            <div
              className="auth-morph-ring"
              role={stage === 'loading' ? 'progressbar' : undefined}
              aria-label={stage === 'loading' ? 'Signing you in' : undefined}
              aria-valuemin={stage === 'loading' ? 0 : undefined}
              aria-valuemax={stage === 'loading' ? 100 : undefined}
              aria-valuenow={stage === 'loading' ? Math.round(percentage) : undefined}
            >
              <svg aria-hidden="true" width={CIRCLE_SIZE} height={CIRCLE_SIZE} viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}>
                <circle className="auth-ring-bg" cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={RING_RADIUS} />
                <circle
                  className={`auth-ring-fg${stage === 'error' ? ' is-error' : ''}`}
                  cx={CIRCLE_SIZE / 2}
                  cy={CIRCLE_SIZE / 2}
                  r={RING_RADIUS}
                  style={{ strokeDasharray: CIRCUMFERENCE, strokeDashoffset: dashOffset }}
                />
              </svg>
              <div className="auth-ring-center" aria-hidden="true">
                {stage === 'error' ? (
                  <span className="auth-ring-error-icon">&times;</span>
                ) : (
                  <span className="auth-ring-pct">
                    {Math.round(percentage)}<span className="auth-ring-percent-symbol">%</span>
                  </span>
                )}
                <span className="auth-ring-state">
                  {stage === 'loading' && 'Please wait'}
                  {stage === 'success' && 'Complete'}
                  {stage === 'error' && 'Try again'}
                </span>
              </div>
            </div>
            <div className="auth-morph-caption">
              <div role="status" aria-live="polite" aria-atomic="true">
                <h2 className="auth-morph-title">{title}</h2>
                <p className="auth-morph-note">{note}</p>
              </div>
              {stage === 'error' && (
                <button type="button" className="auth-morph-retry" onClick={onRetry}>
                  Try again
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AuthMorphOverlay;
