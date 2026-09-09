const { RoomSession } = require('../model/monitoring');
const { businessDate, dateRange } = require('./businessDate');
const { TIME_ZONE } = require('./constants');

const money = (value) => Math.round(Math.max(0, Number(value) || 0) * 100) / 100;

function localTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function rateLabel(session) {
  const rates = (session.hourlyRates || []).map(money);
  if (!rates.length) return `₱${money(session.rate).toLocaleString()}/hr`;
  const unique = [...new Set(rates)];
  return unique.length === 1
    ? `₱${unique[0].toLocaleString()}/hr`
    : unique.map((rate) => `₱${rate.toLocaleString()}`).join(' → ') + '/hr';
}

function sessionRow(session) {
  const amount = money(session.amount);
  const paidAmount = money(session.paidAmount);
  const refundedAmount = Math.min(paidAmount, money(session.refundedAmount));
  const collected = money(paidAmount - refundedAmount);
  const balance = money(Math.max(0, amount - collected));
  const paymentStatus = amount > 0 && collected >= amount ? 'Paid' : collected > 0 ? 'Partial' : 'Unpaid';
  const start = new Date(session.startTime);
  const scheduledEnd = new Date(start.getTime() + Number(session.duration || 0) * 3600000);
  const booking = session.booking && typeof session.booking === 'object' ? session.booking : null;

  return {
    id: String(session._id),
    date: businessDate(start),
    timeIn: localTime(start),
    timeOut: localTime(scheduledEnd),
    closedAt: localTime(session.endedAt),
    startTime: session.startTime,
    endedAt: session.endedAt || null,
    duration: Number(session.duration) || 0,
    facilityName: session.facilityName || 'Other',
    roomType: session.roomName || 'Standard',
    unitNumber: session.roomNumber || '',
    guestName: session.guestName || booking?.guestName || 'Walk-in guest',
    source: booking ? 'booking' : 'walkin',
    reference: booking?.reservationCode || `Walk-in ${String(session._id).slice(-6).toUpperCase()}`,
    rate: money(session.rate),
    rateLabel: rateLabel(session),
    hourlyRates: session.hourlyRates || [],
    corkageFee: money(session.corkageFee),
    amount,
    paidAmount,
    refundedAmount,
    collected,
    balance,
    paymentStatus,
    paymentTiming: session.paymentTiming || (paymentStatus === 'Paid' ? 'Before' : 'After'),
    status: session.status,
  };
}

function buildMonitorReport(sessions, { from, to, maxDays = 366 }) {
  dateRange(from, to, maxDays);
  const rows = sessions.map(sessionRow)
    .filter((row) => row.date >= from && row.date <= to)
    .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  const summary = {
    sessions: rows.length,
    hours: 0,
    charged: 0,
    collected: 0,
    outstanding: 0,
    paid: 0,
    partial: 0,
    unpaid: 0,
  };
  const groups = new Map();

  for (const row of rows) {
    summary.hours += row.duration;
    summary.charged = money(summary.charged + row.amount);
    summary.collected = money(summary.collected + row.collected);
    summary.outstanding = money(summary.outstanding + row.balance);
    summary[row.paymentStatus.toLowerCase()] += 1;
    const key = `${row.facilityName}\u0000${row.roomType}`;
    if (!groups.has(key)) groups.set(key, {
      facilityName: row.facilityName,
      roomType: row.roomType,
      sessions: 0,
      hours: 0,
      charged: 0,
      collected: 0,
      outstanding: 0,
    });
    const group = groups.get(key);
    group.sessions += 1;
    group.hours += row.duration;
    group.charged = money(group.charged + row.amount);
    group.collected = money(group.collected + row.collected);
    group.outstanding = money(group.outstanding + row.balance);
  }
  summary.hours = Math.round(summary.hours * 100) / 100;
  for (const group of groups.values()) group.hours = Math.round(group.hours * 100) / 100;

  return {
    range: { from, to, basis: 'session start service date', timeZone: TIME_ZONE },
    summary,
    byRoomType: [...groups.values()].sort((a, b) => b.collected - a.collected),
    rows,
  };
}

async function getMonitorReport({ from, to, maxDays = 366 }) {
  const { start, end } = dateRange(from, to, maxDays);
  const sessions = await RoomSession.find({ startTime: { $gte: start, $lt: end } })
    .populate('booking', 'reservationCode source guestName')
    .lean();
  return buildMonitorReport(sessions, { from, to, maxDays });
}

module.exports = { buildMonitorReport, getMonitorReport };
