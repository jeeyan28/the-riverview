import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingFlowReducer as reduce, initialBookingFlow } from '../../src/utils/bookingFlow.js';
import { validReservationDraft, saveReservationDraft, loadReservationDraft, clearReservationDraft } from '../../src/utils/reservationDraft.js';
import { safeReturnPath } from '../../src/utils/auth.js';
test('booking transitions reject skipped steps and freeze confirmed outcomes', () => {
  assert.deepEqual(reduce(initialBookingFlow, { type: 'STEP', step: 'payment' }), initialBookingFlow);
  let state = initialBookingFlow;
  for (const step of ['schedule', 'details', 'payment']) state = reduce(state, { type: 'STEP', step });
  assert.equal(state.phase, 'preparing_checkout');
  state = reduce(state, { type: 'RETURN' }); state = reduce(state, { type: 'PHASE', phase: 'confirmed' });
  assert.deepEqual(reduce(state, { type: 'STEP', step: 'payment' }), state);
  assert.deepEqual(reduce(state, { type: 'PHASE', phase: 'failed' }), state);
  assert.deepEqual(reduce(state, { type: 'RETURN' }), state);
  assert.deepEqual(reduce(state, { type: 'RESUME_CHECKOUT' }), state);
  assert.equal(reduce(state, { type: 'RESET', step: 'schedule' }).phase, 'selecting');
});

test('a verified original checkout resumes from verification without reopening a confirmed result', () => {
  assert.deepEqual(reduce({ step: 'paymongoReturn', phase: 'verifying' }, { type: 'RESUME_CHECKOUT' }), { step: 'payment', phase: 'awaiting_payment' });
  assert.deepEqual(reduce(initialBookingFlow, { type: 'RESUME_CHECKOUT' }), initialBookingFlow);
});
test('draft handoff keeps schedule fields, excludes private fields and expires', t => {
  const values = new Map(), previous = globalThis.sessionStorage;
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } });
  t.after(() => Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: previous }));
  const now = Date.parse('2026-10-07T06:00:00Z');
  const draft = { roomId: '507f1f77bcf86cd799439011', variantLabel: 'Standard', date: '2026-10-09', serviceDate: '2026-10-08', timeIn: '01:00', duration: 2, guestCount: 3, paymentChoice: 'full', guestName: 'Private', cardCvc: '123' };
  const saved = saveReservationDraft(draft, now);
  assert.deepEqual(loadReservationDraft(draft.roomId, now), saved); assert.equal(saved.cardCvc, undefined); assert.equal(saved.guestName, undefined);
  assert.equal(loadReservationDraft(draft.roomId, now + 7200001), null); clearReservationDraft();
  for (const invalid of [{ ...draft, date: '2026-02-30' }, { ...draft, duration: 0 }, { ...draft, guestCount: 1.5 }, { ...draft, timeIn: '10:30' }]) assert.equal(validReservationDraft(invalid, now), null);
});
test('login return paths reject external and encoded redirect tricks', () => {
  for (const path of ['https://example.test', '//example.test', '/%2fexample.test', '/%5cexample.test', '/%0aexample.test', '/bad%zz']) assert.equal(safeReturnPath(path), '');
  assert.equal(safeReturnPath('/rooms/demo?reserve=1'), '/rooms/demo?reserve=1');
});
