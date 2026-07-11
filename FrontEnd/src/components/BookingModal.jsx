import { useEffect, useState } from 'react';
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
  FEW_SLOTS_THRESHOLD,
  isHolidayDate,
  isOperatingDay,
  computeDownPayment,
} from '../utils/rooms';


const API_BASE_URL = 'http://localhost:3000';
const MAX_DURATION = 5;

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

// STEPS — the 6-stage progress indicator shown in the Booking UI reference.
// 'price' (Room), 'calendar' (Date), 'slots' (Time), 'details' (Details),
// 'review' (Review), and 'payment' are all real internal steps.
const STEPS = [
  { key: 'price', label: 'Room' },
  { key: 'calendar', label: 'Date' },
  { key: 'slots', label: 'Time' },
  { key: 'details', label: 'Details' },
  { key: 'review', label: 'Review' },
  { key: 'payment', label: 'Payment' },
];
const STEP_INDEX = { price: 1, calendar: 2, slots: 3, details: 4, review: 5, payment: 6 };

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

    const user = authUser;
    setGuestName(user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '');
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
          await logout();
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
      const holiday = isHolidayDate(dStr, settings?.holidays);
      const closedDay = !isOperatingDay(thisDate, settings?.operatingHours);
      const past = thisDate < today;

      const freeSlots = getFreeSlotCount(monthBookings[dStr], openHour, closeHour);
      const fullyBooked = freeSlots === 0;
      const unavailable = holiday || closedDay || beyondWindow || cutoffBlocked;
      const blocked = unavailable || fullyBooked;
      const fewSlots = !unavailable && !fullyBooked && freeSlots <= FEW_SLOTS_THRESHOLD;

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
              <p className="bk-choose-label">Choose a room</p>
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
                          <p className="bk-room-option-name">{opt.label}</p>
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

          {/* STEP 6: DOWN PAYMENT */}
          {step === 'payment' && room && selectedVariant && (
            <div className="bk-step" id="bkStepPayment">
              <button className="bk-back" onClick={() => setStep('review')}>
                <i className="fa-solid fa-arrow-left"></i> Back to review
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