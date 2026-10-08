import { useCallback, useRef, useState } from 'react';
import { paymentsService } from '../services/payments';
const KEY = 'riverview_checkout_attempt';
export function readCheckoutAttempt() { try { const value = JSON.parse(sessionStorage.getItem(KEY)); return value && /^[a-f\d]{24}$/i.test(value.holdId) && /^[a-f\d-]{36}$/i.test(value.clientKey) ? value : null; } catch { return null; } }
export function useCheckoutAttempt() {
  const current = useRef(readCheckoutAttempt());
  const [attemptId, setAttemptId] = useState(current.current?.attemptId || '');
  const restoreCheckout = useCallback(checkout => {
    current.current = { ...current.current, attemptId: checkout.attemptId, provider: checkout.gateway, providerId: checkout.paymentIntentId };
    setAttemptId(checkout.attemptId);
    try { sessionStorage.setItem(KEY, JSON.stringify(current.current)); } catch { /* storage */ }
  }, []);
  const prepare = useCallback(async (holdId, payload, options) => {
    if (!holdId) throw new Error('Your hold expired. Choose a time again.');
    if (!current.current || current.current.holdId !== holdId) current.current = { holdId, roomId: payload.roomId, clientKey: crypto.randomUUID() };
    try { sessionStorage.setItem(KEY, JSON.stringify(current.current)); } catch { /* storage */ }
    const data = await paymentsService.createIntent({ ...payload, attemptKey: current.current.clientKey }, options);
    current.current = { ...current.current, attemptId: data.attemptId, provider: data.gateway, providerId: data.paymentIntentId || data.referenceId };
    setAttemptId(data.attemptId || '');
    try { sessionStorage.setItem(KEY, JSON.stringify(current.current)); } catch { /* storage */ }
    return data;
  }, []);
  return { attemptId, prepareCheckout: prepare, restoreCheckout, recoverAttempt: current.current };
}
