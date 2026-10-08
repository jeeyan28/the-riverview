import { useCallback, useEffect, useRef } from 'react';
import { paymentsService } from '../services/payments';
import { bookingsService } from '../services/bookings';
import { terminalPaymentFailure } from '../utils/paymongoStatus';
import { clearCheckoutState } from '../utils/reservationDraft';

export function usePaymentPolling({ setStep, setResult, invalidateSession, onResumeCheckout }) {
  const callbacks = useRef({ setStep, setResult, invalidateSession, onResumeCheckout });
  callbacks.current = { setStep, setResult, invalidateSession, onResumeCheckout };
  const active = useRef(null), timer = useRef(null);
  const stop = useCallback(() => { active.current?.abort(); active.current = null; clearTimeout(timer.current); }, []);
  const poll = useCallback((id, { provider = 'paymongo', popup = null, attempt = false, maxChecks = 48 } = {}) => {
    stop();
    const controller = new AbortController(); active.current = controller;
    callbacks.current.setStep('paymongoReturn'); callbacks.current.setResult({ phase: 'loading', booking: null });
    let checks = 0, failures = 0;
    const current = () => !controller.signal.aborted && active.current === controller;
    const finish = result => { if (!current()) return; stop(); if (result.phase === 'confirmed' && popup && !popup.closed) popup.close(); callbacks.current.setResult(result); };
    const check = async () => {
      if (!current()) return;
      checks++;
      try {
        const response = attempt ? { data: await paymentsService.attemptStatus(id, { signal: controller.signal }), httpStatus: 200 } : await paymentsService.status(id, { provider, signal: controller.signal });
        if (!current()) return;
        failures = 0;
        const { data, httpStatus } = response;
        if (data.resume && callbacks.current.onResumeCheckout?.(data.resume)) { stop(); return; }
        if (attempt && data.status === 'unpaid') { clearCheckoutState(); finish({ phase: 'failed', booking: null, message: 'No provider checkout was started. Close this dialog and select a time to try again.' }); return; }
        if (data.status === 'paid_slot_unavailable') { finish({ phase: 'paidSlotUnavailable', booking: null, reference: data.attemptId || id, message: data.message || 'Payment was received, but the reservation could not be confirmed. Contact the venue with your payment reference. Please do not pay again.' }); return; }
        if (data.bookingId && (data.status === 'succeeded' || ['Paid', 'Partial'].includes(data.paymentStatus))) {
          const booking = await bookingsService.get(data.bookingId, { signal: controller.signal }).catch(() => null);
          if (!current()) return;
          clearCheckoutState();
          finish({ phase: 'confirmed', booking, bookingId: data.bookingId }); return;
        }
        const failure = terminalPaymentFailure(data, { httpStatus, awaitingMethodChecks: 0 });
        if (failure) { clearCheckoutState(); finish({ ...failure, booking: null }); return; }
      } catch (error) {
        if (!current()) return;
        if (error.status === 401) { callbacks.current.invalidateSession(); finish({ phase: 'needLogin', booking: null }); return; }
        failures++;
      }
      if (checks >= maxChecks || failures >= 4) { finish({ phase: 'pending', booking: null, reference: id, message: 'We are checking your payment. Your original payment attempt is preserved. Use Check payment status; please do not pay again.' }); return; }
      timer.current = setTimeout(check, Math.min(10000, 2000 * 2 ** Math.min(2, failures + Math.floor(checks / 12))));
    };
    check();
  }, [stop]);
  useEffect(() => stop, [stop]);
  return { pollPayment: poll, stopPolling: stop };
}
