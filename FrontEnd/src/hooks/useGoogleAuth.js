import { useEffect, useRef, useCallback } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function useGoogleAuth(onCredential) {
  const clientRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    let retryTimer;

    function init() {
      if (cancelled) return;
      if (!window.google || !window.google.accounts?.oauth2) {
        retryTimer = setTimeout(init, 300);
        return;
      }

      clientRef.current = window.google.accounts.oauth2.initCodeClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'openid email profile',
        ux_mode: 'popup',
        prompt: 'consent',
        callback: (response) => onCredentialRef.current(response),
      });
    }

    init();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clientRef.current = null;
    };
  }, []);

  const triggerSignIn = useCallback(() => {
    if (!clientRef.current) {
      return false;
    }
    clientRef.current.requestCode();
    return true;
  }, []);

  return { triggerSignIn };
}