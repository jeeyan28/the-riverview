import { useEffect, useState } from 'react';
import {
  dateKey,
  getRoomCapacity,
  fetchReservedHours,
  clearReservedHours,
  loadMonthAvailability,
  clearMonthAvailability,
  isDayFullyBooked,
  isHolidayDate,
  isOperatingDay,
  computeDownPayment,
} from '../utils/rooms';

// ─────────────────────────────────────────────────────────────────────────
// BookingModal — migrated from index.html's #booking-modal markup +
// js/index.js's booking-modal section (openBooking through
// handlePaymongoReturn, roughly lines 537–1206) — Home page, Phase 8,
// part 2 of 3.
//
// This is a controlled component: Home.jsx owns whether it's open and
// which room/PayMongo-return it's showing, via two props:
//   - `room`       — the room object when opened via "Select Room", else null
//   - `returnInfo` — { result: 'success'|'cancel', bookingId } when the
//                    page loaded with ?paymongo=...&bookingId=... in the
//                    URL, else null. Home.jsx reads this from
//                    useSearchParams once on mount, exactly like the
//                    original's handlePaymongoReturn() ran unconditionally
//                    on every page load.
// `open` (below) is just `!!room || !!returnInfo` — the overlay element
// itself is always mounted (matching the original's always-in-DOM
// #booking-modal, hidden via `display:none` until `.open` is added) so the
// existing bkFadeIn/bkSlideUp CSS animations still play correctly.
//
// Auth notes (still local to this component, not AuthContext — that's
// Phase 10): `getStoredUser`/`verifySession` below are copied 1:1 from the
// same-named functions in the original js/index.js. This duplicates a few
// lines already also inlined in Login.jsx/Register.jsx/ResetPassword.jsx;
// per hooks/README.md and utils/README.md, de-duplicating this into a
// shared hook is intentionally deferred to Phase 10 (useAuth.js) rather
// than built speculatively now.
//
// API_BASE_URL is still hardcoded, matching every other page pre-Phase 9.
// ─────────────────────────────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000';
const USER_KEY = 'riverview_user';
const MAX_DURATION = 5;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// verifySession — migrated 1:1. Confirms with the server whether the
// session cookie is still valid (the real source of truth — never trust
// cached storage alone), keeping whichever storage area currently holds
// the user in sync with the answer.
async function verifySession() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(USER_KEY);
      return null;
    }
    const data = await res.json();
    const area = localStorage.getItem(USER_KEY) ? localStorage : sessionStorage;
    area.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  } catch (err) {
    return getStoredUser();
  }
}

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
    : [{ label: 'Standard', price: room.price || 0, pax: '' }];
}

