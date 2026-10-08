export const initialBookingFlow = { step: 'price', phase: 'selecting' };
const transitions = { price: ['schedule'], schedule: ['price', 'details'], details: ['price', 'schedule', 'payment'], payment: ['details', 'schedule', 'paymongoReturn'], paymongoReturn: ['schedule'] };
const phases = new Set(['selecting', 'validating', 'acquiring_hold', 'preparing_checkout', 'awaiting_payment', 'verifying', 'confirmed', 'failed', 'expired', 'payment_problem']);
export function bookingFlowReducer(state, action) {
  if (action.type === 'RESET') return { step: action.step || 'price', phase: 'selecting' };
  if (action.type === 'RESUME_CHECKOUT') return state.step === 'paymongoReturn' && ['verifying', 'awaiting_payment'].includes(state.phase) ? { step: 'payment', phase: 'awaiting_payment' } : state;
  if (action.type === 'RETURN') return ['confirmed', 'payment_problem'].includes(state.phase) ? state : { step: 'paymongoReturn', phase: 'verifying' };
  if (action.type === 'PHASE' && phases.has(action.phase)) {
    if (['confirmed', 'payment_problem'].includes(state.phase) && action.phase !== state.phase) return state;
    return { ...state, phase: action.phase };
  }
  if (action.type !== 'STEP' || !transitions[state.step]?.includes(action.step) || ['confirmed', 'payment_problem', 'verifying'].includes(state.phase)) return state;
  return { step: action.step, phase: action.step === 'payment' ? 'preparing_checkout' : 'selecting' };
}
