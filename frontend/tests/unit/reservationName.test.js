import test from 'node:test';
import assert from 'node:assert/strict';
import { reservationDisplayName } from '../../src/utils/reservationName.js';

test('reservation names display surname first for new and older records', () => {
  assert.equal(reservationDisplayName('Cabahug, Jian'), 'Cabahug, Jian');
  assert.equal(reservationDisplayName('Jian Kieth Cabahug'), 'Cabahug, Jian Kieth');
  assert.equal(reservationDisplayName('Dela Cruz, Juan Miguel'), 'Dela Cruz, Juan Miguel');
  assert.equal(reservationDisplayName('Jian'), 'Jian');
});
