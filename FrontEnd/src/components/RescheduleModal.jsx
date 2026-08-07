import { useEffect, useMemo, useState } from 'react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { bookingsService } from '../services/bookings';
import { roomsService } from '../services/rooms';
import { formatHour } from '../utils/receipt';
import {
  dateKey,
  fetchReservedHours,
  loadMonthAvailability,
  isDayFullyBooked,
  isHolidayDate,
  isOperatingDay,
  getSlotState,
  getTimePeriod,
} from '../utils/rooms';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const RESCHEDULE_MAX_USES = 2;
export const RESCHEDULE_CUTOFF_HOURS = 1;

export function bookingStartMs(dateStr, timeIn) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const hour = parseInt(String(timeIn).split(':')[0], 10) || 0;
  return new Date(y, (m || 1) - 1, d || 1, hour).getTime();
}

export function canRescheduleBooking(booking) {
  if (!booking || booking.status !== 'Confirmed') return false;
  if ((booking.rescheduleCount || 0) >= RESCHEDULE_MAX_USES) return false;
  return bookingStartMs(booking.date, booking.timeIn) - Date.now() >= RESCHEDULE_CUTOFF_HOURS * 3600000;
}

function formatDateLabel(dStr) {
  const [y, m, d] = dStr.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function excludeOwnSlotFromDayList(dayBookings, booking) {
  if (!dayBookings || !dayBookings.length) return dayBookings;
  const idx = dayBookings.findIndex(
    (b) => b.timeIn === booking.timeIn && Number(b.duration) === Number(booking.duration)
  );
  if (idx === -1) return dayBookings;
  const copy = dayBookings.slice();
  copy.splice(idx, 1);
  return copy;
}

function excludeOwnSlotFromHourCounts(reservedCounts, booking, dateStr) {
  if (dateStr !== booking.date) return reservedCounts;
  const startHour = parseInt(String(booking.timeIn).split(':')[0], 10);
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
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
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

  const today = new Date();
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const firstDay = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isCurrentMonth = today.getFullYear() === viewYear && today.getMonth() === viewMonth;
  const isEarliestMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const dStr = dateKey(viewYear, viewMonth, d);
    const dateObj = new Date(viewYear, viewMonth, d);
    const isPast = dateObj < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isToday = isCurrentMonth && d === today.getDate();
    const holiday = isHolidayDate(dStr, settings.holidays);
    const closedDay = !isOperatingDay(dateObj, settings.operatingHours);
    const dayList = excludeOwnSlotFromDayList(monthBookings[dStr], booking);
    const fullyBooked = isDayFullyBooked(dayList, openHour, closeHour, totalRooms);
    const disabled = isPast || holiday || closedDay || fullyBooked;
    let title;
    if (isPast) title = 'This date has already passed';
    else if (holiday) title = 'Closed for a holiday';
    else if (closedDay) title = 'Closed on this day';
    else if (fullyBooked) title = 'Fully booked';
    return { d, dStr, isToday, holiday, disabled, title };
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
    const groups = { Morning: [], Afternoon: [], Evening: [] };
    const isToday = selectedDateKey === dateKey(today.getFullYear(), today.getMonth(), today.getDate());
    const currentHour = today.getHours();
    for (let h = openHour; h < closeHour; h++) {
      if (isToday && h <= currentHour) continue;
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
      const timeIn = `${String(selectedHour).padStart(2, '0')}:00`;
      const updated = await bookingsService.reschedule(booking._id, { date: selectedDateKey, timeIn });
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

  const newTimeLabel = selectedHour !== null
    ? `${formatHour(selectedHour)} – ${formatHour(selectedHour + duration)}`
    : null;
  const currentStartHour = parseInt(String(booking.timeIn).split(':')[0], 10) || 0;
  const currentTimeLabel = `${formatHour(currentStartHour)} – ${formatHour(currentStartHour + duration)}`;

  return (
    <div className="bk-overlay open" id="reschedule-modal">
      <div className="bk-modal bk-modal--compact">
        <button className="bk-close" aria-label="Close" onClick={onClose}>✕</button>

        <div className="bk-header">
          <div className="bk-room-icon">
            <i className="fa-solid fa-calendar-clock"></i>
          </div>
          <div>
            <p className="bk-eyebrow">{booking.reservationCode || 'Reservation'}</p>
            <h2>Reschedule your reservation</h2>
          </div>
        </div>

        {step !== 'success' && (
          <div className="bk-lock-banner">
            <i className="fa-solid fa-circle-info"></i>
            Rescheduling keeps your room, option, and {duration}-hour duration — only the date and time change. You have {usesLeft} reschedule{usesLeft === 1 ? '' : 's'} left for this booking.
          </div>
        )}

        <div className="bk-content">
          <div className="bk-body">
            {step === 'date' && (
              <div className="bk-step" id="rsStepDate">
                <p className="bk-choose-label bk-choose-label--heading bk-choose-label--tight">Pick a new date</p>
                <p className="bk-choose-label bk-choose-label--sub">
                  Currently booked for {formatDateLabel(booking.date)} · {currentTimeLabel}
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
                            (day.holiday ? ' bk-day--holiday' : '') +
                            (selectedDateKey === day.dStr ? ' bk-day--selected' : '')
                          }
                          title={day.title}
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
                  <span><i className="bk-dot bk-dot--full"></i> Fully booked</span>
                  <span><i className="bk-dot bk-dot--unavailable"></i> Closed</span>
                </div>
              </div>
            )}

            {step === 'time' && selectedDateKey && (
              <div className="bk-step" id="rsStepTime">
                <button className="bk-back" onClick={() => setStep('date')}>
                  <i className="fa-solid fa-arrow-left"></i> Back to date
                </button>

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
                          {slots.map(({ hour, state }) => (
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
                              <span className="bk-slot-status">{state === 'available' ? 'Available' : 'Reserved'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  ))
                )}
              </div>
            )}

            {step === 'confirm' && selectedDateKey && selectedHour !== null && (
              <div className="bk-step" id="rsStepConfirm">
                <button className="bk-back" onClick={() => setStep('time')}>
                  <i className="fa-solid fa-arrow-left"></i> Back to time
                </button>

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
                      <span className="bk-sr-value">{formatDateLabel(selectedDateKey)}</span>
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
  );
}

export default RescheduleModal;
