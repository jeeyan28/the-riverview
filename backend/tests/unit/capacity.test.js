const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePaxCapacity } = require('../../utils/roomPricing');
const { roomWriteSchema } = require('../../validation/roomSchemas');
test('guest capacity recognizes explicit guest limits without inventing room-area facts', () => {
  for (const [value, expected] of [['Max 10 pax', 10], ['4–8 guests', 8], ['6', 6], ['', null], ['Ask staff', null], ['25 square metres', null], ['1.5 guests', null], ['101 guests', null]]) assert.equal(parsePaxCapacity(value), expected);
});
test('facility configuration distinguishes unknown capacity, guests and inventory units', () => {
  const room = { name: 'Synthetic room', price: 100, capacity: 0, variants: [{ label: 'Standard', price: 100, pax: '', roomCount: 2 }] };
  assert.equal(roomWriteSchema.validate(room).error, undefined);
  for (const pax of ['101 guests', '25 sqm', '-3 guests']) assert.ok(roomWriteSchema.validate({ ...room, variants: [{ ...room.variants[0], pax }] }).error, pax);
});
