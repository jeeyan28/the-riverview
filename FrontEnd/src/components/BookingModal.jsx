import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';
import {
  dateKey,
  getRoomCapacity,
  fetchReservedHours,
  clearReservedHours,
  loadMonthAvailability,
  clearMonthAvailability,
  getFreeSlotCount,
  isHolidayDate,
  isOperatingDay,
  computeDownPayment,
  getFacilityAvailability,
} from '../utils/rooms';
import { API_BASE_URL } from '../services/api';

const MAX_DURATION = 5;


const PAYMONGO_API_BASE = 'https://api.paymongo.com/v1';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];


function formatHour(h) {
  const hh = h % 24;
  const period = hh >= 12 ? 'PM' : 'AM';
  let display = hh % 12;
  if (display === 0) display = 12;
  return `${display}:00 ${period}`;
}

function maxDurationFrom(h, closeHour, reserved) {
  let max = 0;
  for (let t = h; t < closeHour; t++) {
    if (reserved.includes(t)) break;
    max++;
  }
  return max;
}

function priceOptionsFor(room) {
  return room.variants && room.variants.length
    ? room.variants
    : [{
        label: 'Standard',
        price: room.price || 0,
        pax: '',
        image: room.image || '',
        description: room.description || '',
        features: room.features || [],
      }];
}

const STEPS = [
  { key: 'price', label: 'Room' },
  { key: 'calendar', label: 'Date' },
  { key: 'slots', label: 'Time' },
  { key: 'details', label: 'Details' },
  { key: 'review', label: 'Review' },
  { key: 'payment', label: 'Payment' },
];
const STEP_INDEX = { price: 1, calendar: 2, slots: 3, details: 4, review: 5, payment: 6 };

// PAYMENT_METHODS — the in-modal method picker on the Payment step. Card
// reveals an inline form (tokenized client-side); the wallets attach
// straight away and open a popup for authorization.
const PAYMENT_METHODS = [
  { key: 'gcash', label: 'GCash', icon: 'fa-solid fa-wallet' },
  { key: 'paymaya', label: 'Maya', icon: 'fa-solid fa-money-bill-wave' },
  { key: 'qrph', label: 'QR Ph', icon: 'fa-solid fa-qrcode' },
  { key: 'card', label: 'Credit / Debit Card', icon: 'fa-solid fa-credit-card' },
];

