import { useCallback, useEffect, useRef, useState } from 'react';
import { redirectAfterLogin } from '../utils/auth';

const READY_DELAY_MS = 420;
const REDIRECT_DELAY_MS = 180;

export function useAuthMorph() {
  const [stage, setStage] = useState('idle');
  const userRef = useRef(null);

  useEffect(() => {
    if (stage !== 'loading') return undefined;
    const timer = setTimeout(() => setStage('success'), READY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'success') return undefined;
    const timer = setTimeout(() => {
      try {
        redirectAfterLogin(userRef.current);
      } catch {
        setStage('error');
      }
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  const beginMorph = useCallback((user) => {
    userRef.current = user;
    setStage('loading');
  }, []);

  const retry = useCallback(() => {
    setStage('loading');
  }, []);

  return { stage, beginMorph, retry };
}
