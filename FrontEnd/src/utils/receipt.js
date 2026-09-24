import { cancellationAmounts } from './cancellationPolicy.js';
import { getEmbeddedBrowserInfo } from './embeddedBrowser.js';

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

export function getBookingReceiptData(booking, overrides = {}) {
  if (!booking) return null;

  const facility = overrides.facility || (booking.room && typeof booking.room === 'object' ? booking.room.name : null) || booking.roomLabel || '—';
  const roomName = overrides.roomName || booking.variantLabel || booking.roomLabel || '—';
  const dateLabel = booking.date
    ? new Date(`${booking.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';
  const startHour = parseInt(String(booking.timeIn || '0').split(':')[0], 10) || 0;
  const duration = Number(booking.duration) || 0;
  const timeLabel = `${formatHour(startHour)} – ${formatHour(startHour + duration)} (${duration} hour${duration === 1 ? '' : 's'})`;
  const bookedOnLabel = booking.createdAt
    ? new Date(booking.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : '—';

  const status = booking.status || 'Confirmed';
  const closed = ['Cancelled', 'Rejected', 'No Show'].includes(status);
  const payment = cancellationAmounts(booking);
  const downPayment = Math.max(0, Number(booking.downPayment) || 0);
  const amount = Math.max(0, Number(booking.amount) || 0);
  const paidAtVenue = Math.max(0, payment.paid - downPayment);
  const remaining = closed ? 0 : Math.max(0, amount - payment.retained);
  const refundException = Boolean(booking.cancellationRefundException);
  const showRefundToArrange = Boolean(booking.cancellationSource || booking.cancellationRequestedAt);

  const costRows = [
    { label: 'Total amount', value: amount },
    { label: 'Paid online', value: downPayment },
    ...(paidAtVenue > 0 ? [{ label: 'Paid later', value: paidAtVenue }] : []),
    ...(closed ? [
      { label: 'Refunded', value: payment.refunded },
      { label: 'Payment retained', value: payment.retained },
      ...(status === 'Cancelled' && showRefundToArrange && payment.refundRemaining > 0 ? [{ label: 'Refund to arrange', value: payment.refundRemaining }] : []),
    ] : [{ label: 'Remaining balance', value: remaining }]),
  ];
  const notes = [];
  if (status === 'Cancelled' && payment.customerCancelled) {
    notes.push(refundException ? 'A refund exception was approved.' : 'The first-hour charge is non-refundable for a customer cancellation.');
    if (payment.refundRemaining > 0) notes.push('Contact admin to arrange the remaining manual refund.');
  } else if (status === 'Cancelled' && showRefundToArrange && payment.refundRemaining > 0) {
    notes.push('Contact admin to arrange the manual refund.');
  }
  if (booking.guestEmail) notes.push(`A booking confirmation was sent to ${booking.guestEmail}.`);

  return {
    reservationCode: booking.reservationCode || '—',
    title: closed ? `Reservation ${status}` : 'Booking Confirmed',
    subtitle: closed ? 'Payment record for this reservation.' : 'Your reservation has been successfully created.',
    facility,
    info: [
      [{ label: 'Booked by', value: booking.guestName || '—' }, { label: 'Contact no.', value: guestPhoneDisplay(booking.guestContact) }],
      [{ label: 'Email', value: booking.guestEmail || '—' }],
      [{ label: 'Room', value: roomName }, { label: 'Guests', value: String(booking.guestCount || 1) }],
      [{ label: 'Booking date', value: dateLabel }, { label: 'Time', value: timeLabel }],
      [{ label: 'Booked on', value: bookedOnLabel }],
    ],
    costRows,
    notes,
  };
}

function wrappedLines(ctx, value, maxWidth) {
  const words = String(value ?? '—').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (ctx.measureText(line + character).width > maxWidth && line) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['—'];
}

function drawReceiptImage(data) {
  const scale = 2;
  const width = 560;
  const scratch = document.createElement('canvas');
  scratch.width = width * scale;
  scratch.height = 1800 * scale;
  const ctx = scratch.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create a receipt image.');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, 1800);

  const header = ctx.createLinearGradient(0, 0, width, 170);
  header.addColorStop(0, '#0b7067');
  header.addColorStop(1, '#00a990');
  ctx.fillStyle = header;
  ctx.fillRect(0, 0, width, 174);
  ctx.fillStyle = '#dcfff7';
  ctx.font = '700 13px Arial, sans-serif';
  ctx.fillText('THE RIVERVIEW', 30, 37);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 27px Arial, sans-serif';
  ctx.fillText(data.title, 30, 89, width - 60);
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText(data.subtitle, 30, 116, width - 60);
  ctx.font = '700 13px Arial, sans-serif';
  ctx.fillText(data.facility, 30, 150, width - 60);

  ctx.fillStyle = '#e9f8f5';
  ctx.fillRect(0, 174, width, 69);
  ctx.fillStyle = '#496963';
  ctx.font = '700 11px Arial, sans-serif';
  ctx.fillText('RESERVATION CODE', 30, 200);
  ctx.fillStyle = '#075f55';
  ctx.font = '700 18px Arial, sans-serif';
  ctx.fillText(data.reservationCode, 30, 226, width - 60);

  function drawInfo(item, x, top, itemWidth) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#667085';
    ctx.font = '700 10px Arial, sans-serif';
    ctx.fillText(item.label.toUpperCase(), x, top);
    ctx.fillStyle = '#172b35';
    ctx.font = '600 15px Arial, sans-serif';
    const lines = wrappedLines(ctx, item.value, itemWidth);
    lines.forEach((line, index) => ctx.fillText(line, x, top + 25 + index * 20));
    return top + 25 + lines.length * 20;
  }

  let y = 281;
  for (const pair of data.info) {
    const next = pair.length === 1
      ? drawInfo(pair[0], 30, y, 500)
      : Math.max(drawInfo(pair[0], 30, y, 236), drawInfo(pair[1], 294, y, 236));
    y = next + 10;
  }

  y += 8;
  const costHeight = 20 + data.costRows.length * 39;
  ctx.fillStyle = '#f1f6f5';
  ctx.fillRect(20, y, width - 40, costHeight);
  data.costRows.forEach((row, index) => {
    const lineY = y + 36 + index * 39;
    ctx.fillStyle = '#52626a';
    ctx.font = '14px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(row.label, 36, lineY);
    ctx.fillStyle = row.label === 'Remaining balance' || row.label === 'Refund to arrange' ? '#a15f08' : '#0b7067';
    ctx.font = '700 16px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`₱${Number(row.value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`, width - 36, lineY);
  });
  ctx.textAlign = 'left';
  y += costHeight + 28;

  ctx.fillStyle = '#52626a';
  ctx.font = '13px Arial, sans-serif';
  for (const note of data.notes) {
    for (const line of wrappedLines(ctx, note, width - 60)) {
      ctx.fillText(line, 30, y);
      y += 19;
    }
    y += 8;
  }
  ctx.fillStyle = '#87939a';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('Keep this receipt for your records.', 30, y + 12);
  y += 40;

  const image = document.createElement('canvas');
  image.width = scratch.width;
  image.height = Math.ceil(y * scale);
  image.getContext('2d').drawImage(scratch, 0, 0, image.width, image.height, 0, 0, image.width, image.height);
  return { canvas: image, imageUrl: image.toDataURL('image/png') };
}

function saveReceiptFile(url, filename) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// Embed the exact receipt canvas as one JPEG page, so PNG and PDF keep the same layout.
function receiptPdf(canvas) {
  const jpeg = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
  const binary = atob(jpeg);
  const imageBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const pageWidth = 595.28;
  const pageHeight = Number((pageWidth * canvas.height / canvas.width).toFixed(2));
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [0];
  let length = 0;
  const append = (bytes) => { chunks.push(bytes); length += bytes.length; };
  const write = (value) => append(encoder.encode(value));
  const object = (number, value) => { offsets[number] = length; write(`${number} 0 obj\n${value}\nendobj\n`); };

  write('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Receipt 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  write(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`);
  append(imageBytes);
  write('\nendstream\nendobj\n');
  const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Receipt Do\nQ\n`;
  object(5, `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`);
  const startXref = length;
  write('xref\n0 6\n0000000000 65535 f \n');
  for (let number = 1; number <= 5; number++) write(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function showReceiptOptions(imageUrl, canvas, filenameBase, browserName) {
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'receipt-preview-overlay';
  const panel = document.createElement('div');
  panel.className = 'receipt-preview-dialog';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Download your reservation receipt');

  const heading = document.createElement('h2');
  heading.textContent = 'Download your receipt';
  const instruction = document.createElement('p');
  instruction.textContent = browserName
    ? `Choose an image or PDF. In ${browserName}, you can also press and hold the preview to save the image.`
    : 'Choose an image or PDF. Both formats show the same receipt.';
  const image = document.createElement('img');
  image.src = imageUrl;
  image.alt = 'Reservation receipt image';
  const actions = document.createElement('div');
  actions.className = 'receipt-preview-actions';
  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Download image';
  saveButton.addEventListener('click', () => saveReceiptFile(imageUrl, `${filenameBase}.png`));
  const pdfButton = document.createElement('button');
  pdfButton.type = 'button';
  pdfButton.textContent = 'Download PDF';
  pdfButton.addEventListener('click', () => {
    const url = URL.createObjectURL(receiptPdf(canvas));
    saveReceiptFile(url, `${filenameBase}.pdf`);
    const releaseTimer = setTimeout(() => URL.revokeObjectURL(url), 30000);
    releaseTimer?.unref?.();
  });
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Back to booking';
  closeButton.addEventListener('click', close);
  actions.append(saveButton, pdfButton, closeButton);
  panel.append(heading, instruction, image, actions);
  overlay.appendChild(panel);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);
  closeButton.focus();

  function close() {
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    previousFocus?.focus?.();
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') close();
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === saveButton) {
      event.preventDefault();
      closeButton.focus();
    } else if (!event.shiftKey && document.activeElement === closeButton) {
      event.preventDefault();
      saveButton.focus();
    }
  }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKeyDown);
}

export function openBookingReceipt(booking, overrides = {}) {
  const data = getBookingReceiptData(booking, overrides);
  if (!data) return;
  const { canvas, imageUrl } = drawReceiptImage(data);
  const safeCode = String(data.reservationCode).replace(/[^A-Za-z0-9_-]/g, '-');
  const filenameBase = `Riverview-Receipt-${safeCode}`;
  const embeddedBrowser = getEmbeddedBrowserInfo();
  showReceiptOptions(imageUrl, canvas, filenameBase, embeddedBrowser?.name);
}
