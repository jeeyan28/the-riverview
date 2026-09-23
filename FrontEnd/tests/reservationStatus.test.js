import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationPresentation } from '../src/utils/reservationStatus.js';

const booking = { status: 'Confirmed', date: '2026-09-23', timeIn: '13:00', duration: 1 };
const at = (time) => Date.parse(`2026-09-23T${time}:00+08:00`);

test('confirmed reservation becomes overdue at 1:01 and no-show at 2:00', () => {
  assert.deepEqual(reservationPresentation(booking, at('13:00')), { status: 'Confirmed', warning: '' });
  assert.deepEqual(reservationPresentation(booking, at('13:01')), { status: 'Overdue', warning: '' });
  assert.deepEqual(reservationPresentation(booking, at('13:59')), { status: 'Overdue', warning: '' });
  assert.deepEqual(reservationPresentation(booking, at('14:00')), { status: 'No Show', warning: '' });
});

test('active sessions and pending cancellation requests do not become no-shows', () => {
  assert.deepEqual(reservationPresentation({ ...booking, status: 'Ongoing' }, at('14:00')), { status: 'In Use', warning: '' });
  assert.deepEqual(reservationPresentation({ ...booking, cancellationStatus: 'Requested' }, at('14:00')), { status: 'Confirmed', warning: '' });
});

test('payment workflow statuses stay under Pending without creating Overdue', () => {
  assert.deepEqual(reservationPresentation({ status: 'Pending Payment Verification' }, at('14:00')), { status: 'Pending', warning: 'Verify payment' });
  assert.deepEqual(reservationPresentation({ status: 'Awaiting Online Payment' }, at('14:00')), { status: 'Pending', warning: 'Awaiting payment' });
});
