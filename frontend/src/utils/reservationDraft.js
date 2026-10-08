import { businessDate } from './businessDate.js';
const KEY = 'riverview_reservation_draft';
const MAX_AGE = 2 * 60 * 60 * 1000;
export function validReservationDraft(input, now = Date.now()) {
  if (!input || !/^[a-f\d]{24}$/i.test(input.roomId || '') || typeof input.variantLabel !== 'string' || input.variantLabel.length > 80) return null;
  const date = new Date(`${input.date}T00:00:00Z`);
  const service = new Date(`${input.serviceDate || input.date}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date || !Number.isFinite(service.getTime()) || service.toISOString().slice(0, 10) !== (input.serviceDate || input.date)) return null;
  if (input.date < businessDate(new Date(now)) || !/^(?:[01]\d|2[0-3]):00$/.test(input.timeIn || '') || !Number.isInteger(input.duration) || input.duration < 1 || input.duration > 5 || !Number.isInteger(input.guestCount) || input.guestCount < 1 || input.guestCount > 100) return null;
  if (date - service < 0 || date - service > 86400000) return null;
  return { roomId: input.roomId, variantLabel: input.variantLabel, date: input.date, serviceDate: input.serviceDate || input.date, timeIn: input.timeIn, duration: input.duration, guestCount: input.guestCount, paymentChoice: input.duration > 1 && input.paymentChoice === 'full' ? 'full' : 'deposit' };
}
export function saveReservationDraft(input, now = Date.now()) {
  const draft = validReservationDraft(input, now);
  if (!draft) return null;
  try { sessionStorage.setItem(KEY, JSON.stringify({ savedAt: now, draft })); } catch { /* storage */ }
  return draft;
}
export function loadReservationDraft(roomId, now = Date.now()) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY));
    if (!saved || !Number.isFinite(saved.savedAt) || saved.savedAt > now || now - saved.savedAt > MAX_AGE) { clearReservationDraft(); return null; }
    const draft = validReservationDraft(saved.draft, now);
    if (!draft) { clearReservationDraft(); return null; }
    return !roomId || draft.roomId === roomId ? draft : null;
  } catch { return null; }
}
export function clearReservationDraft() { try { sessionStorage.removeItem(KEY); } catch { /* storage */ } }
export function clearCheckoutState() { try { sessionStorage.removeItem('riverview_checkout_attempt'); } catch { /* storage */ } }
