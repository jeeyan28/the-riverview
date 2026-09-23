const test = require('node:test');
const assert = require('node:assert/strict');
const { roomWriteSchema } = require('../validation/roomSchemas');
const { sessionCreateSchema } = require('../validation/monitoringSchemas');
const { MonitorRoom } = require('../model/monitoring');
const { syncRoomInventory, releasedMonitorStatus } = require('../utils/syncRoomInventory');

test('facility writes only allow room numbering from 1', () => {
  const base = { name: 'Court', variants: [{ label: 'Standard', price: 350, roomCount: 3 }] };
  const valid = roomWriteSchema.validate(base);
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.variants[0].startingRoomNumber, 1);
  assert.ok(roomWriteSchema.validate({
    ...base, variants: [{ ...base.variants[0], startingRoomNumber: 101 }],
  }).error);
  assert.ok(sessionCreateSchema.validate({
    bookingId: '507f1f77bcf86cd799439011', duration: 1,
    roomTarget: { facilityName: 'Court', roomName: 'Standard', roomCount: 3, startingRoomNumber: 101 },
  }).error);
});

test('inventory starts at 1 and reuses an idle legacy room when renumbered', async () => {
  const originalFind = MonitorRoom.find;
  const originalCreate = MonitorRoom.create;
  const legacy = {
    _id: 'legacy-room', facilityName: 'Court', roomName: 'Official Games',
    roomNumber: '2', status: 'Available', isTemporary: false,
    save: async () => {},
  };
  const created = [];
  MonitorRoom.find = async () => [legacy];
  MonitorRoom.create = async ([values]) => {
    const room = { ...values, _id: `new-${created.length + 1}` };
    created.push(room);
    return [room];
  };

  try {
    await syncRoomInventory({
      name: 'Court',
      variants: [{ label: 'Official Games', startingRoomNumber: 2, roomCount: 1, price: 500 }],
    });
    assert.equal(legacy.roomNumber, '1');
    assert.deepEqual(created, []);
  } finally {
    MonitorRoom.find = originalFind;
    MonitorRoom.create = originalCreate;
  }
});

test('renumbering preserves existing rooms already in the new range', async () => {
  const originalFind = MonitorRoom.find;
  const originalCreate = MonitorRoom.create;
  const rooms = [2, 3, 4].map((number) => ({
    _id: `room-${number}`, facilityName: 'Court', roomName: 'Standard',
    roomNumber: String(number), status: 'Available', isTemporary: false,
    save: async () => {},
  }));
  const created = [];
  MonitorRoom.find = async () => rooms;
  MonitorRoom.create = async ([values]) => {
    created.push(values);
    return [{ ...values, _id: 'new-room' }];
  };

  try {
    await syncRoomInventory({
      name: 'Court',
      variants: [{ label: 'Standard', roomCount: 3, price: 350 }],
    });
    assert.deepEqual(rooms.map((room) => room.roomNumber), ['2', '3', '1']);
    assert.deepEqual(created, []);
  } finally {
    MonitorRoom.find = originalFind;
    MonitorRoom.create = originalCreate;
  }
});

test('an occupied legacy room is retired when its session ends', () => {
  const catalog = { variants: [{ label: 'Official Games', roomCount: 1, status: 'Available' }] };
  const room = { roomName: 'Official Games', roomNumber: '2', isTemporary: false };
  assert.equal(releasedMonitorStatus(room, catalog), 'Inactive');
  assert.equal(releasedMonitorStatus({ ...room, roomNumber: '1' }, catalog), 'Available');
});
