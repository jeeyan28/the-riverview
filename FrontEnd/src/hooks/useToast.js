import { useCallback, useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const timerRef = useRef(null);
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 3200);
  }, []);

  return { toast, showToast };
}
