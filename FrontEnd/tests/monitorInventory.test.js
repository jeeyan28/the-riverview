import test from 'node:test';
import assert from 'node:assert/strict';
import { filterMonitorInventory, getBookingRoomTarget } from '../src/utils/monitorInventory.js';

test('live monitoring hides retired inactive rooms and temporary rooms', () => {
  const facilities = [{ name: 'Billiards', variants: [{ label: 'Shared Room', roomCount: 1 }] }];
  const rooms = [
    { roomName: 'Big Rooms', roomNumber: '1', facilityName: 'Billiards', status: 'Inactive' },
    { roomName: 'VIP Rooms', roomNumber: '2', facilityName: 'Billiards', status: 'Inactive', isTemporary: true },
    { roomName: 'Shared Room', roomNumber: '1', facilityName: 'Billiards', status: 'Inactive' },
    { roomName: 'Shared Room', roomNumber: '2', facilityName: 'Billiards', status: 'Inactive' },
    { roomName: 'Big Rooms', roomNumber: '1', facilityName: 'Billiards', status: 'Occupied' },
  ];

  assert.deepEqual(filterMonitorInventory(rooms, facilities), [rooms[2], rooms[4]]);
});

test('a saved facility label can reconnect an older reservation to its active monitor room', () => {
  const rooms = [{ facilityName: 'Billiards', roomName: 'Shared Room', roomNumber: '1', status: 'Available' }];
  const booking = { room: null, roomLabel: 'Billiards', variantLabel: 'Shared Room' };
  assert.deepEqual(getBookingRoomTarget(booking, rooms), {
    facilityName: 'Billiards', roomName: 'Shared Room', startingRoomNumber: 1, roomCount: 1,
  });
  assert.equal(getBookingRoomTarget({ ...booking, variantLabel: 'Removed Room' }, rooms), null);
  assert.equal(getBookingRoomTarget(booking, [{ ...rooms[0], status: 'Inactive' }]), null);
});
