const Booking = require('../model/booking');
const { RoomSession } = require('../model/monitoring');
const { dateRange } = require('./businessDate');
const { buildSalesReport } = require('./salesLedger');

async function getSalesReport({ from, to, source = 'all', maxDays = 92 }) {
  const { start, end } = dateRange(from, to, maxDays);
  const [bookings, sessions] = await Promise.all([
    Booking.find({ date: { $gte: from, $lte: to } }).populate('room', 'name').lean(),
    RoomSession.find({ startTime: { $gte: start, $lt: end } }).lean(),
  ]);
  const bookingIds = new Set(bookings.map(b => String(b._id)));
  const missingIds = [...new Set(sessions.map(s => s.booking && String(s.booking)).filter(id => id && !bookingIds.has(id)))];
  if (missingIds.length) bookings.push(...await Booking.find({ _id: { $in: missingIds } }).populate('room', 'name').lean());
  if (bookings.length) {
    const sessionIds = new Set(sessions.map(s => String(s._id)));
    const linked = await RoomSession.find({ booking: { $in: bookings.map(b => b._id) } }).lean();
    sessions.push(...linked.filter(s => !sessionIds.has(String(s._id))));
  }
  return buildSalesReport(bookings, sessions, { from, to, source, maxDays });
}

module.exports = { getSalesReport };
