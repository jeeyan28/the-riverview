export function formatHour(h) {
  const hh = h % 24;
  const period = hh >= 12 ? 'PM' : 'AM';
  let display = hh % 12;
  if (display === 0) display = 12;
  return `${display}:00 ${period}`;
}

export function guestPhoneDisplay(guestContact) {
  if (!guestContact) return 'N/A';
  return String(guestContact).includes('@') ? 'N/A' : guestContact;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function receiptHtml(fields) {
  const {
    reservationCode, facility, guestName, guestContact, guestEmail,
    roomName, guestCount, dateLabel, timeLabel, bookedOnLabel,
    amount, downPayment, remaining,
  } = fields;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt - ${esc(reservationCode)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
  :root {
    --teal: #00C9A7;
    --teal-dark: #00947A;
    --ink: #101828;
    --muted: #667085;
    --line: #E4E7EC;
    --amber: #B5760F;
    --bg: #F4F7F7;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: var(--ink);
    background: var(--bg);
    margin: 0;
    padding: 32px 16px;
  }
  .receipt {
    max-width: 520px;
    margin: 0 auto;
    background: #fff;
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid var(--line);
    box-shadow: 0 20px 50px -24px rgba(16, 24, 40, .3);
  }
  .receipt-head {
    background: linear-gradient(135deg, var(--teal), var(--teal-dark));
    padding: 36px 32px 26px;
    color: #fff;
    text-align: center;
  }
  .check-badge {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: rgba(255, 255, 255, .16);
    border: 1.5px solid rgba(255, 255, 255, .55);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    line-height: 1;
    margin: 0 auto 14px;
  }
  .receipt-head h1 { margin: 0 0 4px; font-size: 1.3rem; font-weight: 800; letter-spacing: -.01em; }
  .receipt-head p { margin: 0; font-size: .85rem; opacity: .92; }
  .facility-tag {
    display: inline-block;
    margin-top: 16px;
    padding: 5px 14px;
    background: rgba(255, 255, 255, .16);
    border-radius: 999px;
    font-size: .72rem;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
  }
  .code-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    background: #F0FDFA;
    border-bottom: 1px dashed var(--line);
  }
  .code-label { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); font-weight: 700; }
  .code-value { font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 1rem; font-weight: 700; color: var(--teal-dark); }
  .receipt-body { padding: 26px 32px 8px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 20px; margin-bottom: 24px; }
  .info-item.span-2 { grid-column: span 2; }
  .info-item .label { display: block; font-size: .68rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 700; margin-bottom: 4px; }
  .info-item .value { font-size: .92rem; font-weight: 600; color: var(--ink); word-break: break-word; }
  .cost-card { background: var(--bg); border-radius: 14px; padding: 6px 20px; }
  .cost-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; font-size: .88rem; }
  .cost-row + .cost-row { border-top: 1px solid var(--line); }
  .cost-row .cost-label { color: var(--muted); font-weight: 500; }
  .cost-row .cost-value { font-weight: 700; }
  .cost-row.total .cost-label { color: var(--ink); font-weight: 600; }
  .cost-row.total .cost-value { font-size: 1.05rem; }
  .paid { color: var(--teal-dark); }
  .balance { color: var(--amber); }
  .note { text-align: center; font-size: .78rem; color: var(--muted); margin: 20px 0 0; }
  .actions { text-align: center; padding: 24px 32px 32px; }
  .actions button {
    background: var(--teal);
    color: #06251f;
    border: none;
    padding: 12px 30px;
    border-radius: 10px;
    font-weight: 700;
    font-size: .88rem;
    font-family: inherit;
    cursor: pointer;
    box-shadow: 0 10px 24px -10px rgba(0, 148, 122, .55);
  }
  @media print {
    body { background: #fff; padding: 0; }
    .receipt { box-shadow: none; border: none; border-radius: 0; max-width: 100%; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="receipt">
    <div class="receipt-head">
      <div class="check-badge">&#10003;</div>
      <h1>Booking Confirmed</h1>
      <p>Your reservation has been successfully created.</p>
      <span class="facility-tag">${esc(facility)}</span>
    </div>

    <div class="code-strip">
      <span class="code-label">Reservation Code</span>
      <span class="code-value">${esc(reservationCode)}</span>
    </div>

    <div class="receipt-body">
      <div class="info-grid">
        <div class="info-item"><span class="label">Booked By</span><span class="value">${esc(guestName)}</span></div>
        <div class="info-item"><span class="label">Contact No.</span><span class="value">${esc(guestContact)}</span></div>
        <div class="info-item span-2"><span class="label">Email</span><span class="value">${esc(guestEmail)}</span></div>
        <div class="info-item"><span class="label">Room</span><span class="value">${esc(roomName)}</span></div>
        <div class="info-item"><span class="label">Guests</span><span class="value">${esc(guestCount)}</span></div>
        <div class="info-item"><span class="label">Booking Date</span><span class="value">${esc(dateLabel)}</span></div>
        <div class="info-item"><span class="label">Time</span><span class="value">${esc(timeLabel)}</span></div>
        <div class="info-item span-2"><span class="label">Booked On</span><span class="value">${esc(bookedOnLabel)}</span></div>
      </div>

      <div class="cost-card">
        <div class="cost-row total"><span class="cost-label">Total Amount</span><span class="cost-value">&#8369;${amount.toLocaleString()}</span></div>
        <div class="cost-row"><span class="cost-label">Downpayment Paid</span><span class="cost-value paid">&#8369;${downPayment.toLocaleString()}</span></div>
        <div class="cost-row"><span class="cost-label">Remaining Balance</span><span class="cost-value balance">&#8369;${remaining.toLocaleString()}</span></div>
      </div>

      ${guestEmail ? `<p class="note">A copy of this receipt has been sent to your gmail: ${esc(guestEmail)}</p>` : ''}
    </div>

    <div class="actions">
      <button onclick="window.print()">Download PDF</button>
    </div>
  </div>
</body>
</html>`;
}

export function openBookingReceipt(booking, overrides = {}) {
  if (!booking) return;

  const facility =
    overrides.facility ||
    (booking.room && typeof booking.room === 'object' ? booking.room.name : null) ||
    booking.roomLabel ||
    '—';
  const roomName = overrides.roomName || booking.variantLabel || booking.roomLabel || '—';

  const dateLabel = booking.date
    ? new Date(`${booking.date}T00:00:00`).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';
  const startHour = parseInt(String(booking.timeIn || '0').split(':')[0], 10) || 0;
  const duration = booking.duration || 0;
  const timeLabel = `${formatHour(startHour)} – ${formatHour(startHour + duration)} (${duration} hour${duration === 1 ? '' : 's'})`;
  const bookedOnLabel = booking.createdAt
    ? new Date(booking.createdAt).toLocaleString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

  const downPayment = Number(booking.downPayment || 0);
  const amount = Number(booking.amount || 0);
  const remaining = Math.max(0, amount - downPayment);

  const html = receiptHtml({
    reservationCode: booking.reservationCode || '—',
    facility,
    guestName: booking.guestName || '—',
    guestContact: guestPhoneDisplay(booking.guestContact),
    guestEmail: booking.guestEmail || '—',
    roomName,
    guestCount: String(booking.guestCount || 1),
    dateLabel,
    timeLabel,
    bookedOnLabel,
    amount,
    downPayment,
    remaining,
  });

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}