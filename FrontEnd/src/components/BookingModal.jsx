import { Fragment, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';
import RoomOptionCard from './RoomOptionCard';
import { bookingsService } from '../services/bookings';
import { useCountdownClock } from '../hooks/useCountdownClock';
import { formatHour, openBookingReceipt } from '../utils/receipt';
import {
  dateKey,
  getPaxCapacity,
  fetchReservedHours,
  clearReservedHours,
  loadMonthAvailability,
  clearMonthAvailability,
  getAvailableRoomCount,
  isHolidayDate,
  isOperatingDay,
  priceOptionsFor,
} from '../utils/rooms';
import { API_BASE_URL } from '../services/api';

const PAYMONGO_API_BASE = import.meta.env.VITE_PAYMONGO_API_BASE || 'https://api.paymongo.com/v1';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function canBookDuration(startHour, duration, closeHour, reserved, totalRooms) {
  if (startHour + duration > closeHour) return false;
  for (let hour = startHour; hour < startHour + duration; hour++) {
    const bookedRooms = Number(reserved?.[hour] || 0);
    if (bookedRooms >= totalRooms) return false;
  }
  return true;
}

function isHourBooked(hour, reserved, totalRooms) {
  return Number(reserved?.[hour] || 0) >= totalRooms;
}

function getSlotState(startHour, duration, closeHour, reserved, totalRooms) {
  if (isHourBooked(startHour, reserved, totalRooms)) return 'booked';
  if (startHour + duration > closeHour) return 'insufficient';
  if (!canBookDuration(startHour, duration, closeHour, reserved, totalRooms)) return 'booked';
  return 'available';
}

function getLatestStartTime(openHour, closeHour, duration) {
  const latest = closeHour - duration;
  return latest >= openHour ? latest : null;
}

function buildHourCounts(dayBookings) {
  const counts = {};
  (dayBookings || []).forEach((b) => {
    const start = parseInt(String(b.timeIn).split(':')[0], 10);
    for (let h = start; h < start + Number(b.duration); h++) {
      counts[h] = (counts[h] || 0) + 1;
    }
  });
  return counts;
}

function getFreeHourCount(dayBookings, openHour, closeHour, totalRooms) {
  const reserved = buildHourCounts(dayBookings);
  let count = 0;
  for (let h = openHour; h < closeHour; h++) {
    if (!isHourBooked(h, reserved, totalRooms)) count++;
  }
  return count;
}

function getTimePeriod(hour) {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

const STEPS = [
  { key: 'price', label: 'Room' },
  { key: 'schedule', label: 'Date & Time' },
  { key: 'details', label: 'Details' },
  { key: 'review', label: 'Review' },
  { key: 'payment', label: 'Payment' },
];
const STEP_INDEX = { price: 1, schedule: 2, details: 3, review: 4, payment: 5 };

const PAYMENT_METHODS = [
  { key: 'gcash', label: 'GCash', icon: 'fa-solid fa-wallet' },
  { key: 'paymaya', label: 'Maya', icon: 'fa-solid fa-money-bill-wave' },
  { key: 'qrph', label: 'QR Ph', icon: 'fa-solid fa-qrcode' },
  { key: 'card', label: 'Credit / Debit Card', icon: 'fa-solid fa-credit-card' },
];

function BookingStepper({ step, onStepClick }) {
  const activeIndex = STEP_INDEX[step] || 1;
  return (
    <div className="bk-stepper">
      {STEPS.map((s, i) => {
        const num = i + 1;
        const state = num < activeIndex ? 'done' : num === activeIndex ? 'active' : 'upcoming';
        const clickable = state === 'done' && typeof onStepClick === 'function';
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <i className="fa-solid fa-chevron-right bk-step-chevron" aria-hidden="true"></i>
            )}
            <div
              className={`bk-step-dot bk-step-dot--${state}` + (clickable ? ' bk-step-dot--clickable' : '')}
              onClick={clickable ? () => onStepClick(s.key) : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStepClick(s.key); } } : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-current={state === 'active' ? 'step' : undefined}
              aria-label={`${s.label}${state === 'done' ? ', completed, activate to go back' : state === 'active' ? ', current step' : ', not yet available'}`}
            >
              <span className="bk-step-dot-num">{state === 'done' ? <i className="fa-solid fa-check"></i> : num}</span>
              <span className="bk-step-dot-label">{s.label}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function BookingSummaryContents({
  room, selectedVariant, selectedDate, selectedHour, selectedDuration,
  guestName, guestContact, guestCount, guestNote,
  selectedMethod, subtotal, downPayment, remainingBalance,
  step, onContinue, continueDisabled,
}) {
  if (!room) return null;

  const image = selectedVariant?.image ? resolveImageUrl(selectedVariant.image) : fallbackRoomImg;
  const dateLabel = selectedDate ? `${MONTHS[selectedDate.m]} ${selectedDate.d}, ${selectedDate.y}` : null;
  const timeLabel = selectedHour !== null
    ? `${formatHour(selectedHour)} – ${formatHour(selectedHour + selectedDuration)}`
    : null;
  const durationLabel = `${selectedDuration} hour${selectedDuration === 1 ? '' : 's'}`;
  const methodLabel = PAYMENT_METHODS.find((m) => m.key === selectedMethod)?.label;
  const isPriceStep = step === 'price';
  const estimatedTotal = isPriceStep && selectedHour !== null ? subtotal : 0;
  const estimatedHours = isPriceStep && selectedHour !== null ? selectedDuration : 0;

  return (
    <>
      <div className="bk-summary-panel-title-row">
        <span className="bk-summary-panel-title-icon"><i className="fa-solid fa-calendar-days"></i></span>
        <span className="bk-summary-panel-title">Booking Summary</span>
      </div>

      <div className="bk-summary-panel-section">
        {selectedVariant ? (
          <div className="bk-summary-panel-room">
            <div className="bk-summary-panel-img">
              <img src={image} alt={selectedVariant.label} />
            </div>
            <div>
              <p className="bk-summary-panel-room-name">{selectedVariant.label}</p>
              {selectedVariant.pax && (
                <p className="bk-summary-panel-room-pax"><i className="fa-solid fa-users"></i> {selectedVariant.pax}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="bk-summary-panel-empty"><i className="fa-solid fa-door-closed"></i> Choose a room to continue.</p>
        )}
      </div>

      {isPriceStep ? (
        <>
          {selectedVariant && (
            <div className="bk-summary-panel-section">
              <div className="bk-summary-panel-row">
                <span className="bk-summary-panel-row-label">Price</span>
                <span className="bk-summary-panel-row-value">₱{selectedVariant.price}/hr</span>
              </div>
            </div>
          )}

          <div className="bk-summary-panel-section">
            <div className="bk-summary-panel-stat">
              <span className="bk-summary-panel-stat-head"><i className="fa-solid fa-calendar-days"></i> Selected Booking Date &amp; Time</span>
              <span className={'bk-summary-panel-stat-value' + (dateLabel ? '' : ' bk-summary-panel-stat-value--empty')}>
                {dateLabel ? `${dateLabel}${timeLabel ? `, ${timeLabel}` : ''}` : 'Not selected yet'}
              </span>
            </div>
            <div className="bk-summary-panel-stat">
              <span className="bk-summary-panel-stat-head"><i className="fa-solid fa-clock"></i> Duration</span>
              <span className={'bk-summary-panel-stat-value' + (timeLabel ? '' : ' bk-summary-panel-stat-value--empty')}>
                {timeLabel ? durationLabel : 'Not selected yet'}
              </span>
            </div>
          </div>

          <div className="bk-summary-panel-section">
            <div className="bk-summary-panel-total-row">
              <span>Estimated Total</span>
              <span className="bk-summary-panel-total-value">₱{estimatedTotal.toLocaleString()}</span>
            </div>
            <p className="bk-summary-panel-total-sub">({estimatedHours} hr)</p>
          </div>

          <button className="bk-confirm bk-continue" disabled={continueDisabled} onClick={onContinue}>
            Continue <i className="fa-solid fa-arrow-right"></i>
          </button>
        </>
      ) : (
        <>
          <div className="bk-summary-panel-section">
            <span className="bk-summary-panel-section-label">Schedule</span>
            {!dateLabel && (
              <p className="bk-summary-panel-empty"><i className="fa-solid fa-calendar"></i> Select a booking date.</p>
            )}
            {dateLabel && !timeLabel && (
              <p className="bk-summary-panel-empty"><i className="fa-solid fa-clock"></i> Choose an available time slot.</p>
            )}
            {dateLabel && (
              <div className="bk-summary-panel-list">
                <div className="bk-summary-panel-row">
                  <span className="bk-summary-panel-row-label"><i className="fa-solid fa-calendar-days"></i> Booking Date</span>
                  <span className="bk-summary-panel-row-value">{dateLabel}</span>
                </div>
                {timeLabel && (
                  <div className="bk-summary-panel-row">
                    <span className="bk-summary-panel-row-label"><i className="fa-solid fa-clock"></i> Time</span>
                    <span className="bk-summary-panel-row-value">{timeLabel}</span>
                  </div>
                )}
                {timeLabel && (
                  <div className="bk-summary-panel-row">
                    <span className="bk-summary-panel-row-label"><i className="fa-solid fa-hourglass-half"></i> Duration</span>
                    <span className="bk-summary-panel-row-value">{durationLabel}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bk-summary-panel-section">
            <span className="bk-summary-panel-section-label">Guest Information</span>
            <div className="bk-summary-panel-list">
              <div className="bk-summary-panel-row">
                <span className="bk-summary-panel-row-label"><i className="fa-solid fa-user"></i> Name</span>
                <span className="bk-summary-panel-row-value">{guestName || 'Not provided yet'}</span>
              </div>
              <div className="bk-summary-panel-row">
                <span className="bk-summary-panel-row-label"><i className="fa-solid fa-phone"></i> Contact</span>
                <span className="bk-summary-panel-row-value">{guestContact || 'Not provided yet'}</span>
              </div>
              <div className="bk-summary-panel-row">
                <span className="bk-summary-panel-row-label"><i className="fa-solid fa-users"></i> Guests</span>
                <span className="bk-summary-panel-row-value">{guestCount || 1}</span>
              </div>
              {guestNote && (
                <div className="bk-summary-panel-row">
                  <span className="bk-summary-panel-row-label"><i className="fa-solid fa-note-sticky"></i> Special Request</span>
                  <span className="bk-summary-panel-row-value">{guestNote}</span>
                </div>
              )}
            </div>
          </div>

          {selectedVariant && (
            <div className="bk-summary-panel-section">
              <span className="bk-summary-panel-section-label">Payment</span>
              {methodLabel && (
                <div className="bk-summary-panel-list">
                  <div className="bk-summary-panel-row">
                    <span className="bk-summary-panel-row-label"><i className="fa-solid fa-credit-card"></i> Method</span>
                    <span className="bk-summary-panel-row-value">{methodLabel}</span>
                  </div>
                </div>
              )}
              <div className="bk-summary-panel-cost">
                <div className="bk-summary-panel-cost-row">
                  <span>Rate</span>
                  <span>₱{selectedVariant.price}/hr</span>
                </div>
                <div className="bk-summary-panel-cost-row">
                  <span>Subtotal ({durationLabel})</span>
                  <span>₱{subtotal.toLocaleString()}</span>
                </div>
                <div className="bk-summary-panel-cost-row bk-summary-panel-cost-row--accent">
                  <span>Downpayment</span>
                  <span>₱{downPayment.toLocaleString()}</span>
                </div>
                <div className="bk-summary-panel-cost-row bk-summary-panel-cost-row--total">
                  <span>Remaining Balance</span>
                  <span>₱{remainingBalance.toLocaleString()}</span>
                </div>
              </div>
              <p className="bk-summary-panel-note">Your downpayment secures this reservation. The remaining balance is paid upon arrival.</p>
            </div>
          )}
        </>
      )}
    </>
  );
}

function BookingSuccess({ booking, room, selectedVariant, onDone, onViewBooking }) {
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
  const remaining = Math.max(0, Number(booking.amount || 0) - downPayment);

  function handleOpenReceipt() {
    openBookingReceipt(booking, { roomName, facility });
  }

  return (
    <>
      <div className="bk-confirm-icon"><i className="fa-solid fa-check"></i></div>
      <h3>Booking Confirmed!</h3>
      <p>Your reservation has been successfully created. We can't wait to host you.</p>

      <div className="bk-success-card">
        <div className="bk-success-grid">
          <div className="bk-success-item">
            <span className="bk-summary-label">Reservation Code</span>
            <span className="bk-success-code">{booking.reservationCode || '—'}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Booked By</span>
            <span className="bk-summary-value">{booking.guestName || '—'}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Contact No.</span>
            <span className="bk-summary-value">{booking.guestContact || '—'}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Email</span>
            <span className="bk-summary-value">{booking.guestEmail || '—'}</span>
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
            <span className="bk-summary-label">Booking Date</span>
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
          <div className="bk-success-item">
            <span className="bk-summary-label">Booked On</span>
            <span className="bk-summary-value">{bookedOnLabel}</span>
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

      <div className="bk-success-actions-row">
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

function BookingModal({ room, returnInfo, onClose, onViewBooking, openHour, closeHour, settings }) {
  const open = !!room || !!returnInfo;
  const { user: authUser, revalidate, logout } = useAuth();

  const [monthBookings, setMonthBookings] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [reserved, setReserved] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [step, setStep] = useState('price');
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const totalRooms = Number(selectedVariant?.roomCount) || 1;
  const minDuration = Number.isFinite(Number(settings?.operatingHours?.minOnlineDurationHours))
    ? Number(settings.operatingHours.minOnlineDurationHours) : 1;
  const maxDuration = Number.isFinite(Number(settings?.operatingHours?.maxOnlineDurationHours))
    ? Number(settings.operatingHours.maxOnlineDurationHours) : 5;
  const [selectedDuration, setSelectedDuration] = useState(minDuration);
  const [downPaymentHours, setDownPaymentHours] = useState(1);

  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestNote, setGuestNote] = useState('');
  const [paxError, setPaxError] = useState('');
  const [nameError, setNameError] = useState('');
  const [contactError, setContactError] = useState('');

  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');
  const [payErrorKind, setPayErrorKind] = useState(null);

  const [paymongoPublicKey, setPaymongoPublicKey] = useState('');
  const [allowedPaymentMethodKeys, setAllowedPaymentMethodKeys] = useState(null);
  const [pmIntent, setPmIntent] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const pollRef = useRef(null);

  const [pmReturn, setPmReturn] = useState({ phase: 'loading', booking: null });

  const [lock, setLock] = useState(null);
  const [lockError, setLockError] = useState('');
  const [lockLoading, setLockLoading] = useState(false);
  const lockRef = useRef(null);
  const lockNow = useCountdownClock(!!lock);

  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  async function releaseCurrentLock() {
    const current = lockRef.current;
    if (!current) return;
    setLock(null);
    lockRef.current = null;
    try {
      await bookingsService.releaseLock(current.id);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    return () => {
      if (lockRef.current) bookingsService.releaseLock(lockRef.current.id).catch((err) => console.error(err));
    };
  }, []);

  useEffect(() => {
    if (!room) return;

    setStep('price');
    setMobileSummaryOpen(false);
    setViewDate(new Date());
    setSelectedDate(null);
    setSelectedVariant(null);
    setSelectedHour(null);
    setSelectedDuration(minDuration);
    setGuestNote('');
    setGuestCount(1);
    setPaxError('');
    setNameError('');
    setContactError('');
    setPmIntent(null);
    setSelectedMethod(null);
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setPayError('');
    setPayErrorKind(null);
    stopPolling();
    releaseCurrentLock();
    setLockError('');

    const user = authUser;
    setGuestName(user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '');
    setGuestContact(user ? user.phone || user.email || '' : '');
  }, [room]);

  useEffect(() => {
    if (!returnInfo) return;
    let cancelled = false;
    setStep('paymongoReturn');
    setPmReturn({ phase: 'loading', booking: null });

    async function resolve() {
      if (returnInfo.result === 'cancel') {
        if (!cancelled) setPmReturn({ phase: 'cancelled', booking: null });
        return;
      }

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
          if (res.status === 409 && data.status === 'paid_slot_unavailable') {
            if (!cancelled) {
              setPmReturn({
                phase: 'paidSlotUnavailable',
                booking: null,
                message: data.message || "Your payment succeeded, but this slot was just taken. Please contact support so we can help resolve it.",
              });
            }
            return;
          }
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

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (step !== 'schedule' || !room || !selectedVariant) return;
    let cancelled = false;
    setCalendarLoading(true);
    clearMonthAvailability(room._id, viewDate.getFullYear(), viewDate.getMonth() + 1);
    loadMonthAvailability(room._id, viewDate.getFullYear(), viewDate.getMonth() + 1, selectedVariant.label).then((data) => {
      if (!cancelled) {
        setMonthBookings(data);
        setCalendarLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, room, viewDate, selectedVariant]);

  useEffect(() => {
    if (step !== 'schedule' || !room || !selectedDate) return;
    let cancelled = false;
    setSlotsLoading(true);
    const key = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);
    clearReservedHours(room._id, key);
    fetchReservedHours(room._id, key, selectedVariant?.label).then((hours) => {
      if (!cancelled) {
        setReserved(hours);
        setSlotsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [step, room, selectedDate, selectedVariant]);

  useEffect(() => {
    if (!lock) return;
    if (lockNow < lock.expiresAtMs) return;

    setLock(null);
    lockRef.current = null;
    setSelectedHour(null);
    setLockError('Your hold on this time slot expired. Please pick a time again.');
    if (STEP_INDEX[step] > STEP_INDEX.schedule) setStep('schedule');
    if (room && selectedDate) {
      const key = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);
      clearReservedHours(room._id, key);
      fetchReservedHours(room._id, key, selectedVariant?.label).then((hours) => setReserved(hours));
    }
  }, [lockNow, lock]);

  useEffect(() => {
    if (!room) return;
    const cap = getPaxCapacity(selectedVariant?.pax);
    let message = '';
    if (!Number.isFinite(guestCount) || guestCount < 1) {
      message = 'Please enter at least 1 guest.';
    } else if (cap && guestCount > cap) {
      message = `This room accommodates up to ${cap} guest(s). Please reduce your pax or choose a bigger room.`;
    }
    setPaxError(message);
  }, [room, selectedVariant, guestCount]);

  useEffect(() => {
    setDownPaymentHours(1);
  }, [selectedDuration]);

  useEffect(() => {
    if (step !== 'payment' || !room || !selectedVariant || !selectedDate || selectedHour === null) return;
    let cancelled = false;

    async function init() {
      setPmIntent(null);
      setSelectedMethod(null);
      setPayError('');
      setPayErrorKind(null);
      setPayLoading(true);
      try {
        if (!paymongoPublicKey) {
          const cfgRes = await fetch(`${API_BASE_URL}/api/payments/paymongo/config`, { credentials: 'include' });
          const cfg = await cfgRes.json().catch(() => ({}));
          if (cfgRes.ok && cfg.publicKey && !cancelled) setPaymongoPublicKey(cfg.publicKey);
          if (cfgRes.ok && Array.isArray(cfg.paymentMethods) && !cancelled) setAllowedPaymentMethodKeys(cfg.paymentMethods);
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
            downPaymentHours,
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

        clearReservedHours(room._id, dateStr);
        clearMonthAvailability(room._id, y, m + 1);

        if (!cancelled) setPmIntent({ paymentIntentId: data.paymentIntentId, clientKey: data.clientKey, amount: data.amount });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setPayErrorKind('connectivity');
          setPayError(err.message || "We couldn't reach the payment provider. Please try again.");
        }
      } finally {
        if (!cancelled) setPayLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [step, room, selectedVariant, selectedDate, selectedHour, downPaymentHours]);

  function handleClose() {
    releaseCurrentLock();
    onClose();
  }

  function handleChooseOption(opt) {
    setSelectedVariant(opt);
  }

  function handleContinueFromPrice() {
    if (!selectedVariant) return;
    setViewDate(new Date());
    setStep('schedule');
  }

  function handleStepClick(targetKey) {
    const targetIndex = STEP_INDEX[targetKey] || 1;
    const currentIndex = STEP_INDEX[step] || 1;
    if (targetIndex >= currentIndex) return;
    setStep(targetKey);
  }

  function handleSelectDate(y, m, d) {
    releaseCurrentLock();
    setLockError('');
    setSelectedDate({ y, m, d });
    setSelectedHour(null);
    setSelectedDuration(minDuration);
  }

  function handleChangeDate() {
    releaseCurrentLock();
    setLockError('');
    setSelectedDate(null);
    setSelectedHour(null);
  }

  function handlePaxStep(delta) {
    const cap = getPaxCapacity(selectedVariant?.pax);
    setGuestCount((v) => {
      let next = (Number.isFinite(v) ? v : 1) + delta;
      next = Math.max(1, next);
      if (cap) next = Math.min(next, cap);
      return next;
    });
  }

  function handleSelectDuration(dur) {
    releaseCurrentLock();
    setLockError('');
    setSelectedDuration(dur);
    setSelectedHour(null);
  }

  async function handleSelectHour(hour) {
    const available = getAvailableRoomCount(reserved, Number(selectedVariant?.roomCount) || 1, hour);
    if (available <= 0 || lockLoading) return;

    setLockError('');
    setLockLoading(true);
    try {
      const { y, m, d } = selectedDate;
      const dateStr = dateKey(y, m, d);
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      const result = await bookingsService.lockSlot({
        roomId: room._id,
        variantLabel: selectedVariant?.label,
        date: dateStr,
        timeIn: timeStr,
        duration: selectedDuration,
      });
      setLock({ id: result.id, expiresAtMs: new Date(result.expiresAt).getTime() });
      setSelectedHour(hour);
    } catch (err) {
      console.error(err);
      setLockError(err.message || 'That time slot was just taken. Please choose another.');
      const key = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);
      clearReservedHours(room._id, key);
      fetchReservedHours(room._id, key, selectedVariant?.label).then((hours) => setReserved(hours));
    } finally {
      setLockLoading(false);
    }
  }

  function handleContinueFromSchedule() {
    if (selectedHour === null) return;
    setStep('details');
  }

  async function confirmBooking() {
    const trimmedName = guestName.trim();
    const trimmedContact = guestContact.trim();

    const nErr = trimmedName ? '' : 'Please enter your full name.';
    const cErr = trimmedContact ? '' : 'Please enter a phone number or email.';
    setNameError(nErr);
    setContactError(cErr);
    if (nErr || cErr || paxError) return;

    setConfirming(true);
    const user = await revalidate();
    setConfirming(false);

    if (!user) {
      alert('Your session has expired. Please log in again to complete your booking.');
      window.location.href = '/login';
      return;
    }
    setStep('review');
  }

  function proceedToPayment() {
    setStep('payment');
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

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

  const POLL_INTERVAL_MS = 2000;
  const POLL_MAX_ATTEMPTS = 90;

  function pollPaymentStatus(paymentIntentId, popup) {
    setStep('paymongoReturn');
    setPmReturn({ phase: 'loading', booking: null });

    let attempts = 0;
    stopPolling();
    pollRef.current = setInterval(async () => {
      attempts += 1;
      let paid = false;
      let paidBookingId = null;
      let slotUnavailableMsg = null;
      try {
        const res = await fetch(`${API_BASE_URL}/api/payments/paymongo/status/${encodeURIComponent(paymentIntentId)}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.status === 'paid_slot_unavailable') {
          slotUnavailableMsg = data.message || "Your payment succeeded, but this slot was just taken. Please contact support so we can help resolve it.";
        } else {
          paid = res.ok && data.paymentStatus === 'Paid';
          paidBookingId = data.bookingId || null;
        }
      } catch (err) {
        console.error(err);
      }

      if (slotUnavailableMsg) {
        stopPolling();
        if (popup && !popup.closed) popup.close();
        setPmReturn({ phase: 'paidSlotUnavailable', booking: null, message: slotUnavailableMsg });
        return;
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
        setStep('payment');
        setPayErrorKind('declined');
        setPayError('Payment was not completed. Please try again.');
        return;
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setPmReturn({ phase: 'pending', booking: null });
      }
    }, POLL_INTERVAL_MS);
  }

  function openPopupAndPoll(redirectUrl, paymentIntentId) {
    const popup = window.open(redirectUrl, 'paymongo_pay', 'width=480,height=760');
    if (!popup) {
      window.location.href = redirectUrl;
      return;
    }
    pollPaymentStatus(paymentIntentId, popup);
  }

  function pollStatusOnly(paymentIntentId) {
    pollPaymentStatus(paymentIntentId, null);
  }

  async function attachAndHandle(body) {
    setPayError('');
    setPayErrorKind(null);
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
        setPayErrorKind('paidSlotUnavailable');
        setPayError(data.message || 'Your payment succeeded, but this slot was just taken. Please contact support.');
        return;
      }
      setPayErrorKind('declined');
      setPayError(data.message || 'That payment method was declined. Please try another.');
    } catch (err) {
      console.error(err);
      setPayErrorKind('connectivity');
      setPayError(err.message || "We couldn't reach the payment provider. Please try again.");
    } finally {
      setPayLoading(false);
    }
  }

  function handleSelectMethod(key) {
    if (!pmIntent || payLoading) return;
    setSelectedMethod(key);
    setPayError('');
    setPayErrorKind(null);
  }

  function handleConfirmWalletPay() {
    if (!pmIntent || payLoading || !selectedMethod || selectedMethod === 'card') return;
    attachAndHandle({ paymentMethodType: selectedMethod });
  }

  async function handlePayCard(e) {
    e.preventDefault();
    if (!pmIntent || payLoading) return;

    const digits = cardNumber.replace(/\s+/g, '');
    const [mm, yyRaw] = cardExpiry.split('/').map((s) => (s || '').trim());
    const yy = yyRaw && yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
    if (!digits || digits.length < 12 || !mm || !yy || !cardCvc) {
      setPayErrorKind('declined');
      setPayError('Please enter a valid card number, expiry (MM/YY), and CVC.');
      return;
    }
    if (!paymongoPublicKey) {
      setPayErrorKind('connectivity');
      setPayError('Payment is still initializing — please wait a moment and try again.');
      return;
    }

    setPayError('');
    setPayErrorKind(null);
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
        setPayErrorKind('declined');
        throw new Error(data?.errors?.[0]?.detail || 'Card could not be verified. Please check the details and try again.');
      }
      await attachAndHandle({ paymentMethodId: data.data.id });
    } catch (err) {
      console.error(err);
      if (!payErrorKind) setPayErrorKind('connectivity');
      setPayError(err.message || 'Card could not be verified. Please check the details and try again.');
      setPayLoading(false);
    }
  }

  function handleRetryPayment() {
    setPayError('');
    setPayErrorKind(null);
    setPmIntent(null);
    setSelectedMethod(null);
  }

  function handleDone() {
    releaseCurrentLock();
    onClose();
  }

  function buildCalendarDays() {
    if (!room) return { firstDay: 0, days: [] };
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(y, m, d);
      const dStr = dateKey(y, m, d);
      const isToday = thisDate.getTime() === today.getTime();
      const holiday = isHolidayDate(dStr, settings?.holidays);
      const closedDay = !isOperatingDay(thisDate, settings?.operatingHours);
      const past = thisDate < today;

      const freeHours = getFreeHourCount(monthBookings[dStr], openHour, closeHour, totalRooms);
      const fullyBooked = freeHours === 0;
      const nearlyFull = !fullyBooked && freeHours <= 2;
      const unavailable = holiday || closedDay;
      const blocked = unavailable || fullyBooked;

      let variant = null;
      let title = '';
      if (!past) {
        if (unavailable) {
          variant = 'unavailable';
          title = holiday ? 'Closed for a holiday/closure' : 'Closed on this day of the week';
        } else if (fullyBooked) {
          variant = 'full';
          title = 'Fully booked for this room';
        } else if (nearlyFull) {
          variant = 'few';
          title = `Only ${freeHours} open hour${freeHours === 1 ? '' : 's'} left today`;
        } else {
          variant = 'available';
        }
      }

      days.push({ d, y, m, isToday, disabled: past || blocked, variant, title, holiday: !past && holiday });
    }
    return { firstDay, days };
  }

  const priceItems = room ? priceOptionsFor(room) : [];
  const { firstDay, days: calendarDays } = step === 'schedule' ? buildCalendarDays() : { firstDay: 0, days: [] };
  const cap = getPaxCapacity(selectedVariant?.pax);

  const selectedDateLabel = selectedDate
    ? `${WEEKDAYS[new Date(selectedDate.y, selectedDate.m, selectedDate.d).getDay()]}, ${MONTHS[selectedDate.m]} ${selectedDate.d}`
    : '';
  const selectedOptionLabel = selectedVariant ? `${selectedVariant.label} · ₱${selectedVariant.price}/hr` : '';
  const startTimeLabel = selectedHour !== null ? formatHour(selectedHour) : '—';
  const endTimeLabel = selectedHour !== null ? formatHour(selectedHour + selectedDuration) : '—';
  const durationLabel = `${selectedDuration} hour${selectedDuration === 1 ? '' : 's'}`;

  const reviewDateLabel = selectedDate
    ? `${MONTHS[selectedDate.m]} ${selectedDate.d}, ${selectedDate.y} (${WEEKDAYS[new Date(selectedDate.y, selectedDate.m, selectedDate.d).getDay()]})`
    : '—';
  const subtotalAmount = selectedVariant ? selectedVariant.price * selectedDuration : 0;
  const downPaymentAmount = selectedVariant ? Math.max(0, Math.round(selectedVariant.price * downPaymentHours)) : 0;
  const remainingBalanceAmount = Math.max(0, subtotalAmount - downPaymentAmount);
  const downPaymentPresets = Array.from({ length: Math.max(1, selectedDuration || 1) }, (_, i) => i + 1);
  const visiblePaymentMethods = allowedPaymentMethodKeys
    ? PAYMENT_METHODS.filter((m) => allowedPaymentMethodKeys.includes(m.key))
    : PAYMENT_METHODS;

  const showSummaryPanel = room && step !== 'paymongoReturn';

  const payOnArrivalEnabled = !!settings?.paymentSettings?.payOnArrivalEnabled;
  const contactMessengerUrl = settings?.contact?.messengerUrl;
  const contactPhone = settings?.contact?.phone;

  return (
    <div className={`bk-overlay${open ? ' open' : ''}`} id="booking-modal">
      <div className={'bk-modal' + (showSummaryPanel ? '' : ' bk-modal--compact')}>
        <button className="bk-close" aria-label="Close" onClick={handleClose}>✕</button>

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

        {step !== 'paymongoReturn' && <BookingStepper step={step} onStepClick={handleStepClick} />}

        {lock && step !== 'price' && step !== 'paymongoReturn' && (() => {
          const remainingMs = Math.max(0, lock.expiresAtMs - lockNow);
          const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
          const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
          return (
            <div className="bk-lock-banner">
              <i className="fa-solid fa-lock"></i>
              We're holding this time slot for you — complete your booking within {mm}:{ss} or it will be released.
            </div>
          );
        })()}

        {showSummaryPanel && (
          <button
            type="button"
            className={`bk-summary-toggle${mobileSummaryOpen ? ' bk-summary-toggle--open' : ''}`}
            onClick={() => setMobileSummaryOpen((v) => !v)}
            aria-expanded={mobileSummaryOpen}
          >
            <span>
              Booking Summary
              {selectedVariant && (
                <span className="bk-summary-toggle-price"> · ₱{subtotalAmount.toLocaleString()}</span>
              )}
            </span>
            <i className="fa-solid fa-chevron-down bk-summary-toggle-chevron"></i>
          </button>
        )}

        {showSummaryPanel && mobileSummaryOpen && (
          <div className="bk-summary-panel-mobile" aria-live="polite">
            <BookingSummaryContents
              room={room}
              selectedVariant={selectedVariant}
              selectedDate={selectedDate}
              selectedHour={selectedHour}
              selectedDuration={selectedDuration}
              guestName={guestName}
              guestContact={guestContact}
              guestCount={guestCount}
              guestNote={guestNote}
              selectedMethod={selectedMethod}
              subtotal={subtotalAmount}
              downPayment={downPaymentAmount}
              remainingBalance={remainingBalanceAmount}
              step={step}
              onContinue={handleContinueFromPrice}
              continueDisabled={!selectedVariant}
            />
          </div>
        )}

        <div className="bk-content">
          <div className="bk-body">
            {step === 'price' && room && (
              <div className="bk-step" id="bkStepPrice">
                <p className="bk-choose-label bk-choose-label--heading bk-choose-label--tight">Choose a room</p>
                <p className="bk-choose-label bk-choose-label--sub">Select the room you want to book.</p>
                <div className={'bk-room-list' + (selectedVariant ? ' bk-room-list--has-selection' : '')} id="bkPriceList">
                  {priceItems.map((opt, i) => {
                    const isSelected =
                      !!selectedVariant && selectedVariant.label === opt.label && selectedVariant.price === opt.price;

                    return (
                      <RoomOptionCard
                        key={i}
                        option={opt}
                        room={room}
                        selected={isSelected}
                        onSelect={() => handleChooseOption(opt)}
                      />
                    );
                  })}
                </div>

                <p className="bk-info-bar">
                  <i className="fa-solid fa-circle-info"></i>
                  You can review your booking details before completing the payment.
                </p>
              </div>
            )}

            {step === 'schedule' && room && selectedVariant && (
              <div className="bk-step" id="bkStepSchedule">
                <button className="bk-back" onClick={() => setStep('price')}>
                  <i className="fa-solid fa-arrow-left"></i> Back to pricing
                </button>

                <p className="bk-selected-option-pill">{selectedOptionLabel}</p>

                {!selectedDate && (
                  <>
                    <p className="bk-choose-label bk-choose-label--heading">When would you like to book?</p>
                    <div className="bk-calendar-block">
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

                      {calendarLoading ? (
                        <div className="bk-skeleton-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                          {Array.from({ length: 35 }).map((_, i) => (
                            <div key={i} className="bk-skeleton-block bk-skeleton-tile" style={{ aspectRatio: '1', height: 'auto' }} />
                          ))}
                        </div>
                      ) : (
                        <div className="bk-grid" id="bkCalGrid" key={`${viewDate.getFullYear()}-${viewDate.getMonth()}`}>
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
                                (day.variant === 'unavailable' ? ' bk-day--unavailable' : '') +
                                (day.holiday ? ' bk-day--holiday' : '')
                              }
                              title={day.title || undefined}
                              tabIndex={day.disabled ? undefined : 0}
                              role="button"
                              aria-disabled={day.disabled || undefined}
                              onClick={!day.disabled ? () => handleSelectDate(day.y, day.m, day.d) : undefined}
                              onKeyDown={!day.disabled ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectDate(day.y, day.m, day.d); } : undefined}
                            >
                              <span className="bk-day-num">{day.d}</span>
                              {day.holiday && <span className="bk-day-holiday-badge">Holiday</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bk-legend">
                      <span><i className="bk-dot bk-dot--available"></i> Available</span>
                      <span><i className="bk-dot bk-dot--few"></i> Few slots</span>
                      <span><i className="bk-dot bk-dot--full"></i> Fully booked</span>
                      <span><i className="bk-dot bk-dot--unavailable"></i> Unavailable</span>
                    </div>
                  </>
                )}

                {selectedDate && (
                  <>
                    <div className="bk-selected-date-recap">
                      <div>
                        <p className="bk-selected-date-recap-label">Selected Booking Date</p>
                        <p className="bk-selected-date-recap-value">{selectedDateLabel}</p>
                      </div>
                      <button className="bk-change-date-btn" onClick={handleChangeDate}>
                        <i className="fa-solid fa-calendar"></i> Change date
                      </button>
                    </div>

                    <div className="bk-duration-picker">
                      <span>Duration (Maximum {maxDuration} hours)</span>
                      <div className="bk-duration-options" id="bkDurationOptions">
                        {Array.from({ length: maxDuration - minDuration + 1 }, (_, i) => i + minDuration).map((dur) => (
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

                    <p className="bk-choose-label">Available Time — only open, unbooked times are shown.</p>

                    {lockError && (
                      <p className="bk-lock-error">
                        <i className="fa-solid fa-circle-exclamation"></i> {lockError}
                      </p>
                    )}

                    {(() => {
                      const latestStart = getLatestStartTime(openHour, closeHour, selectedDuration);
                      const helperText = latestStart !== null
                        ? `For a ${selectedDuration}-hour booking, the latest available start time is ${formatHour(latestStart)}. Later start times would extend beyond our ${formatHour(closeHour)} closing time.`
                        : `A ${selectedDuration}-hour booking doesn't fit within today's operating hours (closes at ${formatHour(closeHour)}).`;
                      return <p className="bk-slot-helper-msg">{helperText}</p>;
                    })()}

                    {slotsLoading ? (
                      <div className="bk-skeleton-grid">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="bk-skeleton-block bk-skeleton-tile" />
                        ))}
                      </div>
                    ) : (
                      (() => {
                        const now = new Date();
                        const isToday =
                          selectedDate.y === now.getFullYear() &&
                          selectedDate.m === now.getMonth() &&
                          selectedDate.d === now.getDate();
                        const currentHour = now.getHours();

                        const groups = { Morning: [], Afternoon: [], Evening: [] };
                        let anyAvailable = false;
                        for (let h = openHour; h < closeHour; h++) {
                          if (isToday && h <= currentHour) continue;

                          const state = getSlotState(h, selectedDuration, closeHour, reserved, totalRooms);
                          const fits = state === 'available' && !lockLoading;
                          if (state === 'available') anyAvailable = true;

                          let slotStatusLabel;
                          let slotStatusColor;
                          if (state === 'booked') {
                            slotStatusLabel = 'Booked';
                          } else if (state === 'insufficient') {
                            const remaining = closeHour - h;
                            slotStatusLabel = `Only ${remaining} Hour${remaining === 1 ? '' : 's'} Remaining`;
                          } else {
                            const availableCount = getAvailableRoomCount(reserved, totalRooms, h);
                            const isFewLeft = availableCount <= 2 && availableCount < totalRooms;
                            slotStatusLabel = isFewLeft
                              ? `Only ${availableCount} of ${totalRooms} Left`
                              : `${availableCount} of ${totalRooms} Available`;
                            slotStatusColor = isFewLeft ? '#d97706' : '#16a34a';
                          }

                          groups[getTimePeriod(h)].push(
                            <div
                              key={h}
                              className={
                                'bk-slot' +
                                (state === 'booked' ? ' bk-slot--reserved' : '') +
                                (state === 'insufficient' ? ' bk-slot--insufficient' : '') +
                                (selectedHour !== null && h >= selectedHour && h < selectedHour + selectedDuration
                                  ? ' bk-slot--selected'
                                  : '')
                              }
                              onClick={fits ? () => handleSelectHour(h) : undefined}
                              tabIndex={fits ? 0 : undefined}
                              role="button"
                              onKeyDown={fits ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectHour(h); } : undefined}
                            >
                              <span className="bk-slot-time">{formatHour(h)}</span>
                              <span className="bk-slot-status" style={slotStatusColor ? { color: slotStatusColor } : undefined}>{slotStatusLabel}</span>
                            </div>
                          );
                        }

                        return (
                          <>
                            {!anyAvailable && (
                              <div className="bk-no-slots-msg">
                                <i className="fa-solid fa-circle-exclamation"></i>
                                No {selectedDuration}-hour slots are available on {selectedDateLabel}. Try a shorter duration or{' '}
                                <button type="button" className="bk-no-slots-change-date" onClick={handleChangeDate}>
                                  pick another date
                                </button>.
                              </div>
                            )}
                            {Object.entries(groups).map(([period, slots]) => (
                              slots.length > 0 && (
                                <div className="bk-slot-group" key={period}>
                                  <span className="bk-slot-group-label">{period}</span>
                                  <div className="bk-slots-grid">{slots}</div>
                                </div>
                              )
                            ))}
                          </>
                        );
                      })()
                    )}

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

                    <div className="bk-detail-actions">
                      <button className="bk-confirm bk-continue" disabled={selectedHour === null} onClick={handleContinueFromSchedule}>
                        Continue <i className="fa-solid fa-arrow-right"></i>
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 'details' && room && selectedVariant && selectedDate && selectedHour !== null && (
              <div className="bk-step" id="bkStepDetails">
                <p className="bk-choose-label bk-choose-label--heading">Your Information</p>

                <div className="bk-guest-fields">
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestName">Full Name</label>
                    <input
                      type="text"
                      id="bkGuestName"
                      className={`bk-field-input${nameError ? ' bk-field-input--error' : ''}`}
                      placeholder="Juan Dela Cruz"
                      value={guestName}
                      onChange={(e) => { setGuestName(e.target.value); if (nameError) setNameError(''); }}
                    />
                    {nameError && (
                      <p className="bk-field-error"><i className="fa-solid fa-circle-exclamation"></i> {nameError}</p>
                    )}
                  </div>
                  <div className="bk-field">
                    <label className="bk-field-label" htmlFor="bkGuestContact">Phone Number or Email</label>
                    <input
                      type="text"
                      id="bkGuestContact"
                      className={`bk-field-input${contactError ? ' bk-field-input--error' : ''}`}
                      placeholder="09xx xxx xxxx or you@email.com"
                      value={guestContact}
                      onChange={(e) => { setGuestContact(e.target.value); if (contactError) setContactError(''); }}
                    />
                    {contactError && (
                      <p className="bk-field-error"><i className="fa-solid fa-circle-exclamation"></i> {contactError}</p>
                    )}
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
                    {paxError && (
                      <p className="bk-field-error" id="bkGuestCountError"><i className="fa-solid fa-circle-exclamation"></i> {paxError}</p>
                    )}
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
                  <button className="bk-back-btn" onClick={() => setStep('schedule')}>
                    <i className="fa-solid fa-arrow-left"></i> Back
                  </button>
                  <button className="bk-confirm bk-continue" id="bkConfirm" disabled={confirming} onClick={confirmBooking}>
                    Continue <i className="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
              </div>
            )}

            {step === 'review' && room && selectedVariant && selectedDate && selectedHour !== null && (
              <div className="bk-step" id="bkStepReview">
                <button className="bk-back" onClick={() => setStep('details')}>
                  <i className="fa-solid fa-arrow-left"></i> Back to details
                </button>

                <p className="bk-choose-label bk-choose-label--heading">Review your reservation</p>

                <div className="bk-review-section">
                  <p className="bk-review-section-title">Room Information</p>
                  <div className="bk-review-card">
                    <div className="bk-review-room">
                      <div className="bk-review-room-img">
                        <img
                          src={selectedVariant.image ? resolveImageUrl(selectedVariant.image) : fallbackRoomImg}
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
                  </div>
                </div>

                <div className="bk-review-section">
                  <p className="bk-review-section-title">Booking Schedule</p>
                  <div className="bk-review-card">
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-calendar-days"></i> Booking Date</span>
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
                  </div>
                </div>

                <div className="bk-review-section">
                  <p className="bk-review-section-title">Guest Information</p>
                  <div className="bk-review-card">
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-user"></i> Name</span>
                      <span className="bk-sr-value">{guestName || '—'}</span>
                    </div>
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-phone"></i> Contact</span>
                      <span className="bk-sr-value">{guestContact || '—'}</span>
                    </div>
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-users"></i> Guests (Pax)</span>
                      <span className="bk-sr-value">{guestCount || 1}</span>
                    </div>
                  </div>
                </div>

                {guestNote && (
                  <div className="bk-review-section">
                    <p className="bk-review-section-title">Special Requests</p>
                    <div className="bk-review-card">
                      <p className="bk-sr-value" style={{ textAlign: 'left' }}>{guestNote}</p>
                    </div>
                  </div>
                )}

                <div className="bk-review-section">
                  <p className="bk-review-section-title">Payment Breakdown</p>
                  <div className="bk-review-cost">
                    <div className="bk-review-cost-row">
                      <span>Subtotal ({durationLabel})</span>
                      <span>₱{subtotalAmount.toLocaleString()}</span>
                    </div>
                    <div className="bk-review-cost-row bk-review-cost-row--accent">
                      <span>Downpayment ({downPaymentHours} hour{downPaymentHours === 1 ? '' : 's'})</span>
                      <span>₱{downPaymentAmount.toLocaleString()}</span>
                    </div>
                    <div className="bk-review-cost-row bk-review-cost-row--balance">
                      <span>Remaining Balance</span>
                      <span>₱{remainingBalanceAmount.toLocaleString()}</span>
                    </div>
                    <p className="bk-review-note">You'll choose your exact downpayment amount on the next step. The remaining balance is paid upon arrival.</p>
                  </div>
                </div>

                <div className="bk-review-section">
                  <p className="bk-review-section-title">Booking Policies</p>
                  <div className="bk-review-card">
                    <p className="bk-review-note" style={{ marginTop: 0 }}>
                      Only available times are shown above. Need assistance? We're happy to help before you pay.
                    </p>
                  </div>
                </div>

                <div className="bk-review-section">
                  <p className="bk-review-section-title">Cancellation Reminder</p>
                  <div className="bk-review-card bk-review-card--warning">
                    <p className="bk-review-note" style={{ marginTop: 0 }}>
                      Please review your details carefully. Cancellations and rescheduling are subject to our booking policy — reach out to us before paying if anything above needs to change.
                    </p>
                  </div>
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

            {step === 'payment' && room && selectedVariant && (
              <div className="bk-step" id="bkStepPayment">
                <div className="bk-slots-head">
                  <h3>Payment</h3>
                </div>

                <div className="bk-downpayment-card">
                  <span className="bk-downpayment-card-dot" aria-hidden="true"></span>
                  <p className="bk-summary-label">Downpayment Amount</p>
                  <p className="bk-downpayment-amount">
                    ₱{downPaymentAmount.toLocaleString()}
                  </p>
                  <p className="bk-downpayment-duration">({downPaymentHours} hour{downPaymentHours === 1 ? '' : 's'}) — this secures your reservation.</p>
                </div>

                <div className="bk-payment-methods">
                  <span className="bk-payment-methods-label">Choose Downpayment</span>
                  <div className="bk-payment-methods-grid">
                    {downPaymentPresets.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className={
                          'bk-payment-method-tile' +
                          (downPaymentHours === h ? ' bk-payment-method-tile--selected' : '') +
                          (payLoading ? ' bk-payment-method-tile--disabled' : '')
                        }
                        disabled={payLoading}
                        onClick={() => setDownPaymentHours(h)}
                      >
                        <span>{h} hr{h === 1 ? '' : 's'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {!pmIntent && !payError ? (
                  <div className="bk-payment-methods">
                    <span className="bk-payment-methods-label">Preparing secure payment…</span>
                    <div className="bk-skeleton-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bk-skeleton-block bk-skeleton-tile" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bk-payment-methods">
                    <span className="bk-payment-methods-label">Select Payment Method</span>
                    <div className="bk-payment-methods-grid">
                      {visiblePaymentMethods.map((m) => (
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
                )}

                {selectedMethod && selectedMethod !== 'card' && (
                  <p className="bk-payment-redirect-note">You will be redirected to complete your payment securely.</p>
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

                {payError && payErrorKind === 'connectivity' && (
                  <div className="bk-payment-fallback" role="alert">
                    <div className="bk-payment-fallback-head">
                      <i className="fa-solid fa-triangle-exclamation bk-payment-fallback-icon"></i>
                      <div>
                        <p className="bk-payment-fallback-title">We couldn't reach our payment provider</p>
                        <p className="bk-payment-fallback-desc">{payError} Your reservation hasn't been charged. You can retry, or reach us directly and we'll help you complete it.</p>
                      </div>
                    </div>
                    <div className="bk-payment-fallback-actions">
                      <button type="button" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary" onClick={handleRetryPayment}>
                        <i className="fa-solid fa-rotate-right"></i> Retry Payment
                      </button>
                      {contactMessengerUrl && (
                        <a href={contactMessengerUrl} target="_blank" rel="noreferrer" className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost">
                          <i className="fa-brands fa-facebook-messenger"></i> Message Us
                        </a>
                      )}
                      {contactPhone && (
                        <a href={`tel:${contactPhone}`} className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost">
                          <i className="fa-solid fa-phone"></i> Call the Business
                        </a>
                      )}
                      {payOnArrivalEnabled && (
                        <button type="button" className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost" onClick={() => setStep('review')}>
                          <i className="fa-solid fa-door-open"></i> Pay On Arrival
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {payError && payErrorKind === 'paidSlotUnavailable' && (
                  <div className="bk-payment-fallback" role="alert">
                    <div className="bk-payment-fallback-head">
                      <i className="fa-solid fa-triangle-exclamation bk-payment-fallback-icon"></i>
                      <div>
                        <p className="bk-payment-fallback-title">We couldn't secure your reservation</p>
                        <p className="bk-payment-fallback-desc">{payError} Your card or wallet was already charged — please don't pay again. Reach out and we'll sort this out or refund you.</p>
                      </div>
                    </div>
                    <div className="bk-payment-fallback-actions">
                      {contactMessengerUrl && (
                        <a href={contactMessengerUrl} target="_blank" rel="noreferrer" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary">
                          <i className="fa-brands fa-facebook-messenger"></i> Message Us
                        </a>
                      )}
                      {contactPhone && (
                        <a href={`tel:${contactPhone}`} className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost">
                          <i className="fa-solid fa-phone"></i> Call the Business
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {payError && payErrorKind !== 'connectivity' && payErrorKind !== 'paidSlotUnavailable' && (
                  <p style={{ display: 'block', fontSize: '.8rem', color: '#e2554b', marginTop: 10 }}>
                    <i className="fa-solid fa-circle-exclamation"></i> {payError}
                  </p>
                )}

                <div className="bk-detail-actions">
                  <button className="bk-back-btn" onClick={() => setStep('review')}>
                    <i className="fa-solid fa-arrow-left"></i> Back
                  </button>
                  <button
                    type={selectedMethod === 'card' ? 'submit' : 'button'}
                    form={selectedMethod === 'card' ? 'bkCardForm' : undefined}
                    className="bk-confirm bk-continue"
                    disabled={payLoading || !pmIntent || !selectedMethod || payErrorKind === 'paidSlotUnavailable'}
                    onClick={selectedMethod === 'card' ? undefined : handleConfirmWalletPay}
                  >
                    {payLoading ? 'Processing…' : 'Pay Now'}
                  </button>
                </div>
              </div>
            )}

            {step === 'paymongoReturn' && (
              <div className="bk-step" id="bkStepPaymongoReturn">
                {pmReturn.phase === 'confirmed' ? (
                  <BookingSuccess
                    booking={pmReturn.booking}
                    room={room}
                    selectedVariant={selectedVariant}
                    onDone={handleDone}
                    onViewBooking={onViewBooking}
                  />
                ) : pmReturn.phase === 'paidSlotUnavailable' ? (
                  <div className="bk-payment-fallback" role="alert">
                    <div className="bk-payment-fallback-head">
                      <i className="fa-solid fa-triangle-exclamation bk-payment-fallback-icon"></i>
                      <div>
                        <p className="bk-payment-fallback-title">We couldn't secure your reservation</p>
                        <p className="bk-payment-fallback-desc">{pmReturn.message} Your card or wallet was already charged — please don't pay again. Reach out and we'll sort this out or refund you.</p>
                      </div>
                    </div>
                    <div className="bk-payment-fallback-actions">
                      {contactMessengerUrl && (
                        <a href={contactMessengerUrl} target="_blank" rel="noreferrer" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary">
                          <i className="fa-brands fa-facebook-messenger"></i> Message Us
                        </a>
                      )}
                      {contactPhone && (
                        <a href={`tel:${contactPhone}`} className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost">
                          <i className="fa-solid fa-phone"></i> Call the Business
                        </a>
                      )}
                    </div>
                    <button className="bk-done" onClick={handleDone}>Done</button>
                  </div>
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

          {showSummaryPanel && (
            <div className="bk-summary-panel" aria-live="polite">
              <BookingSummaryContents
                room={room}
                selectedVariant={selectedVariant}
                selectedDate={selectedDate}
                selectedHour={selectedHour}
                selectedDuration={selectedDuration}
                guestName={guestName}
                guestContact={guestContact}
                guestCount={guestCount}
                guestNote={guestNote}
                selectedMethod={selectedMethod}
                subtotal={subtotalAmount}
                downPayment={downPaymentAmount}
                remainingBalance={remainingBalanceAmount}
                step={step}
                onContinue={handleContinueFromPrice}
                continueDisabled={!selectedVariant}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BookingModal;