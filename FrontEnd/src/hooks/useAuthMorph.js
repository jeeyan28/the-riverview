import { useCallback, useEffect, useRef, useState } from 'react';
import { redirectAfterLogin } from '../utils/auth';

const MORPH_DURATION_MS = 900;
const PROGRESS_INTERVAL_MS = 90;
const PROGRESS_CAP = 88;
const PROGRESS_STEP_RATIO = 0.1;
const PROGRESS_TARGET = 90;
const FINISH_DELAY_MS = 300;

export function useAuthMorph() {
  const [stage, setStage] = useState('idle');
  const [rect, setRect] = useState(null);
  const [progress, setProgress] = useState(0);
  const userRef = useRef(null);

  useEffect(() => {
    if (stage !== 'morphing') return undefined;
    const timer = setTimeout(() => setStage('loading'), MORPH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'loading') return undefined;
    setProgress(0);
    let current = 0;
    const interval = setInterval(() => {
      current += (PROGRESS_TARGET - current) * PROGRESS_STEP_RATIO;
      setProgress(current);
      if (current > PROGRESS_CAP) {
        clearInterval(interval);
        setTimeout(() => {
          setProgress(100);
          try {
            redirectAfterLogin(userRef.current);
            setStage('success');
          } catch {
            setStage('error');
          }
        }, FINISH_DELAY_MS);
      }
    }, PROGRESS_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [stage]);

  const beginMorph = useCallback((user, cardRect) => {
    if (!cardRect) return;
    userRef.current = user;
    setRect(cardRect);
    setStage('morphing');
  }, []);

  const retry = useCallback(() => {
    setStage('loading');
  }, []);

  return { stage, rect, progress, beginMorph, retry };
}
