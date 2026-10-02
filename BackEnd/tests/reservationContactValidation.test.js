const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookingSchema, updateBookingSchema } = require('../validation/bookingSchemas');
const { createIntentSchema } = require('../validation/paymentSchemas');

const reservation = {
  guestName: 'Cabahug, Jian',
  guestContact: '0912 345 6789',
  guestEmail: 'jian@example.com',
  roomId: '507f1f77bcf86cd799439011',
  date: '2026-10-02',
  timeIn: '12:00',
  duration: 1,
};

for (const [name, schema] of [['manual reservation', createBookingSchema], ['online payment', createIntentSchema]]) {
  test(`${name} requires a separate phone number and email`, () => {
    assert.equal(schema.validate(reservation).error, undefined);
    assert.ok(schema.validate({ ...reservation, guestContact: undefined }).error);
    assert.ok(schema.validate({ ...reservation, guestEmail: undefined }).error);
    assert.ok(schema.validate({ ...reservation, guestContact: 'jian@example.com' }).error);
    assert.ok(schema.validate({ ...reservation, guestContact: '0------' }).error);
    assert.ok(schema.validate({ ...reservation, guestEmail: '09123456789' }).error);
  });
}

test('legacy reservations can be updated without contact fields, but empty contact replacements are rejected', () => {
  assert.equal(updateBookingSchema.validate({ status: 'Confirmed' }).error, undefined);
  assert.ok(updateBookingSchema.validate({ guestContact: '' }).error);
  assert.ok(updateBookingSchema.validate({ guestEmail: '' }).error);
});
