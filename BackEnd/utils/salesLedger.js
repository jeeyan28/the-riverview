const { businessDate, dateRange, addDays } = require('./businessDate');
const { TIME_ZONE } = require('./constants');

const CLOSED_STATUSES = new Set(['Cancelled', 'Rejected', 'No Show']);
const cents = value => Math.round(Math.max(0, Number(value) || 0) * 100);
const money = value => cents(value) / 100;
const idOf = value => value ? String(value._id || value) : '';

function localTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value));
}

function rateLabel(rates, fallbackRate) {
  const values = (rates || []).map(money);
  if (!values.length && Number(fallbackRate) >= 0) values.push(money(fallbackRate));
  const unique = [...new Set(values)];
  if (!unique.length) return '';
  return unique.length === 1 ? `₱${unique[0].toLocaleString()}/hr` : `${unique.map(rate => `₱${rate.toLocaleString()}`).join(' → ')}/hr`;
}

function bookingPayments(booking) {
  if (booking.paidAmount !== undefined && booking.paidAmount !== null) return money(Math.max(Number(booking.paidAmount) || 0, Number(booking.downPayment) || 0));
  // Older online records stored the verified deposit in downPayment.
  return money(booking.downPayment);
}

function salesRows(bookings, sessions) {
  const linked = new Map();
  const standalone = [];
  for (const session of sessions) {
    const key = idOf(session.booking);
    if (!key) standalone.push(session);
    else linked.set(key, [...(linked.get(key) || []), session]);
  }
  const seen = new Set();
  const rows = [];

  function rowFor(booking, group) {
    const ordered = group
      .filter((candidate) => !booking || candidate.status !== 'Cancelled')
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    const session = ordered[0];
    const warnings = [];
    if (ordered.length > 1) warnings.push('Multiple sessions reference this reservation; the latest session supplies its charges.');
    if (session?.booking && !booking) warnings.push('The linked reservation is missing; verify this session payment.');
    const bookingPaid = booking ? bookingPayments(booking) : 0;
    const sessionPaid = Math.max(0, ...ordered.map(s => money(s.paidAmount)));
    const paidAmount = Math.max(bookingPaid, sessionPaid);
    const rawRefund = Math.max(money(booking?.refundedAmount), ...ordered.map(s => money(s.refundedAmount)), 0);
    if (rawRefund > paidAmount) warnings.push('Recorded refunds exceed recorded payments.');
    const refundedAmount = Math.min(paidAmount, rawRefund);
    const collected = money(paidAmount - refundedAmount);
    const status = booking && CLOSED_STATUSES.has(booking.status) ? booking.status : session?.status || booking?.status || 'Unknown';
    const closed = CLOSED_STATUSES.has(status);
    const amount = closed ? collected : money(session?.amount ?? booking?.amount);
    if (paidAmount > money(session?.amount ?? booking?.amount) && !closed) warnings.push('Recorded payments exceed the charges; verify the balance.');
    if (booking && booking.paidAmount == null && booking.paymentStatus === 'Paid' && bookingPaid === 0 && money(booking.amount) > 0 && !sessionPaid) warnings.push('Legacy paid status has no recorded payment amount; verify collection.');
    if (session?.paymentStatus === 'Paid' && sessionPaid === 0 && money(session.amount) > 0 && !bookingPaid) warnings.push('Paid session has no recorded payment amount; verify collection.');
    const balance = closed ? 0 : money(Math.max(0, cents(amount) - cents(paidAmount)) / 100);
    const date = booking?.date || businessDate(session?.startTime);
    const startTime = session?.startTime || (date && booking?.timeIn ? `${date}T${booking.timeIn}:00+08:00` : null);
    const source = booking?.source === 'walk-in'
      ? 'walkin'
      : booking || session?.booking
        ? 'booking'
        : 'walkin';
    const duration = Number(session?.duration ?? booking?.duration) || 0;
    const hourlyRates = session?.hourlyRates?.length ? session.hourlyRates : booking?.hourlyRates || [];
    const rate = money(session?.rate ?? hourlyRates[0] ?? (duration ? amount / duration : 0));
    const roomType = session?.roomName || booking?.variantLabel || booking?.roomLabel || 'Standard';
    const unitNumber = session?.roomNumber || '';
    const scheduledEnd = startTime && duration ? new Date(new Date(startTime).getTime() + duration * 3600000) : null;
    return {
      id: booking ? `booking:${idOf(booking)}` : `session:${idOf(session)}`,
      bookingId: idOf(booking) || idOf(session?.booking) || null,
      sessionId: idOf(session) || null,
      reference: booking?.reservationCode || `Session ${idOf(session).slice(-6)}`,
      source, channel: booking?.source || 'walk-in', date,
      timeIn: booking?.timeIn || (session?.startTime ? new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(session.startTime)) : ''),
      timeOut: scheduledEnd ? localTime(scheduledEnd) : '',
      startTime, endedAt: session?.endedAt || null,
      guestName: booking?.guestName || session?.guestName || 'Guest',
      facilityName: session?.facilityName || booking?.room?.name || booking?.roomLabel || 'Other',
      roomName: [roomType, unitNumber].filter(Boolean).join(' '), roomType, unitNumber,
      status, bookingStatus: booking?.status || null, cancellationStatus: booking?.cancellationStatus || 'None',
      duration, rate, rateLabel: rateLabel(hourlyRates, rate), hourlyRates,
      amount, paidAmount, refundedAmount, collected, balance,
      paymentTiming: session?.paymentTiming || (balance > 0 ? 'After' : 'Before'),
      paymentStatus: balance === 0 && paidAmount > 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid',
      financialReviewRequired: warnings.length > 0, warnings,
    };
  }

  for (const booking of bookings) {
    const key = idOf(booking);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(rowFor(booking, linked.get(key) || []));
    linked.delete(key);
  }
  for (const group of linked.values()) rows.push(rowFor(null, group));
  for (const session of standalone) rows.push(rowFor(null, [session]));
  return rows;
}

