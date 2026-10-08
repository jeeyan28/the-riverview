import { useEffect, useRef, useCallback } from 'react';
import { getEmbeddedBrowserInfo } from '../utils/embeddedBrowser';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export { getEmbeddedBrowserInfo } from '../utils/embeddedBrowser';

export function useGoogleAuth(onCredential, { enabled = true } = {}) {
  const clientRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  const embeddedBrowser = getEmbeddedBrowserInfo();
  const embeddedName = embeddedBrowser?.name;
  const googleAvailable = enabled && Boolean(GOOGLE_CLIENT_ID) && import.meta.env.VITE_DEMO_MODE !== 'true';
  onCredentialRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    let retryTimer;
    if (!googleAvailable || embeddedName) return undefined;
    if (!window.google && !document.getElementById('riverview-google-sdk')) {
      const script = document.createElement('script');
      script.id = 'riverview-google-sdk';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }

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
        callback: (response) => onCredentialRef.current(response),
      });
    }

    init();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clientRef.current = null;
    };
  }, [embeddedName, googleAvailable]);

  const triggerSignIn = useCallback(() => {
    if (!googleAvailable || !clientRef.current) {
      return false;
    }
    clientRef.current.requestCode();
    return true;
  }, [googleAvailable]);

  return { triggerSignIn, embeddedBrowser, googleAvailable };
}
