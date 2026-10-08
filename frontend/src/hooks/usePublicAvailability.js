import { useCallback, useEffect, useRef, useState } from 'react';
import { bookingsService } from '../services/bookings';

const SLOT_STATES = new Set(['available', 'full', 'outside_hours', 'closed']);

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validResponse(data) {
  if (!data || !validDate(data.serviceDate) || !Array.isArray(data.slots)) return false;
  return data.slots.every((slot) => validDate(slot.date)
    && /^(?:[01]\d|2[0-3]):00$/.test(slot.timeIn || '')
    && SLOT_STATES.has(slot.state)
    && (slot.state !== 'available' || ['amount', 'downPayment', 'remainingBalance'].every((field) => Number.isFinite(slot.quote?.[field]) && slot.quote[field] >= 0)));
}

export function usePublicAvailability(selection, { enabled = true } = {}) {
  const { roomId = '', variantLabel = '', date = '', duration = 1, guestCount = 1, paymentChoice = 'deposit' } = selection || {};
  const key = JSON.stringify([roomId, variantLabel, date, duration, guestCount, paymentChoice]);
  const valid = Boolean(enabled && roomId && variantLabel && validDate(date)
    && Number.isInteger(duration) && duration >= 1 && duration <= 5
    && Number.isInteger(guestCount) && guestCount >= 1 && guestCount <= 100
    && ['deposit', 'full'].includes(paymentChoice));
  const [state, setState] = useState({ key: '', status: 'idle', data: null, error: '' });
  const [revision, setRevision] = useState(0);
  const requestVersion = useRef(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!valid) {
      setState({ key, status: 'idle', data: null, error: '' });
      return undefined;
    }
    const controller = new AbortController();
    let current = true;
    const isCurrent = () => current && version === requestVersion.current && !controller.signal.aborted;
    setState({ key, status: 'loading', data: null, error: '' });
    bookingsService.slots({ roomId, variantLabel, date, duration, guestCount, paymentChoice }, { signal: controller.signal })
      .then((data) => {
        if (!isCurrent()) return;
        if (!validResponse(data)) throw new Error('Availability returned an incomplete response. Please retry.');
        setState({ key, status: 'ready', data, error: '' });
      })
      .catch((error) => {
        if (isCurrent()) setState({ key, status: 'error', data: null, error: error.message || 'We could not load availability. Please try again.' });
      });
    return () => { current = false; controller.abort(); };
  }, [roomId, variantLabel, date, duration, guestCount, paymentChoice, valid, key, revision]);

  if (!valid) return { status: 'idle', data: null, error: '', retry };
  if (state.key !== key) return { status: 'loading', data: null, error: '', retry };
  return { status: state.status, data: state.data, error: state.error, retry };
}
