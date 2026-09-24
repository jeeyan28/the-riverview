import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime12 } from '../src/utils/time.js';

test('staff and customer time labels use 12-hour clocks at midnight and noon', () => {
  assert.equal(formatTime12('00:00'), '12:00 AM');
  assert.equal(formatTime12('12:00'), '12:00 PM');
  assert.equal(formatTime12('21:52'), '9:52 PM');
  assert.equal(formatTime12('24:00'), '—');
});
