import { useCallback, useEffect, useRef, useState } from 'react';
import { bookingsService } from '../services/bookings';
import { useCountdownClock } from './useCountdownClock';
export function useBookingHold(externalCheckoutRef) {
  const [lock, setLockState] = useState(null), [lockLoading, setLockLoading] = useState(false);
  const lockRef = useRef(null), lockRequestVersionRef = useRef(0);
  const lockNow = useCountdownClock(!!lock);
  const setLock = useCallback(value => { const current = value ? { ...value, observedAtMs: Date.now() } : null; lockRef.current = current; setLockState(current); }, []);
  const releaseCurrentLock = useCallback(async () => {
    lockRequestVersionRef.current++;
    setLockLoading(false);
    const current = lockRef.current;
    setLock(null);
    if (current && !externalCheckoutRef.current) await bookingsService.releaseLock(current.id).catch(() => {});
  }, [externalCheckoutRef, setLock]);
  const acquireHold = useCallback(async payload => {
    const revision = ++lockRequestVersionRef.current; setLockLoading(true);
    try {
      const result = await bookingsService.lockSlot(payload);
      if (revision !== lockRequestVersionRef.current) { await bookingsService.releaseLock(result.id).catch(() => {}); return null; }
      const hold = { id: result.id, expiresAtMs: new Date(result.expiresAt).getTime() };
      setLock(hold); return hold;
    } finally { if (revision === lockRequestVersionRef.current) setLockLoading(false); }
  }, [setLock]);
  useEffect(() => () => {
    lockRequestVersionRef.current++;
    if (lockRef.current && !externalCheckoutRef.current) bookingsService.releaseLock(lockRef.current.id).catch(() => {});
  }, [externalCheckoutRef]);
  return { lock, setLock, lockRef, lockNow, lockLoading, releaseCurrentLock, acquireHold };
}
