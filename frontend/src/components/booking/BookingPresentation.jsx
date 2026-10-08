import { Fragment } from 'react';
import { facilityImage } from '../../utils/facilityImage';
import { formatHour, openBookingReceipt } from '../../utils/receipt';
import { dateKey } from '../../utils/rooms';
import { variantRateLabel } from '../../utils/roomPricing';
import { slotBookingFields } from '../../utils/bookingHours';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const STEPS = [
  { key: 'price', label: 'Room' },
  { key: 'schedule', label: 'Date & Time' },
  { key: 'details', label: 'Details' },
  { key: 'payment', label: 'Payment' },
];

export const PAYMENT_METHODS = [
  { key: 'gcash', label: 'GCash', description: 'Mobile wallet', icon: 'fa-solid fa-wallet' },
  { key: 'paymaya', label: 'Maya', description: 'Mobile wallet', icon: 'fa-solid fa-money-bill-wave' },
  { key: 'qrph', label: 'QR Ph', description: 'Scan with a QR Ph app', icon: 'fa-solid fa-qrcode' },
  { key: 'card', label: 'Credit / Debit Card', description: 'Visa or Mastercard', icon: 'fa-solid fa-credit-card' },
];

export function BookingStepper({ step, onStepClick, steps = STEPS }) {
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

export function BookingSummaryContents({
  room, selectedVariant, selectedDate, selectedHour, selectedDuration,
  guestName, guestContact, guestEmail, guestCount, guestNote,
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
        <span className="bk-summary-panel-title">Your selection</span>
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
                  <span className="bk-summary-panel-row-label"><i className="fa-solid fa-phone"></i> Phone</span>
                  <span className="bk-summary-panel-row-value">{guestContact || 'Not provided yet'}</span>
                </div>
                <div className="bk-summary-panel-row">
                  <span className="bk-summary-panel-row-label"><i className="fa-solid fa-envelope"></i> Email</span>
                  <span className="bk-summary-panel-row-value">{guestEmail || 'Not provided yet'}</span>
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

export function BookingSuccess({ booking, room, selectedVariant, onDone }) {
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
          <i className="fa-solid fa-envelope"></i> {booking.paymentProvider === 'demo' ? 'Receipt delivery is simulated in this demo. Download your receipt here or from reservation history.' : booking.receiptStatus === 'sent' ? `Your receipt email was sent to ${booking.guestEmail}.` : booking.receiptStatus === 'attention' ? 'Your reservation is confirmed. The receipt email needs staff attention; you can download it here or from your reservation history.' : 'Your reservation is confirmed. Your receipt email is being prepared. You can download it here or from your reservation history.'}
        </p>
      )}
    </>
  );
}

export { BookingSuccess as BookingConfirmation };
