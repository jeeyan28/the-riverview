import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { bookingsService } from '../services/bookings';
import { roomsService } from '../services/rooms';
import { formatHour } from '../utils/receipt';
import { businessDate } from '../utils/businessDate';
import { relativeBookingHour, slotBookingFields, slotStartMs } from '../utils/bookingHours';
import ModalPortal from './ModalPortal';
import {
  dateKey,
  fetchReservedHours,
  loadMonthAvailability,
  isHolidayDate,
  holidayReason,
  isOperatingDay,
  getSlotState,
  getTimePeriod,
  getDayAvailability,
  getAvailableRoomCountForDuration,
} from '../utils/rooms';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const RESCHEDULE_MAX_USES = 2;

export function canRescheduleBooking(booking) {
  if (!booking || booking.status !== 'Confirmed') return false;
  if (booking.cancellationStatus === 'Requested') return false;
  if ((booking.rescheduleCount || 0) >= RESCHEDULE_MAX_USES) return false;
  const start = Date.parse(`${booking.date}T${booking.timeIn}:00+08:00`);
  return Number.isFinite(start) && start - Date.now() >= 24 * 60 * 60 * 1000;
}

function formatDateLabel(dStr) {
  const [y, m, d] = dStr.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function excludeOwnSlotFromDayList(dayBookings, booking, serviceDate) {
  if (!dayBookings || !dayBookings.length) return dayBookings;
  const ownHour = relativeBookingHour(serviceDate, booking.date, booking.timeIn);
  const idx = dayBookings.findIndex(
    (b) => Number.parseInt(b.timeIn, 10) === ownHour && Number(b.duration) === Number(booking.duration)
  );
  if (idx === -1) return dayBookings;
  const copy = dayBookings.slice();
  copy.splice(idx, 1);
  return copy;
}

function excludeOwnSlotFromHourCounts(reservedCounts, booking, dateStr) {
  const startHour = relativeBookingHour(dateStr, booking.date, booking.timeIn);
  const duration = Number(booking.duration) || 1;
  const adjusted = { ...reservedCounts };
  for (let h = startHour; h < startHour + duration; h++) {
    adjusted[h] = Math.max(0, (Number(adjusted[h]) || 0) - 1);
  }
  return adjusted;
}

function RescheduleModal({ booking, onClose, onRescheduled }) {
  const { openHour, closeHour, settings } = useSiteSettings();
  const [room, setRoom] = useState(null);
  const [step, setStep] = useState('date');
  const [viewYear, setViewYear] = useState(() => Number(businessDate().slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(() => Number(businessDate().slice(5, 7)) - 1);
  const [monthBookings, setMonthBookings] = useState({});
  const [monthLoading, setMonthLoading] = useState(true);
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [reserved, setReserved] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const roomId = booking.room?._id || booking.room;
  const variantLabel = booking.variantLabel;
  const duration = Number(booking.duration) || 1;
  const usesLeft = RESCHEDULE_MAX_USES - (booking.rescheduleCount || 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await roomsService.get(roomId);
        if (!cancelled) setRoom(data);
      } catch {
        if (!cancelled) setRoom(null);
      }
    })();
    return () => { cancelled = true; };
  }, [roomId]);

  const totalRooms = useMemo(() => {
    if (!room) return 1;
    if (room.variants && room.variants.length && variantLabel) {
      const v = room.variants.find((x) => x.label === variantLabel);
      return Math.max(1, Number(v?.roomCount) || 1);
    }
    return 1;
  }, [room, variantLabel]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setMonthLoading(true);
    (async () => {
      const data = await loadMonthAvailability(roomId, viewYear, viewMonth + 1, variantLabel);
      if (!cancelled) {
        setMonthBookings(data);
        setMonthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roomId, viewYear, viewMonth, variantLabel]);

  useEffect(() => {
    if (!selectedDateKey || !roomId) {
      setReserved({});
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    (async () => {
      const data = await fetchReservedHours(roomId, selectedDateKey, variantLabel);
      if (!cancelled) {
        setReserved(excludeOwnSlotFromHourCounts(data, booking, selectedDateKey));
        setSlotsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDateKey, roomId, variantLabel]);

  const todayKey = businessDate();
  const todayYear = Number(todayKey.slice(0, 4));
  const todayMonth = Number(todayKey.slice(5, 7)) - 1;
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const firstDay = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isEarliestMonth = viewYear === todayYear && viewMonth === todayMonth;

  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dStr = dateKey(viewYear, viewMonth, d);
    const dateObj = new Date(viewYear, viewMonth, d);
    const isPast = slotStartMs(dStr, closeHour) <= Date.now();
    const isToday = dStr === todayKey;
    const holiday = isHolidayDate(dStr, settings.holidays);
    const closedDay = !isOperatingDay(dateObj, settings.operatingHours);
    const dayList = excludeOwnSlotFromDayList(monthBookings[dStr], booking, dStr);
    const { availableStarts, nearlyFull } = getDayAvailability(dayList, openHour, closeHour, totalRooms, duration, dStr);
    const fullyBooked = availableStarts === 0;
    const unavailable = holiday || closedDay;
    const disabled = isPast || unavailable || fullyBooked;

    let variant = null;
    let title;
    if (isPast) title = 'This date has already passed';
    else if (unavailable) {
      variant = 'unavailable';
      title = holiday
        ? holidayReason(dStr, settings.holidays)
        : 'Closed on this day. No reservations are available on this date.';
    } else if (fullyBooked) {
      variant = 'full';
      title = 'Full — no rooms or start times left for this duration';
    } else if (nearlyFull) {
      variant = 'few';
      title = 'Nearly full — few rooms or start times left';
    } else {
      variant = 'available';
    }
    return { d, dStr, isToday, holiday, disabled, title, variant };
  });

  function goPrevMonth() {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }
  function goNextMonth() {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }

  function handleSelectDate(dStr) {
    setSelectedDateKey(dStr);
    setSelectedHour(null);
    setError('');
    setStep('time');
  }

  const slotGroups = useMemo(() => {
    if (!selectedDateKey) return {};
    const groups = { Morning: [], Afternoon: [], Evening: [], 'After midnight · next day': [] };
    for (let h = openHour; h < closeHour; h++) {
      if (slotStartMs(selectedDateKey, h) <= Date.now()) continue;
      const state = getSlotState(h, duration, closeHour, reserved, totalRooms);
      groups[getTimePeriod(h)].push({ hour: h, state });
    }
    return groups;
  }, [selectedDateKey, openHour, closeHour, duration, reserved, totalRooms]);

  const anySlotsAvailable = Object.values(slotGroups).some((slots) => slots.some((s) => s.state === 'available'));

  function handleSelectHour(hour) {
    setSelectedHour(hour);
    setError('');
    setStep('confirm');
  }

  async function handleConfirm() {
    if (selectedDateKey == null || selectedHour == null) return;
    setSubmitting(true);
    setError('');
    try {
      const { date, timeIn } = slotBookingFields(selectedDateKey, selectedHour);
      const updated = await bookingsService.reschedule(booking._id, { date, timeIn });
      setResult(updated);
      setStep('success');
    } catch (err) {
      setError(err.message || 'Could not reschedule your reservation. Please try another slot.');
      setStep('time');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone() {
    onRescheduled?.(result);
  }

  function handleHeaderBack() {
    if (step === 'confirm') setStep('time');
    else if (step === 'time') setStep('date');
    else if (step === 'success') handleDone();
    else onClose();
  }

  const newTimeLabel = selectedHour !== null
    ? `${formatHour(selectedHour)} – ${formatHour(selectedHour + duration)}${selectedHour + duration >= 24 && selectedHour < 24 ? ' next day' : ''}`
    : null;
  const newBookingDate = selectedDateKey && selectedHour !== null ? slotBookingFields(selectedDateKey, selectedHour).date : selectedDateKey;
  const currentStartHour = parseInt(String(booking.timeIn).split(':')[0], 10) || 0;
  const currentTimeLabel = `${formatHour(currentStartHour)} – ${formatHour(currentStartHour + duration)}`;

  return (
    <ModalPortal>
      <div className="bk-overlay open" id="reschedule-modal" role="dialog" aria-modal="true" aria-labelledby="reschedule-modal-title">
        <div className="bk-modal bk-modal--compact bk-modal--reschedule">
        <div className="bk-header">
          <button type="button" className="bk-modal-back" onClick={handleHeaderBack} aria-label={step === 'date' || step === 'success' ? 'Back to reservation' : step === 'time' ? 'Back to date' : 'Back to time'}>
            <ArrowLeft size={18} aria-hidden="true" /><span>Back</span>
          </button>
          <div className="bk-header-identity">
            <div>
              <p className="bk-eyebrow">{booking.reservationCode || 'Reservation'}</p>
              <h2 id="reschedule-modal-title">Reschedule your reservation</h2>
            </div>
          </div>
          <button type="button" className="bk-close" aria-label="Close reschedule" onClick={step === 'success' ? handleDone : onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {step !== 'success' && (
          <div className="bk-lock-banner">
            <i className="fa-solid fa-circle-info"></i>
            Reschedule at least 24 hours before your reservation starts. Your room, option, and {duration}-hour duration stay the same — only the date and time change. You have {usesLeft} reschedule{usesLeft === 1 ? '' : 's'} left for this reservation.
          </div>
        )}

        <div className="bk-content">
          <div className="bk-body">
            {step === 'date' && (
              <div className="bk-step" id="rsStepDate">
                <p className="bk-choose-label bk-choose-label--heading bk-choose-label--tight">Pick a new date</p>
                <p className="bk-choose-label bk-choose-label--sub">
                  Currently reserved for {formatDateLabel(booking.date)} · {currentTimeLabel}
                </p>

                <div className="bk-calendar-block">
                  <div className="bk-cal-head">
                    <button
                      className="bk-nav-btn"
                      aria-label="Previous month"
                      disabled={isEarliestMonth}
                      onClick={goPrevMonth}
                    >
                      <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    <span className="bk-month-label">{MONTHS[viewMonth]} {viewYear}</span>
                    <button className="bk-nav-btn" aria-label="Next month" onClick={goNextMonth}>
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>
                  </div>

                  <div className="bk-weekdays">
                    <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                  </div>

                  {monthLoading ? (
                    <div className="bk-skeleton-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                      {Array.from({ length: 35 }).map((_, i) => (
                        <div key={i} className="bk-skeleton-block bk-skeleton-tile" style={{ aspectRatio: '1', height: 'auto' }} />
                      ))}
                    </div>
                  ) : (
                    <div className="bk-grid" key={`${viewYear}-${viewMonth}`}>
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
                            (day.holiday ? ' bk-day--holiday' : '') +
                            (selectedDateKey === day.dStr ? ' bk-day--selected' : '')
                          }
                          title={day.title || undefined}
                          aria-label={day.title ? `${day.d}, ${day.title}` : `${day.d}`}
                          data-tooltip={day.title || undefined}
                          tabIndex={day.disabled ? undefined : 0}
                          role="button"
                          aria-disabled={day.disabled || undefined}
                          onClick={!day.disabled ? () => handleSelectDate(day.dStr) : undefined}
                          onKeyDown={!day.disabled ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectDate(day.dStr); } : undefined}
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
                  <span><i className="bk-dot bk-dot--few"></i> Nearly full</span>
                  <span><i className="bk-dot bk-dot--full"></i> Full</span>
                  <span><i className="bk-dot bk-dot--unavailable"></i> Closed</span>
                </div>
              </div>
            )}

            {step === 'time' && selectedDateKey && (
              <div className="bk-step" id="rsStepTime">
                <p className="bk-choose-label bk-choose-label--heading">Pick a {duration}-hour slot on {formatDateLabel(selectedDateKey)}</p>

                {error && (
                  <p className="bk-no-slots-msg">
                    <i className="fa-solid fa-circle-exclamation"></i> {error}
                  </p>
                )}

                {slotsLoading ? (
                  <div className="bk-skeleton-grid">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bk-skeleton-block" style={{ height: 56 }} />
                    ))}
                  </div>
                ) : !anySlotsAvailable ? (
                  <div className="bk-no-slots-msg">
                    <i className="fa-solid fa-circle-exclamation"></i>
                    No {duration}-hour slots are available on {formatDateLabel(selectedDateKey)}. Try{' '}
                    <button type="button" className="bk-no-slots-change-date" onClick={() => setStep('date')}>
                      another date
                    </button>.
                  </div>
                ) : (
                  Object.entries(slotGroups).map(([period, slots]) => (
                    slots.length > 0 && (
                      <div className="bk-slot-group" key={period}>
                        <span className="bk-slot-group-label">{period}</span>
                        <div className="bk-slots-grid">
                          {slots.map(({ hour, state }) => {
                            const availableCount = getAvailableRoomCountForDuration(reserved, totalRooms, hour, duration);
                            const isFewLeft = availableCount <= 2 && availableCount < totalRooms;
                            const statusTone = state === 'available' ? (isFewLeft ? ' is-limited' : ' is-open') : '';
                            return (
                              <div
                                key={hour}
                                className={
                                  'bk-slot' +
                                  (state !== 'available' ? ' bk-slot--reserved' : '') +
                                  (selectedHour === hour ? ' bk-slot--selected' : '')
                                }
                                onClick={state === 'available' ? () => handleSelectHour(hour) : undefined}
                                tabIndex={state === 'available' ? 0 : undefined}
                                role="button"
                                onKeyDown={state === 'available' ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectHour(hour); } : undefined}
                              >
                                <span className="bk-slot-time">{formatHour(hour)}</span>
                                <span className={`bk-slot-status${statusTone}`}>{state === 'available' ? hour >= 24 ? 'Next day · Available' : 'Available' : 'Unavailable'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  ))
                )}
              </div>
            )}

            {step === 'confirm' && selectedDateKey && selectedHour !== null && (
              <div className="bk-step" id="rsStepConfirm">
                <p className="bk-choose-label bk-choose-label--heading">Review your new schedule</p>

                <div className="bk-review-section">
                  <p className="bk-review-section-title">Current Reservation</p>
                  <div className="bk-review-card">
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-calendar-days"></i> Date</span>
                      <span className="bk-sr-value">{formatDateLabel(booking.date)}</span>
                    </div>
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-clock"></i> Time</span>
                      <span className="bk-sr-value">{currentTimeLabel}</span>
                    </div>
                  </div>
                </div>

                <div className="bk-review-section">
                  <p className="bk-review-section-title">New Reservation</p>
                  <div className="bk-review-card">
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-calendar-check"></i> Date</span>
                      <span className="bk-sr-value">{formatDateLabel(newBookingDate)}{selectedHour >= 24 ? ' (next day)' : ''}</span>
                    </div>
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-clock"></i> Time</span>
                      <span className="bk-sr-value">{newTimeLabel}</span>
                    </div>
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-hourglass-half"></i> Duration</span>
                      <span className="bk-sr-value">{duration} hour{duration === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                </div>

                <p className="bk-info-bar">
                  <i className="fa-solid fa-circle-info"></i>
                  Your room, option, and amount paid stay the same. This will use {usesLeft === 1 ? 'your last' : 'one of your'} remaining reschedule{usesLeft === 1 ? '' : 's'}.
                </p>

                {error && (
                  <p className="bk-no-slots-msg">
                    <i className="fa-solid fa-circle-exclamation"></i> {error}
                  </p>
                )}

                <div className="bk-detail-actions">
                  <button className="bk-back-btn" onClick={() => setStep('time')}>
                    <i className="fa-solid fa-arrow-left"></i> Change time
                  </button>
                  <button className="bk-confirm bk-continue" disabled={submitting} onClick={handleConfirm}>
                    {submitting ? 'Rescheduling…' : 'Confirm New Schedule'}
                  </button>
                </div>
              </div>
            )}

            {step === 'success' && result && (
              <div className="bk-step" id="rsStepSuccess">
                <div className="bk-confirm-icon"><i className="fa-solid fa-check"></i></div>
                <h3>Reservation Rescheduled!</h3>
                <p>Your new reservation time is confirmed below.</p>

                <div className="bk-review-section">
                  <div className="bk-review-card">
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-calendar-check"></i> New Date</span>
                      <span className="bk-sr-value">{formatDateLabel(result.date)}</span>
                    </div>
                    <div className="bk-summary-row">
                      <span className="bk-sr-label"><i className="fa-solid fa-clock"></i> New Time</span>
                      <span className="bk-sr-value">{newTimeLabel}</span>
                    </div>
                  </div>
                </div>

                <button className="bk-confirm bk-continue" onClick={handleDone}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export default RescheduleModal;