// BookingSummaryCard — migrated 1:1 from renderBookingSummary() in
// js/index.js. Shown once a booking's payment is confirmed.
function BookingSummaryCard({ booking }) {
  if (!booking) return null;

  const dateLabel = booking.date
    ? new Date(`${booking.date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';
  const startHour = parseInt(String(booking.timeIn || '0').split(':')[0], 10) || 0;
  const timeLabel = `${formatHour(startHour)} – ${formatHour(startHour + (booking.duration || 0))}`;
  const paymentPillClass =
    booking.paymentStatus === 'Paid'
      ? 'bk-status-pill--paid'
      : booking.paymentStatus === 'Pending Verification' || booking.paymentStatus === 'Unpaid'
      ? 'bk-status-pill--pending'
      : 'bk-status-pill--unpaid';
  const reference = booking.paymongoPaymentId || booking._id || '—';

  return (
    <div className="bk-summary-card" style={{ display: 'block' }}>
      <p className="bk-summary-card-title">Booking summary</p>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-door-open"></i> Room</span>
        <span className="bk-sr-value">
          {booking.roomLabel || '—'}
          {booking.variantLabel ? ` · ${booking.variantLabel}` : ''}
        </span>
      </div>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-calendar-days"></i> Date</span>
        <span className="bk-sr-value">{dateLabel}</span>
      </div>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-clock"></i> Time</span>
        <span className="bk-sr-value">{timeLabel}</span>
      </div>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-hourglass-half"></i> Duration</span>
        <span className="bk-sr-value">{booking.duration || 0}h</span>
      </div>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-users"></i> Pax</span>
        <span className="bk-sr-value">
          {booking.guestCount || 1} guest{(booking.guestCount || 1) > 1 ? 's' : ''}
        </span>
      </div>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-peso-sign"></i> Down payment</span>
        <span className="bk-sr-value">₱{Number(booking.downPayment || 0).toLocaleString()}</span>
      </div>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-circle-check"></i> Payment status</span>
        <span className="bk-sr-value">
          <span className={`bk-status-pill ${paymentPillClass}`}>{booking.paymentStatus || 'Unpaid'}</span>
        </span>
      </div>
      <div className="bk-summary-row">
        <span className="bk-sr-label"><i className="fa-solid fa-hashtag"></i> Reference no.</span>
        <span className="bk-sr-value bk-ref-value">{String(reference)}</span>
      </div>
    </div>
  );
}

function BookingModal({ room, returnInfo, onClose, openHour, closeHour, settings }) {
  const open = !!room || !!returnInfo;

  const [step, setStep] = useState('price'); // 'price' | 'calendar' | 'slots' | 'payment' | 'paymongoReturn'
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

  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

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

    const user = getStoredUser();
    setGuestName(user ? [user.firstname, user.lastname].filter(Boolean).join(' ') || user.name || '' : '');
    setGuestContact(user ? user.phone || user.email || '' : '');
  }, [room]);

  // Drive the paymongoReturn step off `returnInfo` — mirrors
  // handlePaymongoReturn() in the original, run once when Home.jsx detects
  // ?paymongo=...&bookingId=... on load.
  useEffect(() => {
    if (!returnInfo) return;
    let cancelled = false;
    setStep('paymongoReturn');
    setPmReturn({ phase: 'loading', booking: null });

    async function resolve() {
      if (returnInfo.result === 'cancel') {
        // Best-effort: release the held slot. Safe even if the booking was
        // actually paid a moment earlier (server no-ops that case).
        try {
          await fetch(`${API_BASE_URL}/api/payments/paymongo/cancel/${encodeURIComponent(returnInfo.bookingId)}`, {
            method: 'POST',
            credentials: 'include',
          });
        } catch (err) {
          console.error(err);
        }
        if (!cancelled) setPmReturn({ phase: 'cancelled', booking: null });
        return;
      }

      // result === 'success' — poll briefly in case the webhook hasn't landed yet.
      const user = await verifySession();
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
            `${API_BASE_URL}/api/payments/paymongo/status/${encodeURIComponent(returnInfo.bookingId)}`,
            { credentials: 'include' }
          );
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.paymentStatus === 'Paid') {
            let booking = null;
            try {
              const bookingRes = await fetch(
                `${API_BASE_URL}/api/bookings/${encodeURIComponent(returnInfo.bookingId)}`,
                { credentials: 'include' }
              );
              if (bookingRes.ok) booking = await bookingRes.json();
            } catch (err) {
              console.error(err);
            }
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

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSelectOption(opt) {
    setSelectedVariant(opt);
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

  // confirmBooking — STEP 1 of confirming: validates guest details + pax
  // capacity, re-verifies the session with the server (not just cached
  // storage — see original's comment on why), then moves to the
  // down-payment step. Migrated 1:1, including the plain alert() for the
  // name/contact check (kept as-is rather than switched to a toast, to
  // match the original's exact UX for this one validation).
  async function confirmBooking() {
    const trimmedName = guestName.trim();
    const trimmedContact = guestContact.trim();

    if (!trimmedName || !trimmedContact) {
      alert('Please enter your name and a phone number or email so we can confirm your booking.');
      return;
    }
    if (paxError) return; // inline error is already shown next to the Pax field

    setConfirming(true);
    const user = await verifySession();
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
    setStep('payment');
  }

  // payOnlineAutomatically — creates the booking server-side and redirects
  // to PayMongo's hosted checkout. Migrated 1:1. This is the ONLY payment
  // path (manual/screenshot payment was removed backend-side too).
  async function payOnlineAutomatically() {
    const { y, m, d } = selectedDate;
    const dateStr = dateKey(y, m, d);
    const timeStr = `${String(selectedHour).padStart(2, '0')}:00`;

    setPayError('');
    setPayLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/payments/paymongo/checkout`, {
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
          localStorage.removeItem(USER_KEY);
          sessionStorage.removeItem(USER_KEY);
          alert('Your session has expired. Please log in again to complete your booking.');
          window.location.href = '/login';
          return;
        }
        throw new Error(data.message || 'Could not start online payment.');
      }

      // Release the local cache for this room/date/month so, if the user
      // hits the browser back button instead of PayMongo's own cancel
      // link, the slot still shows correctly next time it's checked.
      clearReservedHours(room._id, dateStr);
      clearMonthAvailability(room._id, y, m + 1);

      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error(err);
      setPayError(err.message || 'Something went wrong starting checkout. Please try again.');
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
      const fullyBooked = isDayFullyBooked(monthBookings[dStr], openHour, closeHour);
      const holiday = isHolidayDate(dStr, settings?.holidays);
      const closedDay = !isOperatingDay(thisDate, settings?.operatingHours);
      const blocked = holiday || closedDay || beyondWindow || cutoffBlocked || fullyBooked;
      const past = thisDate < today;

      let title = '';
      if (blocked && !past) {
        title = holiday
          ? 'Closed for a holiday/closure'
          : beyondWindow
          ? `Bookings only open ${maxAdvanceDays} days in advance`
          : cutoffBlocked
          ? `Booking cutoff — must book at least ${cutoffHours}h before opening`
          : fullyBooked
          ? 'Fully booked for this room'
          : 'Closed on this day of the week';
      }

      days.push({
        d, y, m, isToday,
        disabled: past || blocked,
        variant: past || blocked ? (fullyBooked ? 'full' : blocked ? 'holiday' : null) : 'open',
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
  const summaryText =
    selectedHour !== null
      ? `${formatHour(selectedHour)} – ${formatHour(selectedHour + selectedDuration)} (${selectedDuration}h)`
      : 'No time selected yet';
  const confirmAmount = selectedHour !== null ? selectedVariant.price * selectedDuration : 0;

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

        <div className="bk-body">
          {/* STEP 1: PRICE / OPTION */}
          {step === 'price' && room && (
            <div className="bk-step" id="bkStepPrice">
              <div className="bk-slots-head">
                <p>Choose a pricing option to get started.</p>
              </div>
              <div className="bk-price-list" id="bkPriceList">
                {priceItems.map((opt, i) => (
                  <div className="bk-price-card" key={i} onClick={() => handleSelectOption(opt)}>
                    <div>
                      <p className="bk-price-name">{opt.label}</p>
                      <p className="bk-price-sub">{opt.pax || ''}</p>
                    </div>
                    <span className="bk-price-amt">₱{opt.price}/hr</span>
                  </div>
                ))}
              </div>
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
                      (day.variant === 'full' ? ' bk-day--full' : '') +
                      (day.variant === 'holiday' ? ' bk-day--holiday' : '')
                    }
                    title={day.title || undefined}
                    onClick={!day.disabled ? () => handleSelectDate(day.y, day.m, day.d) : undefined}
                  >
                    {day.d}
                  </div>
                ))}
              </div>

              <div className="bk-legend">
                <span><i className="bk-dot bk-dot--open"></i> Available</span>
                <span><i className="bk-dot bk-dot--full"></i> Fully booked</span>
                <span><i className="bk-dot bk-dot--past"></i> Unavailable</span>
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
                        {formatHour(h)}
                      </div>
                    );
                  }
                  return slots;
                })()}
              </div>

              <div className="bk-duration-picker">
                <span>Duration:</span>
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

              <div className="bk-guest-fields">
                <div className="bk-field">
                  <label className="bk-field-label" htmlFor="bkGuestName">Full name</label>
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
                  <label className="bk-field-label" htmlFor="bkGuestContact">Phone number or email</label>
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
                    Number of guests (Pax)
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
                    Comment / special request <span className="bk-field-optional">(optional)</span>
                  </label>
                  <textarea
                    id="bkGuestNote"
                    className="bk-field-input bk-field-textarea"
                    rows="2"
                    placeholder="e.g. birthday setup, extra chairs"
                    value={guestNote}
                    onChange={(e) => setGuestNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="bk-summary" id="bkSummary">
                <div>
                  <p className="bk-summary-label">Selected</p>
                  <p className="bk-summary-value" id="bkSummaryText">{summaryText}</p>
                </div>
                <button
                  className="bk-confirm"
                  id="bkConfirm"
                  disabled={selectedHour === null || confirming}
                  onClick={confirmBooking}
                >
                  Confirm ₱{confirmAmount}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: DOWN PAYMENT */}
          {step === 'payment' && room && selectedVariant && (
            <div className="bk-step" id="bkStepPayment">
              <button className="bk-back" onClick={() => setStep('slots')}>
                <i className="fa-solid fa-arrow-left"></i> Back to time selection
              </button>

              <div className="bk-slots-head">
                <h3>Down payment required</h3>
                <p>The minimum down payment equals this room's first-hour rate — it secures your slot instantly.</p>
              </div>

              <div className="bk-summary bk-downpayment-summary">
                <div>
                  <p className="bk-summary-label">Amount to pay now</p>
                  <p className="bk-summary-value" id="bkDownPaymentAmount">
                    ₱{computeDownPayment(selectedVariant.price).toLocaleString()}
                  </p>
                </div>
                <div className="bk-downpayment-note">
                  <i className="fa-solid fa-circle-info"></i>
                  <span>First hour rate — the remaining balance is settled on-site.</span>
                </div>
              </div>

              <div className="bk-online-pay-card">
                <p className="bk-online-pay-title"><i className="fa-solid fa-shield-halved"></i> Pay securely online</p>
                <p className="bk-online-pay-sub">
                  Pay by GCash, Maya, QR Ph, or card through our secure checkout. Your booking confirms
                  automatically — no waiting, no manual verification.
                </p>
                <button type="button" className="bk-confirm" onClick={payOnlineAutomatically} disabled={payLoading}>
                  {payLoading ? 'Redirecting…' : 'Proceed to Secure Checkout'}
                </button>
                {payError && (
                  <p style={{ display: 'block', fontSize: '.78rem', color: '#e2554b', marginTop: 8 }}>{payError}</p>
                )}
              </div>
            </div>
          )}

          {/* STEP 4b: RETURNING FROM PAYMONGO CHECKOUT */}
          {step === 'paymongoReturn' && (
            <div className="bk-step" id="bkStepPaymongoReturn">
              <div className="bk-confirm-icon">
                {pmReturn.phase === 'loading' && <i className="fa-solid fa-spinner fa-spin"></i>}
                {pmReturn.phase === 'cancelled' && <i className="fa-solid fa-circle-xmark"></i>}
                {pmReturn.phase === 'needLogin' && <i className="fa-solid fa-triangle-exclamation"></i>}
                {pmReturn.phase === 'confirmed' && <i className="fa-solid fa-circle-check"></i>}
                {pmReturn.phase === 'pending' && <i className="fa-solid fa-clock"></i>}
              </div>

              <h3>
                {pmReturn.phase === 'loading' && 'Confirming your payment…'}
                {pmReturn.phase === 'cancelled' && 'Payment cancelled'}
                {pmReturn.phase === 'needLogin' && 'Please log in to confirm'}
                {pmReturn.phase === 'confirmed' && 'Payment confirmed — booking Confirmed!'}
                {pmReturn.phase === 'pending' && 'Still confirming your payment…'}
              </h3>

              <p>
                {pmReturn.phase === 'loading' && 'Please wait a moment.'}
                {pmReturn.phase === 'cancelled' &&
                  "No worries — your slot wasn't charged and hasn't been held. Feel free to book again whenever you're ready."}
                {pmReturn.phase === 'needLogin' &&
                  'Log in with the same account you booked with to see your payment status.'}
                {pmReturn.phase === 'confirmed' &&
                  'Your down payment went through and your slot is secured. See you then!'}
                {pmReturn.phase === 'pending' &&
                  'This can take a little longer than usual. You\'ll see your booking move to "Confirmed" in your profile shortly — no need to pay again.'}
              </p>

              {pmReturn.phase === 'confirmed' && <BookingSummaryCard booking={pmReturn.booking} />}

              {pmReturn.phase !== 'loading' && (
                <button className="bk-done" onClick={handleDone}>Done</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookingModal;
