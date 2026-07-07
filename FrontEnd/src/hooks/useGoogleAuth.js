import { useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// useGoogleAuth — extracts the Google Identity Services sign-in logic that
// was duplicated identically in the original login.js and register.js
// (both call the same initGoogleSignIn/initGoogleSignUp + handleGoogle-
// Credential pattern). Rather than copy-pasting it a second time into
// Register.jsx the way the original project copy-pasted it into a second
// .js file, it lives here once — same rationale as hooks/useToast.js.
//
// IMPORTANT (Phase 8 fix): the original vanilla-JS version created its
// hidden `#google-btn-host` div and appended it straight to
// `document.body`, and never removed it. That was harmless in the old
// multi-page site, because navigating to a different page did a full
// browser reload, which wiped the DOM anyway. In this SPA, switching
// between routes does NOT reload the page — so without cleanup, that
// hidden div (and Google's click listener on it) would leak a little more
// each time an auth page mounted. This hook removes its host div when the
// owning component unmounts, so navigating Login -> Register -> Login
// doesn't accumulate orphaned nodes.
//
// Usage:
//   const { triggerSignIn } = useGoogleAuth(async (credentialResponse) => {
//     // exchange credentialResponse.credential with the backend, same as
//     // handleGoogleCredential did in the original login.js/register.js
//   });
//   <button onClick={() => { if (!triggerSignIn()) showToast('...'); }}>
// ─────────────────────────────────────────────────────────────────────────

const GOOGLE_CLIENT_ID = '488226777682-bvm3f2kr7oi1nkbmcs96mm0n09gvgvf0.apps.googleusercontent.com';

export function useGoogleAuth(onCredential) {
  const hostRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  onCredentialRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    let retryTimer;

    function init() {
      if (cancelled) return;
      if (!window.google || !window.google.accounts?.id) {
        retryTimer = setTimeout(init, 300);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredentialRef.current(response),
        // Needed for browsers (Safari, Chrome w/ 3rd-party-cookie blocking,
        // etc.) that reject Google's default FedCM/One-Tap flow silently.
        use_fedcm_for_prompt: true,
      });

      // Render Google's own button into a hidden host as the reliable,
      // guaranteed-visible fallback, then forward a click on our styled
      // button to it — google.accounts.id.prompt() (One Tap) is frequently
      // suppressed by the browser with no error and no callback.
      const div = document.createElement('div');
      div.id = 'google-btn-host';
      div.style.display = 'none';
      document.body.appendChild(div);
      hostRef.current = div;
      window.google.accounts.id.renderButton(div, { type: 'standard' });
    }

    init();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (hostRef.current && hostRef.current.parentNode) {
        hostRef.current.parentNode.removeChild(hostRef.current);
      }
      hostRef.current = null;
    };
  }, []);

  // Returns true if the click was forwarded to Google, false if GSI hasn't
  // loaded yet (caller should show its own "still loading" toast in that case).
  const triggerSignIn = useCallback(() => {
    if (!window.google || !window.google.accounts?.id) {
      return false;
    }
    const realGoogleButton = hostRef.current?.querySelector('div[role="button"]');
    if (realGoogleButton) {
      realGoogleButton.click();
    } else {
      window.google.accounts.id.prompt();
    }
    return true;
  }, []);

  return { triggerSignIn };
}
