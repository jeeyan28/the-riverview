import { useCallback, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// useToast — the stateful half of the toast pattern that was copy-pasted
// as its own showToast() function in login.js, register.js, and
// reset-password.js (all three were identical). Per hooks/README.md, this
// is exactly the kind of duplicated *stateful* logic (setTimeout + state)
// that belongs in a hook rather than a plain utils/ function.
//
// Usage in a page:
//   const { toast, showToast } = useToast();
//   ...
//   showToast('Logged in!');            // success (green), auto-hides after 3.2s
//   showToast('Invalid password', 'error');
//   ...
//   <Toast {...toast} />
// ─────────────────────────────────────────────────────────────────────────
export function useToast() {
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const timerRef = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    clearTimeout(timerRef.current);
    // Same 3200ms auto-hide as the original showToast() in login.js.
    timerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 3200);
  }, []);

  return { toast, showToast };
}
