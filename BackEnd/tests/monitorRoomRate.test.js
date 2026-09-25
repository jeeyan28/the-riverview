const test = require('node:test');
const assert = require('node:assert/strict');
const { pricedMonitorRoom } = require('../utils/monitorRoomRate');
const { calculateBookingPrice, calculateSessionExtension } = require('../utils/roomPricing');
const { monitorRoomCreateSchema } = require('../validation/monitoringSchemas');

const catalog = {
  name: 'Billiards',
  variants: [{ label: 'VIP', price: 400, pricingMode: 'flat', extraGuestFee: 50, includedGuests: 0 }],
};

test('legacy VIP Rooms monitor tables use the configured facility rate', () => {
  const table = pricedMonitorRoom({ facilityName: 'Billiards', roomName: 'VIP Rooms', roomNumber: '5', price: 0 }, catalog);
  assert.equal(table.price, 400);
  assert.equal(calculateBookingPrice({ variant: table, timeIn: '13:00', duration: 1 }).amount, 450);
});

test('a positive custom table rate remains authoritative', () => {
  const table = pricedMonitorRoom({ facilityName: 'Billiards', roomName: 'VIP Rooms', price: 500 }, catalog);
  assert.equal(table.price, 500);
});

test('unmatched tables are not given another room type rate', () => {
  const table = pricedMonitorRoom({ facilityName: 'Billiards', roomName: 'Unknown', price: 0 }, catalog);
  assert.equal(table.price, 0);
});

test('new monitor tables require a positive hourly rate', () => {
  const table = { facilityName: 'Billiards', roomName: 'VIP Rooms', roomNumber: '5' };
  assert.ok(monitorRoomCreateSchema.validate({ ...table, price: 0 }).error);
  assert.ok(monitorRoomCreateSchema.validate(table).error);
  assert.equal(monitorRoomCreateSchema.validate({ ...table, price: 400 }).error, undefined);
});

test('extending a session keeps its paid hourly rate when the stored monitor rate is zero', () => {
  const extended = calculateSessionExtension({
    session: { rate: 400, hourlyRates: [400], duration: 1, amount: 400, guestCount: 1 },
    room: { price: 0, isTemporary: false }, addedHours: 1, startHour: 13,
  });
  assert.deepEqual(extended.hourlyRates, [400, 400]);
  assert.equal(extended.amount, 800);
});

test('half-hour extensions charge only the added minutes and respect an evening rate boundary', () => {
  const session = { rate: 200, hourlyRates: [200], duration: 1, amount: 200, guestCount: 1 };
  const room = { price: 200, pricingMode: 'time-based', eveningPrice: 300, eveningStartTime: '17:00' };
  const halfHour = calculateSessionExtension({ session, room, addedHours: 0.5, startHour: 15.5 });
  assert.equal(halfHour.addedCharge, 100);
  assert.equal(halfHour.amount, 300);
  const crossesEvening = calculateSessionExtension({ session, room, addedHours: 1, startHour: 15.5 });
  assert.equal(crossesEvening.addedCharge, 250);
  assert.equal(crossesEvening.amount, 450);
  assert.deepEqual(crossesEvening.hourlyRates, [200, 200, 300]);
});

test('all extension lengths charge the matching fraction of a flat hourly rate', () => {
  const session = { rate: 250, hourlyRates: [250], duration: 1, amount: 250, guestCount: 1 };
  for (const [addedHours, expectedCharge] of [[0.5, 125], [1, 250], [1.5, 375], [2, 500]]) {
    const quote = calculateSessionExtension({ session, room: { price: 250 }, addedHours, startHour: 10 });
    assert.equal(quote.addedCharge, expectedCharge);
    assert.equal(quote.amount, 250 + expectedCharge);
  }
});