function BookingStepper({ step }) {
  const activeIndex = STEP_INDEX[step] || 1;
  return (
    <div className="bk-stepper">
      {STEPS.map((s, i) => {
        const num = i + 1;
        const state = num < activeIndex ? 'done' : num === activeIndex ? 'active' : 'upcoming';
        return (
          <div className={`bk-step-dot bk-step-dot--${state}`} key={s.key}>
            <span className="bk-step-dot-num">{state === 'done' ? <i className="fa-solid fa-check"></i> : num}</span>
            <span className="bk-step-dot-label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}


function BookingSuccess({ booking, room, selectedVariant, onDone }) {
  if (!booking) return null;

  const facility = room?.name || booking.roomLabel || '—';
  const roomName = selectedVariant?.label || booking.variantLabel || booking.roomLabel || '—';

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

  const downPayment = Number(booking.downPayment || 0);
  const remaining = Math.max(0, Number(booking.amount || 0) - downPayment);


  function handleOpenReceipt() {
    const rows = [
      ['Reservation Code', booking.reservationCode || '—'],
      ['Room', roomName],
      ['Facility', facility],
      ['Date', dateLabel],
      ['Time', timeLabel],
      ['Guests', String(booking.guestCount || 1)],
    ];

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt - ${booking.reservationCode || ''}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #f2f2f2; margin: 0; padding: 24px; }
  .receipt { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .check { width: 48px; height: 48px; border-radius: 50%; background: #00C9A7; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 14px; }
  h1 { text-align: center; font-size: 1.15rem; margin: 0 0 4px; }
  .sub { text-align: center; font-size: .85rem; color: #666; margin: 0 0 22px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  td { padding: 8px 0; font-size: .88rem; border-bottom: 1px solid #eee; }
  td.label { color: #888; }
  td.value { text-align: right; font-weight: 600; }
  .code { font-family: 'Courier New', monospace; color: #00947a; }
  .cost { border-top: 2px solid #eee; padding-top: 14px; }
  .paid { color: #00947a; font-weight: 700; }
  .balance { color: #b5760f; font-weight: 700; }
  .note { text-align: center; font-size: .78rem; color: #888; margin-top: 18px; }
  .actions { text-align: center; margin-top: 24px; }
  button { background: #00C9A7; color: #06251f; border: none; padding: 10px 22px; border-radius: 8px; font-weight: 700; font-size: .85rem; cursor: pointer; }
  @media print { .actions { display: none; } body { background: #fff; padding: 0; } .receipt { box-shadow: none; } }
</style>
</head>
<body>
  <div class="receipt">
    <div class="check">&#10003;</div>
    <h1>Booking Confirmed!</h1>
    <p class="sub">Your reservation has been successfully created.</p>
    <table>
      ${rows.map(([label, value], i) => `<tr><td class="label">${label}</td><td class="value${i === 0 ? ' code' : ''}">${value}</td></tr>`).join('')}
    </table>
    <table class="cost">
      <tr><td class="label">Downpayment Paid</td><td class="value paid">&#8369;${downPayment.toLocaleString()}</td></tr>
      <tr><td class="label">Remaining Balance</td><td class="value balance">&#8369;${remaining.toLocaleString()}</td></tr>
    </table>
    ${booking.guestEmail ? `<p class="note">A copy of this receipt has been sent to ${booking.guestEmail}</p>` : ''}
    <div class="actions">
      <button onclick="window.print()">Download PDF</button>
    </div>
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  return (
    <>
      <div className="bk-confirm-icon"><i className="fa-solid fa-check"></i></div>
      <h3>Booking Confirmed!</h3>
      <p>Your reservation has been successfully created.</p>

      <div className="bk-success-card">
        <div className="bk-success-grid">
          <div className="bk-success-item">
            <span className="bk-summary-label">Reservation Code</span>
            <span className="bk-success-code">{booking.reservationCode || '—'}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Room</span>
            <span className="bk-summary-value">{roomName}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Facility</span>
            <span className="bk-summary-value">{facility}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Date</span>
            <span className="bk-summary-value">{dateLabel}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Time</span>
            <span className="bk-summary-value">{timeLabel}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Guests</span>
            <span className="bk-summary-value">{booking.guestCount || 1}</span>
          </div>
        </div>

        <div className="bk-success-cost">
          <div className="bk-success-item">
            <span className="bk-summary-label">Downpayment Paid</span>
            <span className="bk-success-paid">₱{downPayment.toLocaleString()}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Remaining Balance</span>
            <span className="bk-success-balance">₱{remaining.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="bk-detail-actions">
        <button className="bk-back-btn" onClick={handleOpenReceipt}>
          <i className="fa-solid fa-download"></i> Download Receipt
        </button>
        <button className="bk-confirm bk-continue" onClick={onDone}>
          Back to Home
        </button>
      </div>

      {booking.guestEmail && (
        <p className="bk-success-note">
          <i className="fa-solid fa-circle-check"></i> A copy of this receipt has been sent to {booking.guestEmail}
        </p>
      )}
    </>
  );
}

function BookingModal({ room, returnInfo, onClose, openHour, closeHour, settings }) {
  const open = !!room || !!returnInfo;
  const { user: authUser, revalidate, logout } = useAuth();

  const [step, setStep] = useState('price'); // 'price' | 'calendar' | 'slots' | 'details' | 'payment' | 'paymongoReturn'
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null); // { y, m, d }
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(1);

  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestNote, setGuestNote] = useState('');
  const [paxError, setPaxError] = useState('');

  const [monthBookings, setMonthBookings] = useState({});
  const [reserved, setReserved] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [facilityStatus, setFacilityStatus] = useState(null); // 'Available' | 'Fully Booked' | null while loading

  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  // Embedded PayMongo flow — booking + Payment Intent are created once, the
  // moment the Payment step is reached (see the effect below), then reused
  // across method picks/retries. `publicKey` is fetched once for client-side
  // card tokenization (raw card data never touches our server).
  const [paymongoPublicKey, setPaymongoPublicKey] = useState('');
  const [pmIntent, setPmIntent] = useState(null); // { paymentIntentId, clientKey, amount } — no bookingId: the Booking doesn't exist until payment succeeds
  const [selectedMethod, setSelectedMethod] = useState(null); // 'card' | 'gcash' | 'paymaya' | 'qrph'
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const pollRef = useRef(null);

  // pmReturn — the paymongoReturn step's own resolution state.
  // phase: 'loading' | 'cancelled' | 'needLogin' | 'confirmed' | 'pending'
  const [pmReturn, setPmReturn] = useState({ phase: 'loading', booking: null });

  // Reset the whole modal state each time a NEW room is opened via
  // "Select Room" — mirrors openBooking()'s state reset in the original.
  useEffect(() => {
    if (!room) return;

    setStep('price');
    setViewDate(new Date());
    setSelectedDate(null);
    setSelectedVariant(null);
    setSelectedHour(null);
    setSelectedDuration(1);
    setGuestNote('');
    setGuestCount(1);
    setPaxError('');
    setPmIntent(null);
    setSelectedMethod(null);
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setPayError('');
    stopPolling();

    const user = authUser;
    setGuestName(user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '');
    setGuestContact(user ? user.phone || user.email || '' : '');
  }, [room]);

  // Facility availability badge (Room Selection step) — same rule as
  // Home.jsx's refreshLiveRoomStatuses: an "Available" room only flips to
  // "Fully Booked" if every remaining operating hour today is reserved.
  // Non-"Available" admin statuses collapse to "Fully Booked" (the binary
  // summary this step shows for now — see FEATURE_REQUESTS.md).
  useEffect(() => {
    if (!room) {
      setFacilityStatus(null);
      return;
    }
    if (room.status !== 'Available') {
      setFacilityStatus('Fully Booked');
      return;
    }
    let cancelled = false;
    setFacilityStatus(null);

    async function loadFacilityStatus() {
      const now = new Date();
      const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
      const reservedToday = await fetchReservedHours(room._id, todayStr);
      if (!cancelled) setFacilityStatus(getFacilityAvailability(reservedToday, openHour, closeHour));
    }

    loadFacilityStatus();
    return () => {
      cancelled = true;
    };
  }, [room, openHour, closeHour]);

  // Drive the paymongoReturn step off `returnInfo` — mirrors
  // handlePaymongoReturn() in the original, run once when Home.jsx detects
  // ?paymongo=...&paymentIntentId=... on load.
  useEffect(() => {
    if (!returnInfo) return;
    let cancelled = false;
    setStep('paymongoReturn');
    setPmReturn({ phase: 'loading', booking: null });

    async function resolve() {
      if (returnInfo.result === 'cancel') {
        // Nothing to release server-side: no Booking/slot is ever held
        // before payment succeeds, so there's no cancel call to make here.
        if (!cancelled) setPmReturn({ phase: 'cancelled', booking: null });
        return;
      }

      // result === 'success' — poll briefly in case the webhook hasn't landed yet.
      const user = await revalidate();
      if (cancelled) return;
      if (!user) {
        setPmReturn({ phase: 'needLogin', booking: null });
        return;
      }

      const maxAttempts = 6;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (cancelled) return;
        try {
          const res = await fetch(
            `${API_BASE_URL}/api/payments/paymongo/status/${encodeURIComponent(returnInfo.paymentIntentId)}`,
            { credentials: 'include' }
          );
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.paymentStatus === 'Paid' && data.bookingId) {
            const booking = await fetchPaidBooking(data.bookingId);
            if (!cancelled) setPmReturn({ phase: 'confirmed', booking });
            return;
          }
        } catch (err) {
          console.error(err);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setPmReturn({ phase: 'pending', booking: null });
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [returnInfo]);

  // Body scroll lock while open — mirrors document.body.style.overflow.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Fetch this room's bookings for the visible calendar month.
  useEffect(() => {
    if (step !== 'calendar' || !room) return;
    let cancelled = false;
    loadMonthAvailability(room._id, viewDate.getFullYear(), viewDate.getMonth() + 1).then((data) => {
      if (!cancelled) setMonthBookings(data);
    });
    return () => {
      cancelled = true;
    };
  }, [step, room, viewDate]);

  // Fetch reserved hours for the selected date once we reach the slots step.
  useEffect(() => {
    if (step !== 'slots' || !room || !selectedDate) return;
    let cancelled = false;
    const key = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);
    fetchReservedHours(room._id, key).then((hours) => {
      if (!cancelled) setReserved(hours);
    });
    return () => {
      cancelled = true;
    };
  }, [step, room, selectedDate]);

  // Keep the Pax input's inline error in sync with the room's capacity —
  // mirrors validatePaxInput(), called wherever the original called it.
  useEffect(() => {
    if (!room) return;
    const cap = getRoomCapacity(room);
    let message = '';
    if (!Number.isFinite(guestCount) || guestCount < 1) {
      message = 'Please enter at least 1 guest.';
    } else if (cap && guestCount > cap) {
      message = `This room accommodates up to ${cap} guest(s). Please reduce your pax or choose a bigger room.`;
    }
    setPaxError(message);
  }, [room, guestCount]);

  // Entering the Payment step: fetch the publishable key (for client-side
  // card tokenization) and create the booking + Payment Intent once, up
  // front, so every method the guest tries just attaches to the same
  // intent instead of creating a new booking per attempt.
  useEffect(() => {
    if (step !== 'payment' || pmIntent || !room || !selectedVariant || !selectedDate || selectedHour === null) return;
    let cancelled = false;

    async function init() {
      setPayError('');
      setPayLoading(true);
      try {
        if (!paymongoPublicKey) {
          const cfgRes = await fetch(`${API_BASE_URL}/api/payments/paymongo/config`, { credentials: 'include' });
          const cfg = await cfgRes.json().catch(() => ({}));
          if (cfgRes.ok && cfg.publicKey && !cancelled) setPaymongoPublicKey(cfg.publicKey);
        }

        const { y, m, d } = selectedDate;
        const dateStr = dateKey(y, m, d);
        const timeStr = `${String(selectedHour).padStart(2, '0')}:00`;

        const res = await fetch(`${API_BASE_URL}/api/payments/paymongo/intent`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guestName: guestName.trim(),
            guestContact: guestContact.trim(),
            guestCount: guestCount || 1,
            specialRequests: guestNote.trim(),
            roomId: room._id,
            variantLabel: selectedVariant.label,
            date: dateStr,
            timeIn: timeStr,
            duration: selectedDuration,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) {
            await logout();
            alert('Your session has expired. Please log in again to complete your booking.');
            window.location.href = '/login';
            return;
          }
          throw new Error(data.message || 'Could not start online payment.');
        }

        // Release the local cache for this room/date/month so, if the guest
        // backs out instead of finishing payment, the slot still shows
        // correctly next time it's checked.
        clearReservedHours(room._id, dateStr);
        clearMonthAvailability(room._id, y, m + 1);

        if (!cancelled) setPmIntent({ paymentIntentId: data.paymentIntentId, clientKey: data.clientKey, amount: data.amount });
      } catch (err) {
        console.error(err);
        if (!cancelled) setPayError(err.message || 'Something went wrong starting checkout. Please try again.');
      } finally {
        if (!cancelled) setPayLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [step, room, selectedVariant, selectedDate, selectedHour]);

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleChooseOption(opt) {
    setSelectedVariant(opt);
  }

  function handleContinueFromPrice() {
    if (!selectedVariant) return;
    setViewDate(new Date());
    setStep('calendar');
  }

  function handleSelectDate(y, m, d) {
    setSelectedDate({ y, m, d });
    setSelectedHour(null);
    setSelectedDuration(1);
    setStep('slots');
  }

  function handlePaxStep(delta) {
    const cap = room ? getRoomCapacity(room) : null;
    setGuestCount((v) => {
      let next = (Number.isFinite(v) ? v : 1) + delta;
      next = Math.max(1, next);
      if (cap) next = Math.min(next, cap);
      return next;
    });
  }

  function handleSelectDuration(dur) {
    setSelectedDuration(dur);
    setSelectedHour(null);
  }

  function handleSelectHour(h) {
    setSelectedHour(h);
  }

  function handleContinueFromSlots() {
    if (selectedHour === null) return;
    setStep('details');
  }

  // confirmBooking — STEP 1 of confirming: validates guest details + pax
  // capacity, re-verifies the session with the server (not just cached
  // storage — see original's comment on why), then moves to the Review
  // step (details are re-validated here, before anything is shown back to
  // the guest for confirmation; Review's own Continue just advances to
  // payment, no re-validation needed). Migrated 1:1, including the plain
  // alert() for the name/contact check (kept as-is rather than switched to
  // a toast, to match the original's exact UX for this one validation).
  async function confirmBooking() {
    const trimmedName = guestName.trim();
    const trimmedContact = guestContact.trim();

    if (!trimmedName || !trimmedContact) {
      alert('Please enter your name and a phone number or email so we can confirm your booking.');
      return;
    }
    if (paxError) return; // inline error is already shown next to the Pax field

    setConfirming(true);
    const user = await revalidate();
    setConfirming(false);

    if (!user) {
      alert('Your session has expired. Please log in again to complete your booking.');
      window.location.href = '/login';
      return;
    }

    // Note: the original computed and stored a total `amount` here
    // (price * duration) but never actually read it again — this step
    // only ever displays the down payment (first-hour rate), computed
    // separately below from selectedVariant.price. Not carried over here
    // since it would be genuinely dead state.
    setStep('review');
  }

  // proceedToPayment — Review step's Continue. Everything (name/contact,
  // pax, session) was already validated moving into Review via
  // confirmBooking() above, so this just advances the step.
  function proceedToPayment() {
    setStep('payment');
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  // Stop any in-flight poll on unmount so it doesn't keep hitting the API
  // (or touching state) after the modal is gone.
  useEffect(() => stopPolling, []);

  async function fetchPaidBooking(bookingId) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/bookings/${encodeURIComponent(bookingId)}`, { credentials: 'include' });
      if (res.ok) return await res.json();
    } catch (err) {
      console.error(err);
    }
    return null;
  }

  // POLL_INTERVAL_MS / POLL_MAX_ATTEMPTS — shared tuning for
  // pollPaymentStatus below (~3 minutes total at 2s intervals).
  const POLL_INTERVAL_MS = 2000;
  const POLL_MAX_ATTEMPTS = 90;

  // pollPaymentStatus — shared by openPopupAndPoll (3D Secure/e-wallet
  // popup) and pollStatusOnly (no popup, e.g. some async payment rails).
  // Polls GET /status until paid, the optional popup is closed without
  // paying, or POLL_MAX_ATTEMPTS is reached.
  function pollPaymentStatus(paymentIntentId, popup) {
    setStep('paymongoReturn');
    setPmReturn({ phase: 'loading', booking: null });

    let attempts = 0;
    stopPolling();
    pollRef.current = setInterval(async () => {
      attempts += 1;
      let paid = false;
      let paidBookingId = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/payments/paymongo/status/${encodeURIComponent(paymentIntentId)}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        paid = res.ok && data.paymentStatus === 'Paid';
        paidBookingId = data.bookingId || null;
      } catch (err) {
        console.error(err);
      }

      if (paid) {
        stopPolling();
        if (popup && !popup.closed) popup.close();
        const booking = paidBookingId ? await fetchPaidBooking(paidBookingId) : null;
        setPmReturn({ phase: 'confirmed', booking });
        return;
      }

      if (popup && popup.closed) {
        stopPolling();
        // Closed without paying — go back to the method picker so the guest
        // can try again instead of ending the whole booking flow.
        setStep('payment');
        setPayError('Payment was not completed. Please try again.');
        return;
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setPmReturn({ phase: 'pending', booking: null });
      }
    }, POLL_INTERVAL_MS);
  }

  // openPopupAndPoll — the popup carries the customer through 3D Secure or
  // an e-wallet's own authorization page; pollPaymentStatus watches for the
  // outcome (source of truth either way — the popup itself, or a delayed
  // webhook, could resolve it first). Stops as soon as it's paid, or once
  // the popup is closed without a paid result.
  function openPopupAndPoll(redirectUrl, paymentIntentId) {
    const popup = window.open(redirectUrl, 'paymongo_pay', 'width=480,height=760');
    if (!popup) {
      // Popup blocked — fall back to a full-page redirect, same as the
      // original hosted-checkout flow did.
      window.location.href = redirectUrl;
      return;
    }
    pollPaymentStatus(paymentIntentId, popup);
  }

  // pollStatusOnly — for the rare "processing" result (no redirect/popup
  // involved, e.g. some async payment rails): just wait for the intent to
  // resolve, reusing the same paymongoReturn UI as the popup flow.
  function pollStatusOnly(paymentIntentId) {
    pollPaymentStatus(paymentIntentId, null);
  }

  // attachAndHandle — sends a Payment Method (card id or wallet type) to the
  // booking's Payment Intent and reacts to the result.
  async function attachAndHandle(body) {
    setPayError('');
    setPayLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/payments/paymongo/intent/${encodeURIComponent(pmIntent.paymentIntentId)}/attach`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok && res.status !== 402 && res.status !== 409) {
        if (res.status === 401) {
          await logout();
          alert('Your session has expired. Please log in again to complete your booking.');
          window.location.href = '/login';
          return;
        }
        throw new Error(data.message || 'Payment could not be processed. Please try again.');
      }

      if (data.status === 'succeeded') {
        const booking = await fetchPaidBooking(data.bookingId);
        setStep('paymongoReturn');
        setPmReturn({ phase: 'confirmed', booking });
        return;
      }
      if (data.status === 'awaiting_next_action' && data.redirectUrl) {
        openPopupAndPoll(data.redirectUrl, pmIntent.paymentIntentId);
        return;
      }
      if (data.status === 'processing') {
        pollStatusOnly(pmIntent.paymentIntentId);
        return;
      }
      if (data.status === 'paid_slot_unavailable') {
        // Rare: payment succeeded but another confirmed reservation took the
        // slot in the meantime (Availability Safety Check). No booking was
        // created — surface this clearly rather than a generic decline.
        setPayError(data.message || 'Your payment succeeded, but this slot was just taken. Please contact support.');
        return;
      }
      // status === 'failed' (card declined, etc.) — data.message already set
      setPayError(data.message || 'That payment method was declined. Please try another.');
    } catch (err) {
      console.error(err);
      setPayError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setPayLoading(false);
    }
  }

  // handleSelectMethod — tile click only selects a method now (matches the
  // reference UI's select-then-"Pay Now" flow). The actual charge is fired
  // by the shared footer button: handleConfirmWalletPay for wallets, or the
  // card form's own submit (routed to the same button via form=).
  function handleSelectMethod(key) {
    if (!pmIntent || payLoading) return;
    setSelectedMethod(key);
    setPayError('');
  }

  // handleConfirmWalletPay — GCash/Maya/QRPh carry no sensitive data, so the
  // Payment Method is created server-side; Pay Now just tells the backend
  // which type to use.
  function handleConfirmWalletPay() {
    if (!pmIntent || payLoading || !selectedMethod || selectedMethod === 'card') return;
    attachAndHandle({ paymentMethodType: selectedMethod });
  }

  // handlePayCard — tokenizes the card directly against PayMongo's API from
  // the browser, using the publishable key, so the card number/CVC never
  // touch our server — only the resulting Payment Method id does.
  async function handlePayCard(e) {
    e.preventDefault();
    if (!pmIntent || payLoading) return;

    const digits = cardNumber.replace(/\s+/g, '');
    const [mm, yyRaw] = cardExpiry.split('/').map((s) => (s || '').trim());
    const yy = yyRaw && yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
    if (!digits || digits.length < 12 || !mm || !yy || !cardCvc) {
      setPayError('Please enter a valid card number, expiry (MM/YY), and CVC.');
      return;
    }
    if (!paymongoPublicKey) {
      setPayError('Payment is still initializing — please wait a moment and try again.');
      return;
    }

    setPayError('');
    setPayLoading(true);
    try {
      const res = await fetch(`${PAYMONGO_API_BASE}/payment_methods`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(`${paymongoPublicKey}:`)}`,
        },
        body: JSON.stringify({
          data: {
            attributes: {
              type: 'card',
              details: { card_number: digits, exp_month: Number(mm), exp_year: Number(yy), cvc: cardCvc },
              billing: guestName ? { name: guestName.trim() } : undefined,
            },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.errors?.[0]?.detail || 'Card could not be verified. Please check the details and try again.');
      }
      await attachAndHandle({ paymentMethodId: data.data.id });
    } catch (err) {
      console.error(err);
      setPayError(err.message || 'Card could not be verified. Please check the details and try again.');
      setPayLoading(false);
    }
  }

  function handleDone() {
    onClose();
  }

  // ── Calendar day list, computed fresh from settings + monthBookings ──
  function buildCalendarDays() {
    if (!room) return { firstDay: 0, days: [] };
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oh = settings?.operatingHours || {};
    const maxAdvanceDays = Number(oh.maxAdvanceDays) || 30;
    // Admin-configurable via Settings > Operating Schedule; 2 matches the
    // schema's own default (model/settings.js) if the field is missing.
    const fewSlotsThreshold = Number.isFinite(Number(oh.fewSlotsThreshold)) ? Number(oh.fewSlotsThreshold) : 2;
    const latestBookable = new Date(today);
    latestBookable.setDate(latestBookable.getDate() + maxAdvanceDays);

    const now = new Date();
    const cutoffHours = Number(oh.bookingCutoffHours) || 0;
    const todaysOpenTime = new Date(today);
    todaysOpenTime.setHours(openHour, 0, 0, 0);
    const todayCutoffLocked = now < todaysOpenTime && todaysOpenTime - now < cutoffHours * 3600000;

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(y, m, d);
      const dStr = dateKey(y, m, d);
      const isToday = thisDate.getTime() === today.getTime();
      const beyondWindow = thisDate > latestBookable;
      const cutoffBlocked = isToday && todayCutoffLocked;
      const holiday = isHolidayDate(dStr, settings?.holidays);
      const closedDay = !isOperatingDay(thisDate, settings?.operatingHours);
      const past = thisDate < today;

      const freeSlots = getFreeSlotCount(monthBookings[dStr], openHour, closeHour);
      const fullyBooked = freeSlots === 0;
      const unavailable = holiday || closedDay || beyondWindow || cutoffBlocked;
      const blocked = unavailable || fullyBooked;
      const fewSlots = !unavailable && !fullyBooked && freeSlots <= fewSlotsThreshold;

      let variant = null; // no dot for past dates with nothing to report
      let title = '';
      if (!past) {
        if (unavailable) {
          variant = 'unavailable';
          title = holiday
            ? 'Closed for a holiday/closure'
            : beyondWindow
            ? `Bookings only open ${maxAdvanceDays} days in advance`
            : cutoffBlocked
            ? `Booking cutoff — must book at least ${cutoffHours}h before opening`
            : 'Closed on this day of the week';
        } else if (fullyBooked) {
          variant = 'full';
          title = 'Fully booked for this room';
        } else if (fewSlots) {
          variant = 'few';
        } else {
          variant = 'available';
        }
      }

      days.push({
        d, y, m, isToday,
        disabled: past || blocked,
        variant,
        freeSlots,
        showSlots: !past && !unavailable && !fullyBooked,
        title,
      });
    }
    return { firstDay, days };
  }

  const priceItems = room ? priceOptionsFor(room) : [];
  const { firstDay, days: calendarDays } = step === 'calendar' ? buildCalendarDays() : { firstDay: 0, days: [] };
  const cap = room ? getRoomCapacity(room) : null;

  const selectedDateLabel = selectedDate
    ? `${WEEKDAYS[new Date(selectedDate.y, selectedDate.m, selectedDate.d).getDay()]}, ${MONTHS[selectedDate.m]} ${selectedDate.d}`
    : '';
  const selectedOptionLabel = selectedVariant ? `${selectedVariant.label} · ₱${selectedVariant.price}/hr` : '';
  const startTimeLabel = selectedHour !== null ? formatHour(selectedHour) : '—';
  const endTimeLabel = selectedHour !== null ? formatHour(selectedHour + selectedDuration) : '—';
  const durationLabel = `${selectedDuration} hour${selectedDuration === 1 ? '' : 's'}`;

  // Review step — full date (with year) since, unlike the Time step's
  // in-context label, Review is a standalone confirmation summary.
  const reviewDateLabel = selectedDate
    ? `${MONTHS[selectedDate.m]} ${selectedDate.d}, ${selectedDate.y} (${WEEKDAYS[new Date(selectedDate.y, selectedDate.m, selectedDate.d).getDay()]})`
    : '—';
  // Reuses computeDownPayment (utils/rooms.js) — same first-hour-rate rule
  // already used on the Payment step, not a second implementation.
  const reviewSubtotal = selectedVariant ? selectedVariant.price * selectedDuration : 0;
  const reviewDownPayment = selectedVariant ? computeDownPayment(selectedVariant.price) : 0;
  const reviewRemainingBalance = Math.max(0, reviewSubtotal - reviewDownPayment);

  return (
    <div
      className={`bk-overlay${open ? ' open' : ''}`}
      id="booking-modal"
      onClick={handleOverlayClick}
    >
      <div className="bk-modal">
        <button className="bk-close" aria-label="Close" onClick={onClose}>✕</button>

        <div className="bk-header">
          <div className="bk-room-icon">
            {step === 'paymongoReturn' ? (
              <i className="fa-solid fa-credit-card"></i>
            ) : (
              <i className="fa-solid fa-circle-dot"></i>
            )}
          </div>
          <div>
            <p className="bk-eyebrow">Book a space</p>
            <h2>{step === 'paymongoReturn' ? 'Online Payment' : room?.name}</h2>
          </div>
        </div>

        {step !== 'paymongoReturn' && <BookingStepper step={step} />}

        <div className="bk-body">
          {/* STEP 1: ROOM SELECTION */}
          {step === 'price' && room && (
            <div className="bk-step" id="bkStepPrice">
              <div className="bk-choose-label-row">
                <p className="bk-choose-label">Choose a room</p>
                {facilityStatus && (
                  <span
                    className={
                      'bk-status-pill ' +
                      (facilityStatus === 'Fully Booked' ? 'bk-status-pill--fullybooked' : 'bk-status-pill--available')
                    }
                  >
                    {facilityStatus}
                  </span>
                )}
              </div>
              <div className="bk-room-list" id="bkPriceList">
                {priceItems.map((opt, i) => {
                  const optImage = opt.image || room.image;
                  const cardImage = optImage ? resolveImageUrl(optImage) : fallbackRoomImg;
                  const optDescription = opt.description || room.description;
                  const optFeatures = opt.features && opt.features.length ? opt.features : room.features;
                  const isSelected =
                    !!selectedVariant && selectedVariant.label === opt.label && selectedVariant.price === opt.price;

                  return (
                    <div
                      className={'bk-room-option' + (isSelected ? ' bk-room-option--selected' : '')}
                      key={i}
                      onClick={() => handleChooseOption(opt)}
                    >
                      <div className="bk-room-option-img">
                        <img src={cardImage} alt={opt.label} />
                      </div>
                      <div className="bk-room-option-body">
                        <div className="bk-room-option-top">
                          <div className="bk-room-option-name-wrap">
                            <p className="bk-room-option-name">{opt.label}</p>
                          </div>
                          <span className={'bk-radio' + (isSelected ? ' bk-radio--selected' : '')}></span>
                        </div>
                        {opt.pax && (
                          <p className="bk-room-option-pax"><i className="fa-solid fa-users"></i> {opt.pax}</p>
                        )}
                        {optDescription && <p className="bk-room-option-desc">{optDescription}</p>}
                        {optFeatures && optFeatures.length > 0 && (
                          <ul className="bk-room-option-amenities">
                            {optFeatures.map((f, fi) => (
                              <li key={fi}><i className="fa-solid fa-check"></i>{f}</li>
                            ))}
                          </ul>
                        )}
                        <span className="bk-room-option-price">₱{opt.price}/hr</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button className="bk-confirm bk-continue" disabled={!selectedVariant} onClick={handleContinueFromPrice}>
                Continue <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          )}

          {/* STEP 2: CALENDAR */}
          {step === 'calendar' && room && selectedVariant && (
            <div className="bk-step" id="bkStepCalendar">
              <button className="bk-back" onClick={() => setStep('price')}>
                <i className="fa-solid fa-arrow-left"></i> Back to pricing
              </button>

              <p className="bk-selected-option-pill">{selectedOptionLabel}</p>

              <div className="bk-cal-head">
                <button
                  className="bk-nav-btn"
                  aria-label="Previous month"
                  onClick={() => setViewDate((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))}
                >
                  <i className="fa-solid fa-chevron-left"></i>
                </button>
                <span className="bk-month-label">{MONTHS[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
                <button
                  className="bk-nav-btn"
                  aria-label="Next month"
                  onClick={() => setViewDate((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))}
                >
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>

              <div className="bk-weekdays">
                <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
              </div>

              <div className="bk-grid" id="bkCalGrid">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div className="bk-day bk-day--empty" key={`empty-${i}`}></div>
                ))}
                {calendarDays.map((day) => (
                  <div
                    key={day.d}
                    className={
                      'bk-day' +
                      (day.disabled ? ' bk-day--disabled' : ' bk-day--open') +
                      (day.isToday ? ' bk-day--today' : '') +
                      (day.variant === 'available' ? ' bk-day--available' : '') +
                      (day.variant === 'few' ? ' bk-day--few' : '') +
                      (day.variant === 'full' ? ' bk-day--full' : '') +
                      (day.variant === 'unavailable' ? ' bk-day--unavailable' : '')
                    }
                    title={day.title || undefined}
                    onClick={!day.disabled ? () => handleSelectDate(day.y, day.m, day.d) : undefined}
                  >
                    <span className="bk-day-num">{day.d}</span>
                    {day.showSlots && (
                      <span className="bk-day-slots">{day.freeSlots} slot{day.freeSlots === 1 ? '' : 's'}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="bk-legend">
                <span><i className="bk-dot bk-dot--available"></i> Available</span>
                <span><i className="bk-dot bk-dot--few"></i> Few slots</span>
                <span><i className="bk-dot bk-dot--full"></i> Fully booked</span>
                <span><i className="bk-dot bk-dot--unavailable"></i> Unavailable</span>
              </div>
            </div>
          )}

          {/* STEP 3: TIME SLOTS */}
          {step === 'slots' && room && selectedVariant && selectedDate && (
            <div className="bk-step" id="bkStepSlots">
              <button className="bk-back" onClick={() => setStep('calendar')}>
                <i className="fa-solid fa-arrow-left"></i> Back to calendar
              </button>

              <div className="bk-slots-head">
                <h3>{selectedDateLabel}</h3>
                <p>{selectedOptionLabel}</p>
              </div>

              <p className="bk-choose-label">Available Time</p>
              <div className="bk-slots-grid" id="bkSlotsGrid">
                {(() => {
                  const now = new Date();
                  const isToday =
                    selectedDate.y === now.getFullYear() &&
                    selectedDate.m === now.getMonth() &&
                    selectedDate.d === now.getDate();
                  const currentHour = now.getHours();
                  const slots = [];
                  for (let h = openHour; h < closeHour; h++) {
                    const isPast = isToday && h <= currentHour;
                    const fits = !isPast && maxDurationFrom(h, closeHour, reserved) >= selectedDuration;
                    slots.push(
                      <div
                        key={h}
                        className={
                          'bk-slot' +
                          (!fits ? ' bk-slot--reserved' : '') +
                          (selectedHour !== null && h >= selectedHour && h < selectedHour + selectedDuration
                            ? ' bk-slot--selected'
                            : '')
                        }
                        title={isPast ? 'This time has already passed today' : undefined}
                        onClick={fits ? () => handleSelectHour(h) : undefined}
                      >
                        <span className="bk-slot-time">{formatHour(h)}</span>
                        <span className="bk-slot-status">{fits ? 'Available' : 'Unavailable'}</span>
                      </div>
                    );
                  }
                  return slots;
                })()}
              </div>

              <div className="bk-duration-picker">
                <span>Duration (Maximum {MAX_DURATION} hours)</span>
                <div className="bk-duration-options" id="bkDurationOptions">
                  {Array.from({ length: MAX_DURATION }, (_, i) => i + 1).map((dur) => (
                    <div
                      key={dur}
                      className={'bk-duration-btn' + (dur === selectedDuration ? ' bk-duration-btn--selected' : '')}
                      onClick={() => handleSelectDuration(dur)}
                    >
                      {dur}h
                    </div>
                  ))}
                </div>
              </div>

              <div className="bk-time-summary" id="bkTimeSummary">
                <div>
                  <p className="bk-summary-label">Start Time</p>
                  <p className="bk-summary-value">{startTimeLabel}</p>
                </div>
                <div>
                  <p className="bk-summary-label">End Time</p>
                  <p className="bk-summary-value">{endTimeLabel}</p>
                </div>
                <div>
                  <p className="bk-summary-label">Duration</p>
                  <p className="bk-summary-value">{durationLabel}</p>
                </div>
              </div>

              <button className="bk-confirm bk-continue" disabled={selectedHour === null} onClick={handleContinueFromSlots}>
                Continue <i className="fa-solid fa-arrow-right"></i>
              </button>
            </div>
          )}

          {/* STEP 4: DETAILS */}
          {step === 'details' && room && selectedVariant && selectedDate && selectedHour !== null && (
            <div className="bk-step" id="bkStepDetails">
              <p className="bk-choose-label bk-choose-label--heading">Your Information</p>

              <div className="bk-guest-fields">
                <div className="bk-field">
                  <label className="bk-field-label" htmlFor="bkGuestName">Full Name</label>
                  <input
                    type="text"
                    id="bkGuestName"
                    className="bk-field-input"
                    placeholder="Juan Dela Cruz"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />
                </div>
                <div className="bk-field">
                  <label className="bk-field-label" htmlFor="bkGuestContact">Phone Number or Email</label>
                  <input
                    type="text"
                    id="bkGuestContact"
                    className="bk-field-input"
                    placeholder="09xx xxx xxxx or you@email.com"
                    value={guestContact}
                    onChange={(e) => setGuestContact(e.target.value)}
                  />
                </div>
                <div className="bk-field">
                  <label className="bk-field-label" htmlFor="bkGuestCount">
                    Number of Guests (Pax)
                    <span className="bk-field-hint" id="bkGuestCountHint">{cap ? `Max ${cap} pax` : ''}</span>
                  </label>
                  <div className="bk-pax-stepper">
                    <button type="button" className="bk-pax-btn" aria-label="Decrease guests" onClick={() => handlePaxStep(-1)}>
                      <i className="fa-solid fa-minus"></i>
                    </button>
                    <input
                      type="number"
                      id="bkGuestCount"
                      className={`bk-field-input bk-pax-input${paxError ? ' bk-field-input--error' : ''}`}
                      min="1"
                      max={cap || undefined}
                      inputMode="numeric"
                      value={guestCount}
                      onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || 1)}
                    />
                    <button type="button" className="bk-pax-btn" aria-label="Increase guests" onClick={() => handlePaxStep(1)}>
                      <i className="fa-solid fa-plus"></i>
                    </button>
                  </div>
                  <p className="bk-field-error" id="bkGuestCountError" style={{ display: paxError ? 'block' : 'none' }}>
                    {paxError}
                  </p>
                </div>
                <div className="bk-field">
                  <label className="bk-field-label" htmlFor="bkGuestNote">
                    Special Request <span className="bk-field-optional">(Optional)</span>
                  </label>
                  <textarea
                    id="bkGuestNote"
                    className="bk-field-input bk-field-textarea"
                    rows="2"
                    placeholder="e.g. extra chairs, birthday setup, etc."
                    value={guestNote}
                    onChange={(e) => setGuestNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="bk-detail-actions">
                <button className="bk-back-btn" onClick={() => setStep('slots')}>
                  <i className="fa-solid fa-arrow-left"></i> Back
                </button>
                <button
                  className="bk-confirm bk-continue"
                  id="bkConfirm"
                  disabled={confirming}
                  onClick={confirmBooking}
                >
                  Continue <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: REVIEW */}
          {step === 'review' && room && selectedVariant && selectedDate && selectedHour !== null && (
            <div className="bk-step" id="bkStepReview">
              <button className="bk-back" onClick={() => setStep('details')}>
                <i className="fa-solid fa-arrow-left"></i> Back to details
              </button>

              <p className="bk-choose-label bk-choose-label--heading">Review your reservation</p>

              <div className="bk-review-room">
                <div className="bk-review-room-img">
                  <img
                    src={
                      (selectedVariant.image || room.image)
                        ? resolveImageUrl(selectedVariant.image || room.image)
                        : fallbackRoomImg
                    }
                    alt={selectedVariant.label}
                  />
                </div>
                <div className="bk-review-room-body">
                  <p className="bk-review-room-name">{selectedVariant.label}</p>
                  <p className="bk-review-room-facility">{room.name}</p>
                  {selectedVariant.pax && (
                    <p className="bk-room-option-pax"><i className="fa-solid fa-users"></i> {selectedVariant.pax}</p>
                  )}
                </div>
              </div>

              <div className="bk-summary-card" style={{ display: 'block' }}>
                <div className="bk-summary-row">
                  <span className="bk-sr-label"><i className="fa-solid fa-calendar-days"></i> Date</span>
                  <span className="bk-sr-value">{reviewDateLabel}</span>
                </div>
                <div className="bk-summary-row">
                  <span className="bk-sr-label"><i className="fa-solid fa-clock"></i> Time</span>
                  <span className="bk-sr-value">{startTimeLabel}</span>
                </div>
                <div className="bk-summary-row">
                  <span className="bk-sr-label"><i className="fa-solid fa-hourglass-half"></i> Duration</span>
                  <span className="bk-sr-value">{durationLabel}</span>
                </div>
                <div className="bk-summary-row">
                  <span className="bk-sr-label"><i className="fa-solid fa-users"></i> Guests (Pax)</span>
                  <span className="bk-sr-value">{guestCount || 1}</span>
                </div>
                <div className="bk-summary-row">
                  <span className="bk-sr-label"><i className="fa-solid fa-peso-sign"></i> Rate</span>
                  <span className="bk-sr-value">₱{selectedVariant.price}/hr</span>
                </div>
              </div>

              <div className="bk-review-cost">
                <div className="bk-review-cost-row">
                  <span>Subtotal ({durationLabel})</span>
                  <span>₱{reviewSubtotal.toLocaleString()}</span>
                </div>
                <div className="bk-review-cost-row bk-review-cost-row--accent">
                  <span>Downpayment (1 hour)</span>
                  <span>₱{reviewDownPayment.toLocaleString()}</span>
                </div>
                <div className="bk-review-cost-row bk-review-cost-row--balance">
                  <span>Remaining Balance</span>
                  <span>₱{reviewRemainingBalance.toLocaleString()}</span>
                </div>
                <p className="bk-review-note">The downpayment is required to confirm your booking.</p>
              </div>

              <div className="bk-detail-actions">
                <button className="bk-back-btn" onClick={() => setStep('details')}>
                  <i className="fa-solid fa-arrow-left"></i> Back
                </button>
                <button className="bk-confirm bk-continue" onClick={proceedToPayment}>
                  Proceed to Payment <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: PAYMENT */}
          {step === 'payment' && room && selectedVariant && (
            <div className="bk-step" id="bkStepPayment">
              <div className="bk-slots-head">
                <h3>Payment</h3>
              </div>

              <div className="bk-downpayment-card">
                <span className="bk-downpayment-card-dot" aria-hidden="true"></span>
                <p className="bk-summary-label">Downpayment Amount</p>
                <p className="bk-downpayment-amount">
                  ₱{computeDownPayment(selectedVariant.price).toLocaleString()}
                </p>
                <p className="bk-downpayment-duration">(1 hour)</p>
              </div>

              <div className="bk-payment-methods">
                <span className="bk-payment-methods-label">Select Payment Method</span>
                <div className="bk-payment-methods-grid">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={
                        'bk-payment-method-tile' +
                        (selectedMethod === m.key ? ' bk-payment-method-tile--selected' : '') +
                        (!pmIntent || payLoading ? ' bk-payment-method-tile--disabled' : '')
                      }
                      disabled={!pmIntent || payLoading}
                      onClick={() => handleSelectMethod(m.key)}
                    >
                      <i className={m.icon}></i>
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {!pmIntent && !payError && (
                <p className="bk-online-pay-sub">Preparing secure payment…</p>
              )}

              {selectedMethod && selectedMethod !== 'card' && (
                <p className="bk-payment-redirect-note">You will be redirected to complete your payment.</p>
              )}

              {selectedMethod === 'card' && (
                <form id="bkCardForm" className="bk-guest-fields" onSubmit={handlePayCard}>
                  <div className="bk-field">
                    <label className="bk-field-label">Card Number</label>
                    <input
                      className="bk-field-input"
                      inputMode="numeric"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      disabled={payLoading}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="bk-field" style={{ flex: 1 }}>
                      <label className="bk-field-label">Expiry (MM/YY)</label>
                      <input
                        className="bk-field-input"
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        disabled={payLoading}
                      />
                    </div>
                    <div className="bk-field" style={{ flex: 1 }}>
                      <label className="bk-field-label">CVC</label>
                      <input
                        className="bk-field-input"
                        inputMode="numeric"
                        placeholder="123"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        disabled={payLoading}
                      />
                    </div>
                  </div>
                </form>
              )}

              {payError && (
                <p style={{ display: 'block', fontSize: '.78rem', color: '#e2554b', marginTop: 8 }}>{payError}</p>
              )}

              <div className="bk-detail-actions">
                <button className="bk-back-btn" onClick={() => setStep('review')}>
                  <i className="fa-solid fa-arrow-left"></i> Back
                </button>
                <button
                  type={selectedMethod === 'card' ? 'submit' : 'button'}
                  form={selectedMethod === 'card' ? 'bkCardForm' : undefined}
                  className="bk-confirm bk-continue"
                  disabled={payLoading || !pmIntent || !selectedMethod}
                  onClick={selectedMethod === 'card' ? undefined : handleConfirmWalletPay}
                >
                  {payLoading ? 'Processing…' : 'Pay Now'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4b: RETURNING FROM PAYMONGO CHECKOUT */}
          {step === 'paymongoReturn' && (
            <div className="bk-step" id="bkStepPaymongoReturn">
              {pmReturn.phase === 'confirmed' ? (
                <BookingSuccess
                  booking={pmReturn.booking}
                  room={room}
                  selectedVariant={selectedVariant}
                  onDone={handleDone}
                />
              ) : (
                <>
                  <div className="bk-confirm-icon">
                    {pmReturn.phase === 'loading' && <i className="fa-solid fa-spinner fa-spin"></i>}
                    {pmReturn.phase === 'cancelled' && <i className="fa-solid fa-circle-xmark"></i>}
                    {pmReturn.phase === 'needLogin' && <i className="fa-solid fa-triangle-exclamation"></i>}
                    {pmReturn.phase === 'pending' && <i className="fa-solid fa-clock"></i>}
                  </div>

                  <h3>
                    {pmReturn.phase === 'loading' && 'Confirming your payment…'}
                    {pmReturn.phase === 'cancelled' && 'Payment cancelled'}
                    {pmReturn.phase === 'needLogin' && 'Please log in to confirm'}
                    {pmReturn.phase === 'pending' && 'Still confirming your payment…'}
                  </h3>

                  <p>
                    {pmReturn.phase === 'loading' && 'Please wait a moment.'}
                    {pmReturn.phase === 'cancelled' &&
                      "No worries — your slot wasn't charged and hasn't been held. Feel free to book again whenever you're ready."}
                    {pmReturn.phase === 'needLogin' &&
                      'Log in with the same account you booked with to see your payment status.'}
                    {pmReturn.phase === 'pending' &&
                      'This can take a little longer than usual. You\'ll see your booking move to "Confirmed" in your profile shortly — no need to pay again.'}
                  </p>

                  {pmReturn.phase !== 'loading' && (
                    <button className="bk-done" onClick={handleDone}>Done</button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookingModal;