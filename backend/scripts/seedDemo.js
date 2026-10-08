const mongoose = require('mongoose');
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
const { assertIsolatedDatabase, assertDemoEnvironment } = require('../utils/isolatedDatabase');
const { businessDate, addDays } = require('../utils/businessDate');
const User = require('../model/user');
const Room = require('../model/room');
const Booking = require('../model/booking');
const Settings = require('../model/settings');
const PaymentAttempt = require('../model/paymentAttempt');
const { MonitorRoom, RoomSession } = require('../model/monitoring');
const { queueReceipt } = require('../utils/receiptOutbox');

const PASSWORD = 'Evaluate2026!';
const id = number => new mongoose.Types.ObjectId('de000000' + number.toString(16).padStart(16, '0'));
async function upsert(Model, fields) {
  const existing = await Model.findById(fields._id);
  if (existing) return existing;
  return Model.create(fields);
}
async function seedDemo({ uri = process.env.DEMO_MONGO_URI, reset = false, now = new Date() } = {}) {
  assertIsolatedDatabase(uri, 'demo');
  assertDemoEnvironment({ ...process.env, APP_MODE: 'demo', DEMO_MONGO_URI: uri });
  const ownedConnection = mongoose.connection.readyState === 0;
  if (ownedConnection) await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const meta = mongoose.connection.db.collection('_demo_meta');
    const ownership = await meta.findOne({ _id: 'riverview-demo-v1' });
    const collections = await mongoose.connection.db.listCollections().toArray();
    if (!ownership && collections.some(item => !item.name.startsWith('system.'))) throw new Error('Refusing to seed a populated database without the Riverview demo ownership marker.');
    if (reset && ownership) await mongoose.connection.db.dropDatabase();
    await mongoose.connection.db.collection('_demo_meta').updateOne({ _id: 'riverview-demo-v1' }, { $setOnInsert: { synthetic: true, createdAt: now } }, { upsert: true });
    const users = [];
    for (const [index, role] of ['user', 'staff', 'manager', 'super_admin'].entries()) {
      const name = ['Customer', 'Staff', 'Supervisor', 'Owner'][index];
      users.push(await upsert(User, { _id: id(index + 1), firstName: 'Demo', lastName: name, email: name.toLowerCase() + '@riverview.demo', phone: '+639170000001', password: PASSWORD, role, isVerified: true, isActive: true }));
    }
    const today = businessDate(now), tomorrow = addDays(today, 1);
    await upsert(Settings, { _id: 'global', operatingHours: { openTime: '07:00', closeTime: '02:00', openDays: [0, 1, 2, 3, 4, 5, 6], minOnlineDurationHours: 1, maxOnlineDurationHours: 5 }, announcements: [{ title: 'Synthetic reviewer demo', message: 'All accounts, reservations, charts, payments and email results are synthetic. No external payment or email service is contacted.', emoji: '◌' }], holidays: [{ name: 'Demo closure', date: addDays(today, 7), fullDay: true, note: 'Synthetic closure for review.' }] });
    const rooms = [];
    for (const [index, room] of [
      { name: 'Billiards', description: 'Pool tables beside the riverside venue.', variants: [{ label: 'Standard Table', price: 180, eveningPrice: 220, eveningStartTime: '17:00', pricingMode: 'time-based', pax: '4 guests', roomCount: 3, features: ['Pool table', 'Cue set'], status: 'Available' }] },
      { name: 'KTV Rooms', description: 'Private karaoke rooms for small groups.', variants: [{ label: 'Standard KTV', price: 400, pax: '8 guests', roomCount: 2, includedGuests: 4, extraGuestFee: 25, features: ['Karaoke system', 'Air conditioning'], status: 'Available' }, { label: 'VIP KTV', price: 600, pax: '12 guests', roomCount: 1, includedGuests: 0, extraGuestFee: 20, features: ['Karaoke system', 'Lounge seating'], status: 'Available' }], addOns: [{ name: 'Microphone cover set', fee: 30 }], discountPercent: 10 },
      { name: 'Basketball Court', description: 'A shared venue court with a configured hourly schedule.', capacity: 20, variants: [{ label: 'Court', price: 500, pax: '20 guests', roomCount: 1, features: ['Full court'], status: 'Available' }] },
    ].entries()) rooms.push(await upsert(Room, { ...room, _id: id(20 + index), createdAt: new Date(addDays(today, -410) + 'T07:00:00+08:00') }));
    const models = [User, Room, Booking, Settings, PaymentAttempt, MonitorRoom, RoomSession, require('../model/receiptJob'), require('../model/rateLimitCounter'), require('../model/jobLease'), require('../model/notification')];
    await Promise.all(models.map(Model => Model.createIndexes()));
    for (let day = 1; day <= 400; day++) {
      const date = addDays(today, -day), weekday = new Date(date + 'T12:00:00+08:00').getUTCDay();
      if (day % 31 === 0) continue;
      const amount = 400 + weekday * 180 + day % 9 * 60;
      await upsert(Booking, { _id: id(1000 + day), reservationCode: 'DEMO-HISTORY-' + date, guestName: 'Synthetic, Guest', guestEmail: 'customer@riverview.demo', room: rooms[0]._id, roomLabel: rooms[0].name, variantLabel: 'Standard Table', date, timeIn: '10:00', duration: 2, amount, roomCharge: amount, paidAmount: amount, downPayment: amount, paymentChoice: 'full', paymentStatus: 'Paid', paymentProvider: 'demo', paymentMethod: 'Demo simulation', source: 'online', status: 'Done', bookedBy: users[0]._id, createdAt: new Date(date + 'T08:00:00+08:00') });
    }
    const upcoming = await upsert(Booking, { _id: id(100), reservationCode: 'DEMO-UPCOMING-001', guestName: 'Customer, Demo', guestEmail: users[0].email, guestContact: users[0].phone, guestCount: 4, room: rooms[1]._id, roomLabel: rooms[1].name, variantLabel: 'Standard KTV', date: tomorrow, timeIn: '18:00', duration: 2, amount: 800, roomCharge: 800, hourlyRates: [400, 400], paidAmount: 400, downPayment: 400, paymentStatus: 'Partial', paymentProvider: 'demo', paymentMethod: 'Demo simulation', source: 'online', status: 'Confirmed', bookedBy: users[0]._id });
    const receipt = await queueReceipt(upcoming);
    await require('../model/receiptJob').updateOne({ _id: receipt._id }, { $set: { state: 'attention', attempts: 5, lastError: 'Synthetic SMTP retry limit reached. No email was sent.', lastErrorCode: 'DEMO_DELIVERY' } });
    await upsert(Booking, { _id: id(101), reservationCode: 'DEMO-FULL-COURT', guestName: 'Synthetic, Group', guestCount: 12, room: rooms[2]._id, roomLabel: rooms[2].name, variantLabel: 'Court', date: tomorrow, timeIn: '17:00', duration: 2, amount: 1000, paidAmount: 1000, downPayment: 1000, paymentStatus: 'Paid', paymentProvider: 'demo', paymentMethod: 'Demo simulation', source: 'online', status: 'Confirmed', bookedBy: users[0]._id });
    for (let index = 0; index < 3; index++) await upsert(MonitorRoom, { _id: id(300 + index), facilityName: 'Billiards', roomName: 'Standard Table', roomNumber: String(index + 1), price: 180, pax: '4 guests', status: index === 0 ? 'Occupied' : 'Available' });
    await upsert(RoomSession, { _id: id(310), room: id(300), roomNumber: '1', facilityName: 'Billiards', roomName: 'Standard Table', guestName: 'Synthetic, Walk-in', guestCount: 2, startTime: new Date(now.getTime() - 3600000), scheduledEndTime: new Date(now.getTime() + 3600000), duration: 2, rate: 180, amount: 360, roomCharge: 360, paidAmount: 360, paymentStatus: 'Paid', status: 'Active', paymentMethod: 'Demo cash', createdBy: users[1]._id });
    return { today, tomorrow, customer: users[0].email, owner: users[3].email, password: PASSWORD };
  } finally { if (ownedConnection) await mongoose.disconnect(); }
}
if (require.main === module) seedDemo({ reset: process.argv.includes('--reset') }).then(result => console.log('Synthetic demo seeded:', result)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { seedDemo };
