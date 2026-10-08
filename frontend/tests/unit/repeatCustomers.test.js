import test from 'node:test';
import assert from 'node:assert/strict';
import { repeatCustomerLookupTerm, repeatCustomerSuggestions } from '../../src/utils/repeatCustomers.js';

const rooms = [
  { _id: 'billiards', name: 'Billiards', variants: [{ label: 'Shared Room', status: 'Available' }, { label: 'VIP', status: 'Available' }] },
  { _id: 'court', name: 'Court', variants: [] },
];

function booking(index, overrides = {}) {
  return {
    _id: String(index), guestName: 'Jian Kieth Cabahug', guestContact: '0912 345 6789', guestEmail: 'jian@example.com',
    room: 'billiards', variantLabel: 'Shared Room', duration: 1, guestCount: 2, status: 'Done',
    date: '2026-09-01', timeIn: '14:00', paidAmount: 150, specialRequests: 'Old note',
    createdAt: `2026-09-${String(index).padStart(2, '0')}T10:00:00Z`,
    ...overrides,
  };
}

test('name lookup supports surname-first and older first-name-first reservations', () => {
  assert.equal(repeatCustomerLookupTerm('Cabahug, Jian'), 'cabahug');
  const results = repeatCustomerSuggestions([booking(1)], 'Cabahug, Jian', rooms);
  assert.equal(results[0].name, 'Cabahug, Jian Kieth');
  assert.equal(results[0].phone, '0912 345 6789');
  assert.equal(results[0].email, 'jian@example.com');
});

test('repeat customer prefills the most common available facility, room, duration and guest count', () => {
  const history = [
    booking(1), booking(2), booking(3, { duration: 2, guestCount: 3 }),
    booking(4, { room: 'court', variantLabel: null, duration: 3 }),
    booking(5, { room: 'court', variantLabel: null, duration: 3 }),
    booking(6, { room: 'court', variantLabel: null, status: 'Cancelled' }),
  ];
  const [customer] = repeatCustomerSuggestions(history, 'Jian', rooms);
  assert.equal(customer.reservationCount, 6);
  assert.deepEqual(customer.preference, {
    roomId: 'billiards', roomName: 'Billiards', variantLabel: 'Shared Room', duration: 1, guestCount: 2,
  });
  for (const field of ['date', 'timeIn', 'paidAmount', 'specialRequests']) assert.equal(customer[field], undefined);
});

test('matching names with different phone numbers remain separate customers', () => {
  const results = repeatCustomerSuggestions([
    booking(1), booking(2, { guestContact: '0999 000 1111', guestEmail: 'other@example.com' }),
  ], 'Jian', rooms);
  assert.equal(results.length, 2);
  assert.notEqual(results[0].key, results[1].key);
});

test('an unavailable usual room falls back to the most common usable choice', () => {
  const currentRooms = [{ ...rooms[0], variants: [{ label: 'Shared Room', status: 'Unavailable' }] }, rooms[1]];
  const results = repeatCustomerSuggestions([
    booking(1), booking(2), booking(3, { room: 'court', variantLabel: null, duration: 2, guestCount: 4 }),
  ], 'Jian', currentRooms);
  assert.equal(results[0].preference.roomId, 'court');
  assert.equal(results[0].preference.duration, 2);
  assert.equal(results[0].preference.guestCount, 4);
});

test('an older facility id still selects the current facility by its saved name', () => {
  const [customer] = repeatCustomerSuggestions([
    booking(1, { room: 'old-billiards-id', roomLabel: 'Billiards' }),
    booking(2, { room: null, roomLabel: 'Billiards' }),
  ], 'Cabahug', rooms);
  assert.equal(customer.preference.roomId, 'billiards');
  assert.equal(customer.preference.variantLabel, 'Shared Room');
});

test('a removed room type still selects the usual facility and an available room type', () => {
  const currentRooms = [{ ...rooms[0], variants: [{ label: 'New Shared Room', status: 'Available' }] }];
  const [customer] = repeatCustomerSuggestions([booking(1), booking(2)], 'Jian', currentRooms);
  assert.equal(customer.preference.roomId, 'billiards');
  assert.equal(customer.preference.variantLabel, 'New Shared Room');
});

test('within the usual facility, the most frequently reserved room type is selected', () => {
  const [customer] = repeatCustomerSuggestions([
    booking(1), booking(2, { variantLabel: 'VIP' }), booking(3, { variantLabel: 'VIP' }),
  ], 'Jian', rooms);
  assert.equal(customer.preference.roomId, 'billiards');
  assert.equal(customer.preference.variantLabel, 'VIP');
});