function buildSalesReport(bookings, sessions, { from, to, source = 'all', maxDays = 92 }) {
  const range = dateRange(from, to, maxDays);
  if (!['all', 'booking', 'walkin'].includes(source)) throw Object.assign(new Error('Choose all, booking, or walkin as the source.'), { status: 400 });
  const rows = salesRows(bookings, sessions).filter(row => row.date >= from && row.date <= to && (source === 'all' || row.source === source)).sort((a, b) => `${b.date} ${b.timeIn}`.localeCompare(`${a.date} ${a.timeIn}`));
  const summary = { charged: 0, collected: 0, outstanding: 0, refunded: 0, transactions: rows.length, reservations: 0, walkins: 0, bookedHours: 0, averageDuration: 0 };
  const daily = Array.from({ length: range.days }, (_, i) => ({ date: addDays(from, i), charged: 0, collected: 0, outstanding: 0, transactions: 0 }));
  const dayMap = new Map(daily.map(d => [d.date, d]));
  const facilities = new Map();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  let operatingCount = 0;
  for (const row of rows) {
    const day = dayMap.get(row.date);
    const facilityKey = `${row.facilityName}\u0000${row.roomType}`;
    if (!facilities.has(facilityKey)) facilities.set(facilityKey, { name: `${row.facilityName} · ${row.roomType}`, facilityName: row.facilityName, roomType: row.roomType, charged: 0, collected: 0, outstanding: 0, sessions: 0, transactions: 0, bookedHours: 0, hours: 0 });
    const facility = facilities.get(facilityKey);
    for (const target of [summary, day, facility]) {
      target.charged = money(target.charged + row.amount);
      target.collected = money(target.collected + row.collected);
    }
    summary.outstanding = money(summary.outstanding + row.balance);
    summary.refunded = money(summary.refunded + row.refundedAmount);
    day.outstanding = money(day.outstanding + row.balance);
    facility.outstanding = money(facility.outstanding + row.balance);
    day.transactions++;
    summary[row.source === 'booking' ? 'reservations' : 'walkins']++;
    if (!CLOSED_STATUSES.has(row.status)) {
      facility.transactions++;
      facility.sessions++;
      facility.bookedHours += row.duration;
      facility.hours += row.duration;
      summary.bookedHours += row.duration;
      operatingCount++;
      const hour = Number(row.timeIn.split(':')[0]);
      if (hourly[hour]) hourly[hour].count++;
    }
  }
  summary.bookedHours = Math.round(summary.bookedHours * 100) / 100;
  for (const facility of facilities.values()) {
    facility.bookedHours = Math.round(facility.bookedHours * 100) / 100;
    facility.hours = facility.bookedHours;
  }
  summary.averageDuration = operatingCount ? Math.round(summary.bookedHours / operatingCount * 100) / 100 : 0;
  const reviewCount = rows.filter(r => r.financialReviewRequired).length;
  return { range: { from, to, source, basis: 'service date', timeZone: TIME_ZONE }, summary, daily, byFacility: [...facilities.values()].sort((a, b) => b.collected - a.collected), hourly, rows, warnings: reviewCount ? [`${reviewCount} transaction(s) need payment review. Unverified legacy payments are excluded from collected totals.`] : [] };
}

module.exports = { salesRows, buildSalesReport, bookingPayments };
