import { Fragment, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { facilityImage } from '../utils/facilityImage';
import RoomOptionCard from './RoomOptionCard';
import { bookingsService } from '../services/bookings';
import { useCountdownClock } from '../hooks/useCountdownClock';
import { useToast } from '../hooks/useToast';
import { formatHour, openBookingReceipt } from '../utils/receipt';
import {
  dateKey,
  getPaxCapacity,
  fetchReservedHours,
  clearReservedHours,
  loadMonthAvailability,
  clearMonthAvailability,
  getAvailableRoomCountForDuration,
  isHolidayDate,
  holidayReason,
  isOperatingDay,
  priceOptionsFor,
  isHourBooked,
  canBookDuration,
  getSlotState,
  buildHourCounts,
  getDayAvailability,
  getTimePeriod,
} from '../utils/rooms';
import { CORKAGE_FEE, calculateBookingPrice, effectiveDiscountPercent, variantRateLabel } from '../utils/roomPricing';
import { API_BASE_URL } from '../services/api';
import { terminalPaymentFailure } from '../utils/paymongoStatus';
import { ArrowLeft, X } from 'lucide-react';
import ModalPortal from './ModalPortal';
import Toast from './Toast';
import { buildLoginPath, buildRoomReservationPath } from '../utils/auth';
import { businessDate } from '../utils/businessDate';
import { slotBookingFields, slotStartMs } from '../utils/bookingHours';

const PAYMONGO_API_BASE = import.meta.env.VITE_PAYMONGO_API_BASE || 'https://api.paymongo.com/v1';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const STEPS = [
  { key: 'price', label: 'Room' },
  { key: 'schedule', label: 'Date & Time' },
  { key: 'details', label: 'Details' },
  { key: 'payment', label: 'Payment' },
];
const STEP_INDEX = { price: 1, schedule: 2, details: 3, payment: 4 };

const PAYMENT_METHODS = [
  { key: 'gcash', label: 'GCash', description: 'Mobile wallet', icon: 'fa-solid fa-wallet' },
  { key: 'paymaya', label: 'Maya', description: 'Mobile wallet', icon: 'fa-solid fa-money-bill-wave' },
  { key: 'qrph', label: 'QR Ph', description: 'Scan with a QR Ph app', icon: 'fa-solid fa-qrcode' },
  { key: 'card', label: 'Credit / Debit Card', description: 'Visa or Mastercard', icon: 'fa-solid fa-credit-card' },
];

function BookingStepper({ step, onStepClick, steps = STEPS }) {
  const activeIndex = Math.max(0, steps.findIndex((item) => item.key === step)) + 1;
  const activeLabel = steps[activeIndex - 1]?.label || steps[0]?.label || '';
  return (
    <div className="bk-stepper">
      <div className="bk-stepper-status" aria-live="polite">
        <span>Step {activeIndex} of {steps.length}</span>
        <strong>{activeLabel}</strong>
      </div>
      <div className="bk-stepper-progress" aria-hidden="true">
        <span style={{ width: `${(activeIndex / steps.length) * 100}%` }} />
      </div>
      <div className="bk-stepper-steps">
        {steps.map((s, i) => {
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
    </div>
  );
}

function BookingSummaryContents({
  room, selectedVariant, selectedDate, selectedHour, selectedDuration,
  guestName, guestContact, guestCount, guestNote, hasCorkage,
  selectedMethod, subtotal, downPayment, remainingBalance,
  priceBreakdown, paymentChoice,
  step,
}) {
  if (!room) return null;

  const image = facilityImage(selectedVariant?.image, room.name, selectedVariant?.label, room.image);
  const serviceDate = selectedDate ? dateKey(selectedDate.y, selectedDate.m, selectedDate.d) : null;
  const bookingDate = serviceDate && selectedHour !== null ? slotBookingFields(serviceDate, selectedHour).date : serviceDate;
  const [bookingYear, bookingMonth, bookingDay] = bookingDate ? bookingDate.split('-').map(Number) : [];
  const dateLabel = bookingDate ? `${MONTHS[bookingMonth - 1]} ${bookingDay}, ${bookingYear}` : null;
  const timeLabel = selectedHour !== null
    ? `${formatHour(selectedHour)} – ${formatHour(selectedHour + selectedDuration)}${selectedHour + selectedDuration >= 24 && selectedHour < 24 ? ' next day' : ''}`
    : null;
  const durationLabel = `${selectedDuration} hour${selectedDuration === 1 ? '' : 's'}`;
  const methodLabel = PAYMENT_METHODS.find((m) => m.key === selectedMethod)?.label;
  const isPriceStep = step === 'price';
  const showGuestInformation = step === 'details' || step === 'payment';
  const estimatedTotal = isPriceStep && selectedHour !== null ? subtotal : 0;
  const estimatedHours = isPriceStep && selectedHour !== null ? selectedDuration : 0;

  return (
    <>
      <div className="bk-summary-panel-title-row">
        <span className="bk-summary-panel-title-icon"><i className="fa-solid fa-calendar-days"></i></span>
        <span className="bk-summary-panel-title">Reservation Summary</span>
      </div>

      <div className="bk-summary-panel-section">
        {selectedVariant ? (
          <div className="bk-summary-panel-room">
            <div className="bk-summary-panel-img">
              {image ? <img src={image} alt={selectedVariant.label} /> : <span className="facility-name-placeholder">{selectedVariant.label}</span>}
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
                <span className="bk-summary-panel-row-value">{variantRateLabel(selectedVariant)}</span>
              </div>
            </div>
          )}

          <div className="bk-summary-panel-section">
            <div className="bk-summary-panel-stat">
              <span className="bk-summary-panel-stat-head"><i className="fa-solid fa-calendar-days"></i> Selected Reservation Date &amp; Time</span>
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
        </>
      ) : (
        <>
          <div className="bk-summary-panel-section">
            <span className="bk-summary-panel-section-label">Schedule</span>
            {!dateLabel && (
              <p className="bk-summary-panel-empty"><i className="fa-solid fa-calendar"></i> Select a reservation date.</p>
            )}
            {dateLabel && !timeLabel && (
              <p className="bk-summary-panel-empty"><i className="fa-solid fa-clock"></i> Choose an available time slot.</p>
            )}
            {dateLabel && (
              <div className="bk-summary-panel-list">
                <div className="bk-summary-panel-row">
                  <span className="bk-summary-panel-row-label"><i className="fa-solid fa-calendar-days"></i> Reservation Date</span>
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

          {showGuestInformation && (
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
                {hasCorkage && (
                  <div className="bk-summary-panel-row">
                    <span className="bk-summary-panel-row-label"><i className="fa-solid fa-bag-shopping"></i> Add-on</span>
                    <span className="bk-summary-panel-row-value">Outside food/drinks · ₱{CORKAGE_FEE}</span>
                  </div>
                )}
              </div>
            </div>
          )}

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
                  <span>{variantRateLabel(selectedVariant)}</span>
                </div>
                {timeLabel && <div className="bk-summary-panel-cost-row"><span>Room charge</span><span>₱{priceBreakdown.roomCharge.toLocaleString()}</span></div>}
                {timeLabel && hasCorkage && (
                  <div className="bk-summary-panel-cost-row">
                    <span>Corkage</span>
                    <span>₱{CORKAGE_FEE.toLocaleString()}</span>
                  </div>
                )}
                {timeLabel && priceBreakdown.addOns.map((service) => (
                  <div className="bk-summary-panel-cost-row" key={service.name}>
                    <span>{service.name}</span>
                    <span>₱{Number(service.fee).toLocaleString()}</span>
                  </div>
                ))}
                {timeLabel && priceBreakdown.discountAmount > 0 && (
                  <div className="bk-summary-panel-cost-row">
                    <span>Pay-in-full discount ({priceBreakdown.discountPercent}%)</span>
                    <span>−₱{priceBreakdown.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                {timeLabel && (
                  <>
                    <div className="bk-summary-panel-cost-row">
                      <span>Total charge ({durationLabel})</span>
                      <span>₱{subtotal.toLocaleString()}</span>
                    </div>
                    <div className="bk-summary-panel-cost-row bk-summary-panel-cost-row--accent">
                      <span>{selectedDuration === 1 ? '1-hour reservation payment due now' : paymentChoice === 'deposit' ? '1-hour down payment due now' : 'Full payment due now'}</span>
                      <span>₱{downPayment.toLocaleString()}</span>
                    </div>
                    <div className="bk-summary-panel-cost-row bk-summary-panel-cost-row--total">
                      <span>Balance remaining at venue</span>
                      <span>₱{remainingBalance.toLocaleString()}</span>
                    </div>
                  </>
                )}
              </div>
              {timeLabel ? (
                <p className="bk-summary-panel-note">{paymentChoice === 'deposit'
                  ? `${selectedDuration === 1 ? 'Your one-hour payment' : 'Your down payment'} confirms the reservation. ${priceBreakdown.eligibleDiscount > 0 ? `Ask staff for your ₱${priceBreakdown.eligibleDiscount.toLocaleString()} room discount at the venue. ` : ''}${remainingBalance > 0 ? 'Pay the remaining balance when you arrive.' : 'No additional room balance is due.'}`
                  : 'Your full payment confirms the reservation. No balance remains at the venue.'}</p>
              ) : (
                <p className="bk-summary-panel-note">Choose a start time to see the total and payment breakdown.</p>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}

function BookingSuccess({ booking, room, selectedVariant, onDone }) {
  if (!booking) {
    return (
      <>
        <div className="bk-confirm-icon"><i className="fa-solid fa-check"></i></div>
        <h3>Reservation confirmed</h3>
        <p>Your payment is confirmed. Your reservation and receipt are saved in Profile → Reservations.</p>
        <button type="button" className="bk-done" onClick={onDone}>Back to Home</button>
      </>
    );
  }

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
  const timeLabel = `${formatHour(startHour)} – ${formatHour(startHour + duration)}${startHour + duration >= 24 ? ' next day' : ''} · ${duration} hour${duration === 1 ? '' : 's'}`;

  const downPayment = Number(booking.downPayment || 0);
  const remaining = Math.max(0, Number(booking.amount || 0) - downPayment);

  function handleOpenReceipt() {
    openBookingReceipt(booking, { roomName, facility });
  }

  return (
    <>
      <div className="bk-success-intro">
        <div className="bk-confirm-icon"><i className="fa-solid fa-check"></i></div>
        <h3>Reservation confirmed</h3>
        <p>Your payment is complete. Your reservation details and receipt are saved in Profile → Reservations.</p>
      </div>

      <div className="bk-success-card">
        <div className="bk-success-reference">
          <span className="bk-summary-label">Reservation code</span>
          <strong className="bk-success-code">{booking.reservationCode || '—'}</strong>
        </div>
        <div className="bk-success-grid">
          <div className="bk-success-item">
            <span className="bk-summary-label">Facility · room</span>
            <span className="bk-summary-value">{facility} · {roomName}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Reservation date</span>
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
            <span className="bk-summary-label">Paid online</span>
            <span className="bk-success-paid">₱{downPayment.toLocaleString()}</span>
          </div>
          <div className="bk-success-item">
            <span className="bk-summary-label">Balance remaining at venue</span>
            <span className="bk-success-balance">₱{remaining.toLocaleString()}</span>
          </div>
        </div>
        {booking.paymentChoice === 'deposit' && Number(booking.eligibleDiscount) > 0 && (
          <p className="bk-success-discount-note" role="status">
            ₱{Number(booking.eligibleDiscount).toLocaleString()} room discount to settle at the facility. {Number(booking.duration) === 1 ? 'Show your receipt to receive it back.' : 'Staff will deduct it from your remaining balance.'}
          </p>
        )}
      </div>

      <div className="bk-success-actions-row">
        <button type="button" className="bk-back-btn" onClick={handleOpenReceipt}>
          <i className="fa-solid fa-download"></i> Download Receipt
        </button>
        <button type="button" className="bk-confirm bk-continue" onClick={onDone}>
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

function BookingModal({ room, returnInfo, onClose, onViewBooking, openHour, closeHour, settings, initialVariantLabel = '' }) {
  const open = !!room || !!returnInfo;
  const { user: authUser, revalidate, logout } = useAuth();
  const { toast, showToast } = useToast();

  const [monthBookings, setMonthBookings] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [reserved, setReserved] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [step, setStep] = useState('price');
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date(`${businessDate()}T12:00:00`));
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [selectedHour, setSelectedHour] = useState(null);
  const totalRooms = Number(selectedVariant?.roomCount) || 1;
  const minDuration = Number.isFinite(Number(settings?.operatingHours?.minOnlineDurationHours))
    ? Number(settings.operatingHours.minOnlineDurationHours) : 1;
  const maxDuration = Number.isFinite(Number(settings?.operatingHours?.maxOnlineDurationHours))
    ? Number(settings.operatingHours.maxOnlineDurationHours) : 5;
  const [selectedDuration, setSelectedDuration] = useState(minDuration);
  const [paymentChoice, setPaymentChoice] = useState('deposit');
  const [claimDiscount, setClaimDiscount] = useState(false);
  const [selectedAddOns, setSelectedAddOns] = useState([]);

  const [guestName, setGuestName] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestNote, setGuestNote] = useState('');
  const [hasCorkage, setHasCorkage] = useState(false);
  const [paxError, setPaxError] = useState('');
  const [nameError, setNameError] = useState('');
  const [contactError, setContactError] = useState('');

  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');
  const [payErrorKind, setPayErrorKind] = useState(null);
  const [paymentInitVersion, setPaymentInitVersion] = useState(0);

  const [paymongoPublicKey, setPaymongoPublicKey] = useState('');
  const [allowedPaymentMethodKeys, setAllowedPaymentMethodKeys] = useState(null);
  const [pmIntent, setPmIntent] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const pollRef = useRef(null);
  const externalCheckoutRef = useRef(false);

  const [pmReturn, setPmReturn] = useState({ phase: 'loading', booking: null });

  useEffect(() => {
    if (step === 'paymongoReturn' && pmReturn.phase === 'confirmed') {
      showToast('Reservation successful! Download your receipt or view it in Profile → Reservations.');
    }
  }, [step, pmReturn.phase, showToast]);

  const [lock, setLock] = useState(null);
  const [lockError, setLockError] = useState('');
  const [lockLoading, setLockLoading] = useState(false);
  const lockRef = useRef(null);
  const lockRequestVersionRef = useRef(0);
  const lockNow = useCountdownClock(!!lock);

  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  async function releaseCurrentLock() {
    lockRequestVersionRef.current += 1;
    setLockLoading(false);
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
      if (lockRef.current && !externalCheckoutRef.current) bookingsService.releaseLock(lockRef.current.id).catch((err) => console.error(err));
    };
  }, []);

  useEffect(() => {
    if (!room) return;

    const roomOptions = priceOptionsFor(room);
    const initialVariant = initialVariantLabel
      ? roomOptions.find((option) => option.label === initialVariantLabel) || null
      : roomOptions.length === 1
        ? roomOptions[0]
        : null;
    setStep(initialVariant ? 'schedule' : 'price');
    setMobileSummaryOpen(false);
    setViewDate(new Date(`${businessDate()}T12:00:00`));
    setSelectedDate(null);
    setSelectedVariant(initialVariant);
    setSelectedHour(null);
    setSelectedDuration(minDuration);
    setGuestNote('');
    setHasCorkage(false);
    setClaimDiscount(false);
    setSelectedAddOns([]);
    setPaymentChoice('deposit');
    setGuestCount(1);
    setPaxError('');
    setNameError('');
    setContactError('');
    setPmIntent(null);
    externalCheckoutRef.current = false;
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
    setGuestContact(user ? user.phone || (user.isGuest ? '' : user.email) || '' : '');
  }, [room, initialVariantLabel]);

  useEffect(() => {
    if (!room) return;
    if (!authUser) {
      window.location.href = buildLoginPath(buildRoomReservationPath(room._id, initialVariantLabel));
      return;
    }
    let cancelled = false;
    revalidate().then((freshUser) => {
      if (!cancelled && !freshUser) {
        window.location.href = buildLoginPath(buildRoomReservationPath(room._id, initialVariantLabel));
      }
    });
    return () => { cancelled = true; };
  }, [room?._id, initialVariantLabel]);

  useEffect(() => {
    if (!returnInfo) return;
    let cancelled = false;
    setStep('paymongoReturn');
    setPmReturn({ phase: 'loading', booking: null });

    async function resolve() {
      if (returnInfo.provider !== 'xendit' && returnInfo.result === 'cancel') {
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
      let awaitingMethodChecks = 0;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (cancelled) return;
        try {
          const res = await fetch(
            returnInfo.provider === 'xendit'
              ? `${API_BASE_URL}/api/payments/xendit/status/${encodeURIComponent(returnInfo.referenceId)}`
              : `${API_BASE_URL}/api/payments/paymongo/status/${encodeURIComponent(returnInfo.paymentIntentId)}`,
            { credentials: 'include' }
          );
          const data = await res.json().catch(() => ({}));
          if (res.status === 401 || res.status === 403) {
            if (!cancelled) setPmReturn({ phase: 'needLogin', booking: null });
            return;
          }
          awaitingMethodChecks = data.status === 'awaiting_payment_method' ? awaitingMethodChecks + 1 : 0;
          const paymentFailure = terminalPaymentFailure(data, { httpStatus: res.status, awaitingMethodChecks });
          if (paymentFailure) {
            if (!cancelled) setPmReturn({ ...paymentFailure, booking: null });
            return;
          }
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
          if (res.ok && ['Paid', 'Partial'].includes(data.paymentStatus) && data.bookingId) {
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
    setPaymentChoice('deposit');
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
        const serviceDate = dateKey(y, m, d);
        const { date: dateStr, timeIn: timeStr } = slotBookingFields(serviceDate, selectedHour);

        const res = await fetch(`${API_BASE_URL}/api/payments/paymongo/intent`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            guestName: guestName.trim(),
            guestContact: guestContact.trim(),
            guestCount: guestCount || 1,
            hasCorkage,
            specialRequests: guestNote.trim(),
            roomId: room._id,
            variantLabel: selectedVariant.label,
            date: dateStr,
            timeIn: timeStr,
            duration: selectedDuration,
            paymentChoice: selectedDuration === 1 ? 'deposit' : paymentChoice,
            claimDiscount,
            selectedAddOns,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) {
            await logout();
            alert('Your session has expired. Please log in again to complete your reservation.');
            window.location.href = '/login';
            return;
          }
          throw new Error(data.message || 'Could not start online payment.');
        }

        clearReservedHours(room._id, serviceDate);
        clearMonthAvailability(room._id, y, m + 1);
        if (dateStr !== serviceDate) {
          const [bookingYear, bookingMonth] = dateStr.split('-').map(Number);
          clearMonthAvailability(room._id, bookingYear, bookingMonth);
        }

        if (!cancelled && data.gateway === 'xendit') {
          externalCheckoutRef.current = true;
          setPmIntent({ gateway: 'xendit', amount: data.amount });
          window.location.assign(data.redirectUrl);
          return;
        }
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
  }, [step, room, selectedVariant, selectedDate, selectedHour, selectedDuration, paymentChoice, claimDiscount, selectedAddOns, hasCorkage, paymentInitVersion]);

  function handleClose() {
    stopPolling();
    releaseCurrentLock();
    onClose();
  }

  function handleChooseOption(opt) {
    setSelectedVariant(opt);
    setSelectedAddOns([]);
    setClaimDiscount(false);
    setViewDate(new Date(`${businessDate()}T12:00:00`));
    setStep('schedule');
  }

  function handleStepClick(targetKey) {
    const targetIndex = STEP_INDEX[targetKey] || 1;
    const currentIndex = STEP_INDEX[step] || 1;
    if (targetIndex >= currentIndex) return;
    if (targetKey === 'price') {
      releaseCurrentLock();
      setLockError('');
      setSelectedDate(null);
      setSelectedHour(null);
    }
    setStep(targetKey);
  }

  function handleSelectDate(y, m, d) {
    releaseCurrentLock();
    setLockError('');
    setSelectedDate({ y, m, d });
    setSelectedHour(null);
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
    if (dur === 1) setPaymentChoice('deposit');
    setSelectedHour(null);
  }

  function handleSelectHour(hour) {
    const state = getSlotState(hour, selectedDuration, closeHour, reserved, totalRooms);
    if (state !== 'available') return;

    setLockError('');
    if (hour === selectedHour) return;
    releaseCurrentLock();
    setSelectedHour(hour);
  }

  async function handleContinueFromSchedule() {
    if (selectedHour === null || lockLoading) return;

    const state = getSlotState(selectedHour, selectedDuration, closeHour, reserved, totalRooms);
    if (state !== 'available') {
      setSelectedHour(null);
      setLockError('That start time is no longer available. Choose another time.');
      return;
    }

    const currentLock = lockRef.current;
    if (currentLock && currentLock.expiresAtMs > Date.now()) {
      setStep('details');
      return;
    }

    const requestVersion = lockRequestVersionRef.current + 1;
    lockRequestVersionRef.current = requestVersion;
    setLockError('');
    setLockLoading(true);
    try {
      const { y, m, d } = selectedDate;
      const { date: dateStr, timeIn: timeStr } = slotBookingFields(dateKey(y, m, d), selectedHour);
      const result = await bookingsService.lockSlot({
        roomId: room._id,
        variantLabel: selectedVariant?.label,
        date: dateStr,
        timeIn: timeStr,
        duration: selectedDuration,
      });

      if (requestVersion !== lockRequestVersionRef.current) {
        bookingsService.releaseLock(result.id).catch((err) => console.error(err));
        return;
      }

      const nextLock = { id: result.id, expiresAtMs: new Date(result.expiresAt).getTime() };
      setLock(nextLock);
      lockRef.current = nextLock;
      setStep('details');
    } catch (err) {
      console.error(err);
      if (requestVersion !== lockRequestVersionRef.current) return;
      if (err.status === 409) {
        setSelectedHour(null);
        setLockError(err.message || 'That start time is no longer available. Choose another time.');
      } else {
        setLockError(err.message || 'We could not verify that time. Please try again.');
      }
      const key = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);
      clearReservedHours(room._id, key);
      fetchReservedHours(room._id, key, selectedVariant?.label).then((hours) => setReserved(hours));
    } finally {
      if (requestVersion === lockRequestVersionRef.current) setLockLoading(false);
    }
  }

  async function continueToPayment() {
    const trimmedName = guestName.trim();
    const trimmedContact = guestContact.trim();

    const nErr = trimmedName ? '' : 'Please enter your full name.';
    let cErr = '';
    if (!trimmedContact) {
      cErr = authUser?.isGuest ? '' : 'Please enter a phone number or email.';
    } else if (authUser?.isGuest && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact)) {
      cErr = 'Please enter a valid email address.';
    }
    setNameError(nErr);
    setContactError(cErr);
    if (nErr || cErr || paxError) return;

    setConfirming(true);
    const user = await revalidate();
    setConfirming(false);

    if (!user) {
      alert('Your session has expired. Please log in again to complete your reservation.');
      window.location.href = '/login';
      return;
    }
    setStep('payment');
  }

  function handleBack() {
    if (step === 'payment') {
      setStep('details');
      return;
    }
    if (step === 'details') {
      setStep('schedule');
      return;
    }
    if (step === 'schedule' && priceOptionsFor(room).length > 1 && !initialVariantLabel) {
      releaseCurrentLock();
      setSelectedDate(null);
      setSelectedHour(null);
      setStep('price');
      return;
    }
    handleClose();
  }

  function stopPolling() {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
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
  const POLL_FAST_ATTEMPTS = 90;
  const POLL_MAX_ATTEMPTS = 192;

  function pollPaymentStatus(paymentIntentId, popup) {
    setStep('paymongoReturn');
    setPmReturn({ phase: 'loading', booking: null });

    let attempts = 0;
    let popupClosedChecks = 0;
    let awaitingMethodChecks = 0;
    let statusFailures = 0;
    stopPolling();
    const checkStatus = async () => {
      attempts += 1;
      let paid = false;
      let paidBookingId = null;
      let slotUnavailableMsg = null;
      let paymentFailure = null;
      let remoteStatus = '';
      let statusChecked = false;
      let authRequired = false;
      try {
        const res = await fetch(`${API_BASE_URL}/api/payments/paymongo/status/${encodeURIComponent(paymentIntentId)}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        statusChecked = res.ok || [402, 409, 410].includes(res.status);
        statusFailures = statusChecked ? 0 : statusFailures + 1;
        authRequired = res.status === 401 || res.status === 403;
        remoteStatus = data.status || '';
        awaitingMethodChecks = remoteStatus === 'awaiting_payment_method' ? awaitingMethodChecks + 1 : 0;
        if (res.status === 409 && data.status === 'paid_slot_unavailable') {
          slotUnavailableMsg = data.message || "Your payment succeeded, but this slot was just taken. Please contact support so we can help resolve it.";
        } else {
          paymentFailure = terminalPaymentFailure(data, { httpStatus: res.status, awaitingMethodChecks });
          paid = res.ok && ['Paid', 'Partial'].includes(data.paymentStatus);
          paidBookingId = data.bookingId || null;
        }
      } catch (err) {
        console.error(err);
        statusFailures += 1;
      }

      if (authRequired) {
        stopPolling();
        setPmReturn({ phase: 'needLogin', booking: null });
        return;
      }
      if (statusFailures >= 6) {
        stopPolling();
        setPmReturn({
          phase: 'pending',
          booking: null,
          message: 'We could not verify your payment status. Check Profile → Reservations before trying another payment.',
        });
        return;
      }

      if (slotUnavailableMsg) {
        stopPolling();
        if (popup && !popup.closed) popup.close();
        window.focus();
        setPmReturn({ phase: 'paidSlotUnavailable', booking: null, message: slotUnavailableMsg });
        return;
      }

      if (paymentFailure) {
        stopPolling();
        if (popup && !popup.closed) {
          try {
            popup.location.replace(`${window.location.origin}/?paymongo=${paymentFailure.phase}&paymentIntentId=${encodeURIComponent(paymentIntentId)}`);
          } catch {
            popup.close();
          }
        }
        window.focus();
        setPmReturn({ ...paymentFailure, booking: null });
        return;
      }

      if (paid) {
        stopPolling();
        if (popup && !popup.closed) popup.close();
        window.focus();
        const booking = paidBookingId ? await fetchPaidBooking(paidBookingId) : null;
        setPmReturn({ phase: 'confirmed', booking });
        return;
      }

      if (popup && popup.closed && statusChecked && remoteStatus !== 'processing') {
        popupClosedChecks += 1;
        if (popupClosedChecks < 3) {
          pollRef.current = setTimeout(checkStatus, POLL_INTERVAL_MS);
          return;
        }
        stopPolling();
        setPmReturn({
          phase: 'cancelled',
          booking: null,
          message: 'The payment window was closed before payment finished. We did not receive a completed payment. If your banking app shows a charge, check your reservations before trying again.',
        });
        return;
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        if (popup && !popup.closed) {
          try {
            popup.location.replace(`${window.location.origin}/?paymongo=pending&paymentIntentId=${encodeURIComponent(paymentIntentId)}`);
          } catch {
            popup.close();
          }
        }
        window.focus();
        setPmReturn({ phase: 'pending', booking: null });
      } else {
        pollRef.current = setTimeout(checkStatus, attempts < POLL_FAST_ATTEMPTS ? POLL_INTERVAL_MS : 10000);
      }
    };
    pollRef.current = setTimeout(checkStatus, POLL_INTERVAL_MS);
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
          alert('Your session has expired. Please log in again to complete your reservation.');
          window.location.href = '/login';
          return;
        }
        if (res.status === 400 && data.field === 'guestEmail') {
          setPayErrorKind('declined');
          setPayError(data.message || 'A valid email is required for wallet payments. Please go back and enter your email.');
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
      const paymentFailure = terminalPaymentFailure(data);
      if (paymentFailure) {
        setPayErrorKind(paymentFailure.phase === 'failed' ? 'declined' : paymentFailure.phase);
        setPayError(paymentFailure.message);
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
      await attachAndHandle({ paymentMethodId: data.data.id, paymentMethodType: 'card' });
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
    setPaymentInitVersion((version) => version + 1);
  }

  function handleRetryFromReturn() {
    if (!room) {
      handleDone();
      return;
    }
    setStep('payment');
    handleRetryPayment();
  }

  function handleDone() {
    stopPolling();
    releaseCurrentLock();
    onClose();
  }

  function buildCalendarDays() {
    if (!room) return { firstDay: 0, days: [] };
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayKey = businessDate();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(y, m, d);
      const dStr = dateKey(y, m, d);
      const isToday = dStr === todayKey;
      const holiday = isHolidayDate(dStr, settings?.holidays);
      const closedDay = !isOperatingDay(thisDate, settings?.operatingHours);
      const past = slotStartMs(dStr, closeHour) <= Date.now();

      const { availableStarts, nearlyFull } = getDayAvailability(monthBookings[dStr], openHour, closeHour, totalRooms, selectedDuration, dStr);
      const fullyBooked = availableStarts === 0;
      const unavailable = holiday || closedDay;
      const blocked = unavailable || fullyBooked;

      let variant = null;
      let title = '';
      if (!past) {
        if (unavailable) {
          variant = 'unavailable';
          title = holiday
            ? holidayReason(dStr, settings?.holidays)
            : 'Closed on this day of the week. No reservations are available on this date.';
        } else if (fullyBooked) {
          variant = 'full';
          title = 'Full — no rooms or start times left for this duration';
        } else if (nearlyFull) {
          variant = 'few';
          title = 'Nearly full — few rooms or start times left';
        } else {
          variant = 'available';
        }
      }

      days.push({ d, y, m, isToday, disabled: past || blocked, variant, title, holiday: !past && holiday });
    }
    return { firstDay, days };
  }

  const priceItems = room ? priceOptionsFor(room) : [];
  const hasRoomChoice = priceItems.length > 1 && !initialVariantLabel;
  const visibleSteps = hasRoomChoice ? STEPS : STEPS.filter((item) => item.key !== 'price');
  const { firstDay, days: calendarDays } = step === 'schedule' ? buildCalendarDays() : { firstDay: 0, days: [] };
  const cap = getPaxCapacity(selectedVariant?.pax);

  const serviceDateKey = selectedDate ? dateKey(selectedDate.y, selectedDate.m, selectedDate.d) : null;
  const selectedBookingDateKey = serviceDateKey && selectedHour !== null ? slotBookingFields(serviceDateKey, selectedHour).date : serviceDateKey;
  const selectedBookingDate = selectedBookingDateKey ? new Date(`${selectedBookingDateKey}T12:00:00`) : null;
  const selectedDateLabel = selectedBookingDate
    ? `${WEEKDAYS[selectedBookingDate.getDay()]}, ${MONTHS[selectedBookingDate.getMonth()]} ${selectedBookingDate.getDate()}${selectedHour >= 24 ? ' (next day)' : ''}`
    : '';
  const selectedOptionLabel = selectedVariant ? `${selectedVariant.label} · ${variantRateLabel(selectedVariant)}` : '';
  const startTimeLabel = selectedHour !== null ? `${formatHour(selectedHour)}${selectedHour >= 24 ? ' next day' : ''}` : '—';
  const endTimeLabel = selectedHour !== null ? `${formatHour(selectedHour + selectedDuration)}${selectedHour + selectedDuration >= 24 ? ' next day' : ''}` : '—';
  const durationLabel = `${selectedDuration} hour${selectedDuration === 1 ? '' : 's'}`;

  const priceBreakdown = selectedVariant
    ? calculateBookingPrice({
        room,
        variant: selectedVariant,
        startHour: selectedHour ?? 0,
        duration: selectedDuration,
        guestCount,
        hasCorkage,
        paymentChoice: selectedDuration === 1 ? 'deposit' : paymentChoice,
        claimDiscount,
        selectedAddOns,
      })
    : { amount: 0, roomCharge: 0, corkageFee: 0, downPayment: 0, discountAmount: 0, eligibleDiscount: 0, addOns: [], addOnFee: 0, hourlyRates: [] };
  const subtotalAmount = priceBreakdown.amount;
  const downPaymentAmount = priceBreakdown.downPayment;
  const remainingBalanceAmount = Math.max(0, subtotalAmount - downPaymentAmount);
  const depositBalanceCopy = remainingBalanceAmount > 0
    ? priceBreakdown.eligibleDiscount > 0
      ? `₱${remainingBalanceAmount.toLocaleString()} remains before that discount. `
      : `₱${remainingBalanceAmount.toLocaleString()} remains to pay at the facility. `
    : '';
  const downPaymentOptions = [
    { choice: 'deposit', label: selectedDuration === 1 ? '1-hour reservation payment' : '1-hour down payment', amount: Math.min(priceBreakdown.roomCharge + priceBreakdown.corkageFee + priceBreakdown.addOnFee, priceBreakdown.hourlyRates[0] || 0) },
    { choice: 'full', label: 'Pay in full', amount: Math.max(0, priceBreakdown.roomCharge - priceBreakdown.eligibleDiscount + priceBreakdown.corkageFee + priceBreakdown.addOnFee) },
  ];
  const visiblePaymentOptions = selectedDuration === 1 ? downPaymentOptions.slice(0, 1) : downPaymentOptions;
  const availableDiscountPercent = selectedVariant ? effectiveDiscountPercent(room, selectedVariant) : 0;
  const availableDiscountAmount = Math.round(priceBreakdown.roomCharge * availableDiscountPercent) / 100;
  const visiblePaymentMethods = allowedPaymentMethodKeys
    ? PAYMENT_METHODS.filter((m) => allowedPaymentMethodKeys.includes(m.key))
    : PAYMENT_METHODS;

  const showSummaryPanel = room && step !== 'paymongoReturn' && step !== 'price';

  const contactMessengerUrl = settings?.contact?.messengerUrl;
  const contactPhone = settings?.contact?.phone;
  const isPaymentReturn = step === 'paymongoReturn';
  const isConfirmedReturn = isPaymentReturn && pmReturn.phase === 'confirmed';

  return (
    <ModalPortal>
      <div className={`bk-overlay${open ? ' open' : ''}`} id="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
        <div className={'bk-modal' + (showSummaryPanel ? '' : ' bk-modal--compact') + (isPaymentReturn ? ' bk-modal--payment-return' : '') + (isConfirmedReturn ? ' bk-modal--payment-confirmed' : '') + (isPaymentReturn && pmReturn.phase === 'loading' ? ' bk-modal--payment-loading' : '')}>
          <div className={`bk-header${isConfirmedReturn ? ' bk-header--success' : ''}`}>
          {!isConfirmedReturn && <button type="button" className="bk-modal-back" aria-label="Go back" onClick={handleBack}>
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Back</span>
          </button>}
          <div className="bk-header-identity">
            <div>
              <p className="bk-eyebrow">Reservation</p>
              <h2 id="booking-modal-title">{isConfirmedReturn ? 'Your reservation' : isPaymentReturn ? 'Online payment' : room?.name}</h2>
            </div>
          </div>
          <button type="button" className="bk-close" aria-label="Close reservation" onClick={handleClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {step !== 'paymongoReturn' && <BookingStepper step={step} onStepClick={handleStepClick} steps={visibleSteps} />}

        {lock && step !== 'price' && step !== 'paymongoReturn' && (() => {
          const remainingMs = Math.max(0, lock.expiresAtMs - lockNow);
          const mm = String(Math.floor(remainingMs / 60000)).padStart(2, '0');
          const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, '0');
          return (
            <div className="bk-lock-banner">
              <i className="fa-solid fa-lock"></i>
              We're holding this time slot for you — complete your reservation within {mm}:{ss} or it will be released.
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
              Reservation Summary
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
              hasCorkage={hasCorkage}
              selectedMethod={selectedMethod}
              subtotal={subtotalAmount}
              downPayment={downPaymentAmount}
              remainingBalance={remainingBalanceAmount}
              priceBreakdown={priceBreakdown}
              paymentChoice={paymentChoice}
              step={step}
            />
          </div>
        )}

        <div className={'bk-content' + (isPaymentReturn ? ' bk-content--payment-return' : '') + (isConfirmedReturn ? ' bk-content--payment-confirmed' : '') + (isPaymentReturn && pmReturn.phase === 'loading' ? ' bk-content--payment-loading' : '')}>
          <div className="bk-body">
            {step === 'price' && room && (
              <div className="bk-step" id="bkStepPrice">
                <p className="bk-choose-label bk-choose-label--heading bk-choose-label--tight">Choose a room</p>
                <p className="bk-choose-label bk-choose-label--sub">Select the room you want to reserve.</p>
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
                        showSelectionIndicator={priceItems.length > 1}
                        onSelect={() => handleChooseOption(opt)}
                      />
                    );
                  })}
                </div>

                <p className="bk-info-bar" role="note">
                  <i className="fa-solid fa-circle-info"></i>
                  Tap a room to continue directly to its date and time availability.
                </p>
              </div>
            )}

            {step === 'schedule' && room && selectedVariant && (
              <div className="bk-step" id="bkStepSchedule">
                <p className="bk-selected-option-pill">{selectedOptionLabel}</p>

                {!selectedDate && (
                  <>
                    <p className="bk-choose-label bk-choose-label--heading">When would you like to reserve?</p>
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
                            <button
                              type="button"
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
                              aria-label={day.title ? `${day.d}, ${day.title}` : `${day.d}`}
                              data-tooltip={day.title || undefined}
                              disabled={day.disabled}
                              onClick={!day.disabled ? () => handleSelectDate(day.y, day.m, day.d) : undefined}
                            >
                              <span className="bk-day-num">{day.d}</span>
                              {day.holiday && <span className="bk-day-holiday-badge">Holiday</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="bk-legend">
                      <span><i className="bk-dot bk-dot--available"></i> Available</span>
                      <span><i className="bk-dot bk-dot--few"></i> Nearly full</span>
                      <span><i className="bk-dot bk-dot--full"></i> Full</span>
                      <span><i className="bk-dot bk-dot--unavailable"></i> Closed</span>
                    </div>
                  </>
                )}

                {selectedDate && (
                  <>
                    <div className="bk-selected-date-recap">
                      <div>
                        <p className="bk-selected-date-recap-label">Selected Reservation Date</p>
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
                          <button
                            type="button"
                            key={dur}
                            className={'bk-duration-btn' + (dur === selectedDuration ? ' bk-duration-btn--selected' : '')}
                            aria-pressed={dur === selectedDuration}
                            onClick={() => handleSelectDuration(dur)}
                          >
                            {dur}h
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="bk-choose-label bk-choose-label--heading">Choose a start time</p>

                    {lockError && (
                      <p className="bk-lock-error">
                        <i className="fa-solid fa-circle-exclamation"></i> {lockError}
                      </p>
                    )}

                    {slotsLoading ? (
                      <div className="bk-skeleton-grid">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="bk-skeleton-block bk-skeleton-tile" />
                        ))}
                      </div>
                    ) : (
                      (() => {
                        const selectedKey = dateKey(selectedDate.y, selectedDate.m, selectedDate.d);

                        const groups = { Morning: [], Afternoon: [], Evening: [], 'After midnight · next day': [] };
                        let anyAvailable = false;
                        for (let h = openHour; h < closeHour; h++) {
                          if (slotStartMs(selectedKey, h) <= Date.now()) continue;

                          const state = getSlotState(h, selectedDuration, closeHour, reserved, totalRooms);
                          const fits = state === 'available';
                          const isSelected = h === selectedHour;
                          if (state === 'available') anyAvailable = true;

                          let slotStatusLabel;
                          let slotStatusTone = '';
                          if (state === 'booked') {
                            slotStatusLabel = 'Unavailable';
                          } else if (state === 'insufficient') {
                            slotStatusLabel = 'Ends after closing';
                          } else if (isSelected) {
                            slotStatusLabel = `Selected · ends ${formatHour(h + selectedDuration)}${h + selectedDuration >= 24 ? ' next day' : ''}`;
                          } else {
                            const availableCount = getAvailableRoomCountForDuration(
                              reserved,
                              totalRooms,
                              h,
                              selectedDuration
                            );
                            const isFewLeft = availableCount <= 2 && availableCount < totalRooms;
                            slotStatusLabel = totalRooms === 1
                              ? 'Available'
                              : `${availableCount} room${availableCount === 1 ? '' : 's'} available`;
                            slotStatusTone = isFewLeft ? ' is-limited' : ' is-open';
                          }

                          groups[getTimePeriod(h)].push(
                            <button
                              type="button"
                              key={h}
                              className={
                                'bk-slot' +
                                (state === 'booked' ? ' bk-slot--reserved' : '') +
                                (state === 'insufficient' ? ' bk-slot--insufficient' : '') +
                                (isSelected ? ' bk-slot--selected' : '')
                              }
                              onClick={fits ? () => handleSelectHour(h) : undefined}
                              disabled={!fits}
                              aria-pressed={fits ? isSelected : undefined}
                              aria-label={`${formatHour(h)}${h >= 24 ? ' next day' : ''}, ${slotStatusLabel}`}
                            >
                              <span className="bk-slot-time">{formatHour(h)}</span>
                              <span className={`bk-slot-status${slotStatusTone}`}>{slotStatusLabel}</span>
                            </button>
                          );
                        }

                        return (
                          <>
                            {!anyAvailable && (
                              <div className="bk-no-slots-msg">
                                <i className="fa-solid fa-circle-exclamation"></i>
                                No {selectedDuration}-hour slots are available on {selectedDateLabel}.{' '}
                                {selectedDuration > minDuration ? 'Try a shorter duration or ' : 'Please '}
                                <button type="button" className="bk-no-slots-change-date" onClick={handleChangeDate}>
                                  pick another date
                                </button>.
                              </div>
                            )}
                            {anyAvailable && Object.entries(groups).map(([period, slots]) => (
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
                      <button
                        className="bk-confirm bk-continue"
                        disabled={selectedHour === null || lockLoading}
                        aria-busy={lockLoading}
                        onClick={handleContinueFromSchedule}
                      >
                        {lockLoading ? 'Checking availability…' : 'Continue'} {!lockLoading && <i className="fa-solid fa-arrow-right"></i>}
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
                    <label className="bk-field-label" htmlFor="bkGuestContact">
                      {authUser?.isGuest ? 'Email Address' : 'Phone Number or Email'}
                      {authUser?.isGuest && <span className="bk-field-optional">Optional</span>}
                    </label>
                    <input
                      type="text"
                      id="bkGuestContact"
                      className={`bk-field-input${contactError ? ' bk-field-input--error' : ''}`}
                      placeholder={authUser?.isGuest ? 'you@email.com' : '09xx xxx xxxx or you@email.com'}
                      value={guestContact}
                      onChange={(e) => { setGuestContact(e.target.value); if (contactError) setContactError(''); }}
                    />
                    {contactError && (
                      <p className="bk-field-error"><i className="fa-solid fa-circle-exclamation"></i> {contactError}</p>
                    )}
                    {authUser?.isGuest && !contactError && !guestContact.trim() && (
                      <p className="bk-field-warning"><i className="fa-solid fa-triangle-exclamation"></i> Without an email, you won't receive a reservation receipt.</p>
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
                  <label className={`bk-addon-option${hasCorkage ? ' bk-addon-option--selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={hasCorkage}
                      onChange={(event) => setHasCorkage(event.target.checked)}
                    />
                    <span className="bk-addon-option-icon"><i className="fa-solid fa-bag-shopping" aria-hidden="true"></i></span>
                    <span>
                      <strong>Bringing outside food or drinks</strong>
                      <small>Includes the required ₱{CORKAGE_FEE.toLocaleString()} corkage fee.</small>
                    </span>
                  </label>
                  {availableDiscountPercent > 0 && (
                    <label className={`bk-addon-option bk-discount-option${claimDiscount ? ' bk-addon-option--selected' : ''}`}>
                      <input type="checkbox" checked={claimDiscount} onChange={(event) => setClaimDiscount(event.target.checked)} />
                      <span className="bk-addon-option-icon"><i className="fa-solid fa-tag" aria-hidden="true"></i></span>
                      <span>
                        <strong>Use {availableDiscountPercent}% room discount</strong>
                        <small>Save ₱{availableDiscountAmount.toLocaleString()} on the room. For multi-hour full payment, we deduct it online. Otherwise, staff settle it at the facility.</small>
                      </span>
                    </label>
                  )}
                  {(room.addOns || []).length > 0 && (
                    <div className="bk-optional-services">
                      <strong>Optional services</strong>
                      <p>Choose any extras you want for this reservation.</p>
                      {room.addOns.map((service) => (
                        <label className={`bk-addon-option${selectedAddOns.includes(service.name) ? ' bk-addon-option--selected' : ''}`} key={service.name}>
                          <input
                            type="checkbox"
                            checked={selectedAddOns.includes(service.name)}
                            onChange={(event) => setSelectedAddOns((current) => event.target.checked
                              ? [...current, service.name]
                              : current.filter((name) => name !== service.name))}
                          />
                          <span className="bk-addon-option-icon"><i className="fa-solid fa-circle-plus" aria-hidden="true"></i></span>
                          <span><strong>{service.name}</strong><small>+₱{Number(service.fee).toLocaleString()} per reservation</small></span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bk-detail-actions">
                  <button className="bk-confirm bk-continue" disabled={confirming} onClick={continueToPayment}>
                    Continue to payment <i className="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
              </div>
            )}

            {step === 'payment' && room && selectedVariant && (
              <div className="bk-step" id="bkStepPayment">
                <div className="bk-slots-head">
                  <h3>Payment</h3>
                </div>
                <p className="bk-payment-methods-help">Secure online checkout via PayMongo (GCash, Maya, QR Ph, Card). If PayMongo is down, GCash/Maya checkout opens automatically via Xendit backup.</p>

                <div className="bk-downpayment-card">
                  <p className="bk-summary-label">{selectedDuration === 1 ? '1-hour reservation payment' : paymentChoice === 'deposit' ? '1-hour down payment' : 'Full payment'}</p>
                  <p className="bk-downpayment-amount">
                    ₱{downPaymentAmount.toLocaleString()}
                  </p>
                  <p className="bk-downpayment-duration">{paymentChoice === 'deposit'
                    ? `Confirms your reservation. ${priceBreakdown.eligibleDiscount > 0 ? selectedDuration === 1 ? `Receive your ₱${priceBreakdown.eligibleDiscount.toLocaleString()} room discount at the facility. ` : `Staff will deduct your ₱${priceBreakdown.eligibleDiscount.toLocaleString()} room discount from the remaining balance at the facility. ` : ''}${depositBalanceCopy}First hour is non-refundable if you cancel.`
                    : downPaymentAmount > (priceBreakdown.hourlyRates[0] || 0)
                      ? 'Confirms your reservation. If you cancel, contact admin for a refund minus the first hour.'
                      : 'Confirms your reservation. Non-refundable if you cancel.'}</p>
                </div>

                <div className="bk-payment-methods">
                  <span className="bk-payment-methods-label" id="bk-payment-hours-label">Pay now</span>
                  <div className={`bk-payment-methods-grid bk-payment-duration-grid${visiblePaymentOptions.length === 1 ? ' bk-payment-duration-grid--single' : ''}`} role="group" aria-labelledby="bk-payment-hours-label">
                    {visiblePaymentOptions.map(({ choice, label, amount }) => (
                      <button
                        key={choice}
                        type="button"
                        className={
                          'bk-payment-method-tile bk-payment-duration-tile' +
                          (paymentChoice === choice ? ' bk-payment-method-tile--selected' : '') +
                          (payLoading ? ' bk-payment-method-tile--disabled' : '')
                        }
                        disabled={payLoading}
                        aria-pressed={paymentChoice === choice}
                        onClick={() => setPaymentChoice(choice)}
                      >
                        <span className="bk-payment-choice-copy">
                          <strong>{label}</strong>
                          <small>₱{amount.toLocaleString()}</small>
                          {claimDiscount && priceBreakdown.eligibleDiscount > 0 && <small>{choice === 'full' ? `Includes ₱${priceBreakdown.eligibleDiscount.toLocaleString()} discount` : selectedDuration === 1 ? 'Receive room discount at the facility' : 'Room discount deducted from venue balance'}</small>}
                        </span>
                        <span className="bk-payment-choice-check" aria-hidden="true">
                          <i className="fa-solid fa-check"></i>
                        </span>
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
                    <span className="bk-payment-methods-label" id="bk-payment-method-label">Payment method</span>
                    <p className="bk-payment-methods-help">Choose how you want to complete the secure payment.</p>
                    <div className="bk-payment-methods-grid bk-payment-method-grid" role="group" aria-labelledby="bk-payment-method-label">
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
                          aria-pressed={selectedMethod === m.key}
                          onClick={() => handleSelectMethod(m.key)}
                        >
                          <span className="bk-payment-choice-icon" aria-hidden="true"><i className={m.icon}></i></span>
                          <span className="bk-payment-choice-copy">
                            <strong>{m.label}</strong>
                            <small>{m.description}</small>
                          </span>
                          <span className="bk-payment-choice-check" aria-hidden="true">
                            <i className="fa-solid fa-check"></i>
                          </span>
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

                {payError && (payErrorKind === 'expired' || payErrorKind === 'cancelled') && (
                  <div className="bk-payment-fallback" role="alert">
                    <div className="bk-payment-fallback-head">
                      <i className={`fa-solid ${payErrorKind === 'expired' ? 'fa-clock' : 'fa-circle-xmark'} bk-payment-fallback-icon`}></i>
                      <div>
                        <p className="bk-payment-fallback-title">{payErrorKind === 'expired' ? 'Payment session expired' : 'Payment cancelled'}</p>
                        <p className="bk-payment-fallback-desc">{payError}</p>
                      </div>
                    </div>
                    <div className="bk-payment-fallback-actions">
                      <button type="button" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary" onClick={handleRetryPayment}>
                        <i className="fa-solid fa-rotate-right"></i> Start a New Payment
                      </button>
                    </div>
                  </div>
                )}

                {payError && !['connectivity', 'paidSlotUnavailable', 'expired', 'cancelled'].includes(payErrorKind) && (
                  <p style={{ display: 'block', fontSize: '.8rem', color: '#e2554b', marginTop: 10 }}>
                    <i className="fa-solid fa-circle-exclamation"></i> {payError}
                  </p>
                )}

                <div className="bk-detail-actions">
                  <button
                    type={selectedMethod === 'card' ? 'submit' : 'button'}
                    form={selectedMethod === 'card' ? 'bkCardForm' : undefined}
                    className="bk-confirm bk-continue"
                    disabled={payLoading || !pmIntent || !selectedMethod || ['paidSlotUnavailable', 'expired', 'cancelled'].includes(payErrorKind)}
                    onClick={selectedMethod === 'card' ? undefined : handleConfirmWalletPay}
                  >
                    {payLoading ? 'Processing…' : `Pay ₱${downPaymentAmount.toLocaleString()}`}
                  </button>
                </div>
              </div>
            )}

            {step === 'paymongoReturn' && (
              <div className={`bk-step bk-payment-return bk-payment-return--${pmReturn.phase}`} id="bkStepPaymongoReturn" role={pmReturn.phase === 'loading' ? 'status' : undefined} aria-live={pmReturn.phase === 'loading' ? 'polite' : undefined}>
                {pmReturn.phase === 'confirmed' ? (
                  <BookingSuccess
                    booking={pmReturn.booking}
                    room={room}
                    selectedVariant={selectedVariant}
                    onDone={handleDone}
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
                      {pmReturn.phase === 'expired' && <i className="fa-solid fa-clock"></i>}
                      {pmReturn.phase === 'failed' && <i className="fa-solid fa-triangle-exclamation"></i>}
                      {pmReturn.phase === 'needLogin' && <i className="fa-solid fa-triangle-exclamation"></i>}
                      {pmReturn.phase === 'pending' && <i className="fa-solid fa-clock"></i>}
                    </div>

                    <h3>
                      {pmReturn.phase === 'loading' && 'Confirming your payment…'}
                      {pmReturn.phase === 'cancelled' && 'Payment cancelled'}
                      {pmReturn.phase === 'expired' && 'Payment session expired'}
                      {pmReturn.phase === 'failed' && 'Payment could not be completed'}
                      {pmReturn.phase === 'needLogin' && 'Please log in to confirm'}
                      {pmReturn.phase === 'pending' && (pmReturn.message ? 'Payment status unavailable' : 'Still confirming your payment…')}
                    </h3>

                    <p>
                      {pmReturn.phase === 'loading' && 'Please wait a moment.'}
                      {pmReturn.phase === 'cancelled' &&
                        (pmReturn.message || "No charge was made. You can try the payment again.")}
                      {pmReturn.phase === 'expired' &&
                        (pmReturn.message || 'The payment window expired before it was completed. No charge was made.')}
                      {pmReturn.phase === 'failed' &&
                        (pmReturn.message || 'No charge was made. Try another payment method.')}
                      {pmReturn.phase === 'needLogin' &&
                        'Log in with the same account you reserved with to see your payment status.'}
                      {pmReturn.phase === 'pending' &&
                        (pmReturn.message || 'This can take a little longer than usual. You\'ll see your reservation move to "Confirmed" in your profile shortly — no need to pay again.')}
                    </p>

                    {['cancelled', 'expired'].includes(pmReturn.phase) && (
                      <div className="bk-payment-return-note" role="status">
                        <i className="fa-solid fa-circle-check" aria-hidden="true"></i>
                        No charge was completed.
                      </div>
                    )}

                    {['cancelled', 'expired', 'failed'].includes(pmReturn.phase) && room ? (
                      <div className="bk-success-actions-row">
                        <button className="bk-back-btn" onClick={handleDone}>Close</button>
                        <button className="bk-confirm bk-continue" onClick={handleRetryFromReturn}>Try Payment Again</button>
                      </div>
                    ) : pmReturn.phase !== 'loading' && (
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
                hasCorkage={hasCorkage}
                selectedMethod={selectedMethod}
                subtotal={subtotalAmount}
                downPayment={downPaymentAmount}
              remainingBalance={remainingBalanceAmount}
              priceBreakdown={priceBreakdown}
              paymentChoice={paymentChoice}
              step={step}
              />
            </div>
          )}
        </div>
        </div>
      </div>
      <Toast {...toast} />
    </ModalPortal>
  );
}

export default BookingModal;
