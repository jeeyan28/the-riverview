import { useEffect, useMemo, useState } from 'react';
import { bookingsService } from '../services/bookings';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { formatHour } from '../utils/receipt';
import { buildHourCounts, getAvailableRoomCountForDuration, getSlotState, isHolidayDate, isOperatingDay } from '../utils/rooms';

export function reservationSelectionKey({ roomId, variantLabel, date, duration, timeIn }) {
  return [roomId, variantLabel || '', date, duration, timeIn].join('|');
}

function occupiedHours(rows, booking, roomId, variantLabel, date) {
  const counts = buildHourCounts(rows);
  const bookedRoomId = booking?.room?._id || booking?.room;
  if (booking && String(bookedRoomId) === String(roomId) && booking.date === date && (booking.variantLabel || '') === (variantLabel || '') && !['Cancelled', 'Rejected', 'No Show'].includes(booking.status)) {
    const start = Number.parseInt(booking.timeIn, 10);
    for (let hour = start; hour < start + Number(booking.duration); hour++) {
      counts[hour] = Math.max(0, Number(counts[hour] || 0) - 1);
    }
  }
  return counts;
}

function ReservationTimePicker({ room, variantLabel, date, duration, timeIn, onSelect, onAvailabilityChange, booking }) {
  const { openHour, closeHour, settings } = useSiteSettings();
  const [result, setResult] = useState({ key: '', rows: [], loading: false, error: '' });
  const [retry, setRetry] = useState(0);
  const roomId = room?._id || '';
  const needsVariant = Array.isArray(room?.variants) && room.variants.length > 0;
  const requestKey = [roomId, variantLabel || '', date].join('|');
  const selectionKey = reservationSelectionKey({ roomId, variantLabel, date, duration, timeIn });
  const dateObject = date ? new Date(`${date}T12:00:00`) : null;
  const closed = dateObject && (isHolidayDate(date, settings?.holidays) || !isOperatingDay(dateObject, settings?.operatingHours));
  const ready = Boolean(roomId && date && (!needsVariant || variantLabel) && Number.isInteger(Number(duration)) && Number(duration) > 0);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setResult({ key: requestKey, rows: [], loading: true, error: '' });
    bookingsService.availability({ roomId, date, variantLabel })
      .then((rows) => { if (!cancelled) setResult({ key: requestKey, rows: Array.isArray(rows) ? rows : [], loading: false, error: '' }); })
      .catch((error) => { if (!cancelled) setResult({ key: requestKey, rows: [], loading: false, error: error.message || 'Could not check availability.' }); });
    return () => { cancelled = true; };
  }, [ready, requestKey, retry]);

  const counts = useMemo(() => occupiedHours(result.rows, booking, roomId, variantLabel, date), [result.rows, booking, roomId, variantLabel, date]);
  const roomCount = Number(room?.variants?.find((variant) => variant.label === variantLabel)?.roomCount) || 1;
  const isLoaded = ready && result.key === requestKey && !result.loading && !result.error;
  const selectedHour = /^(?:[01]\d|2[0-3]):00$/.test(timeIn || '') ? Number.parseInt(timeIn, 10) : null;
  const selectedStart = selectedHour === null ? NaN : Date.parse(`${date}T${timeIn}:00+08:00`);
  let selectedState = 'incomplete';
  if (ready && selectedHour !== null) {
    if (!isLoaded) selectedState = result.error ? 'error' : 'loading';
    else if (closed || !Number.isFinite(selectedStart) || selectedStart <= Date.now() || selectedHour < openHour || selectedHour >= Math.min(closeHour, 24) || getSlotState(selectedHour, Number(duration), closeHour, counts, roomCount) !== 'available') selectedState = 'unavailable';
    else selectedState = 'available';
  }

  useEffect(() => {
    onAvailabilityChange?.({ key: selectionKey, status: selectedState });
  }, [onAvailabilityChange, selectionKey, selectedState]);

  if (!roomId || (needsVariant && !variantLabel)) return <p className="admin-slot-hint">Choose a facility and room type to see available times.</p>;
  if (!date) return <p className="admin-slot-hint">Choose a date to see available start times.</p>;
  if (!Number.isInteger(Number(duration)) || Number(duration) < 1) return <p className="admin-slot-hint">Choose a whole-hour duration to see available times.</p>;
  if (closed) return <p className="admin-slot-hint admin-slot-hint--warning">This date is closed. Choose another date.</p>;
  if (!isLoaded) return <div className="admin-slot-hint" role="status">{result.error ? <>{result.error} <button type="button" className="admin-slot-retry" onClick={() => setRetry((value) => value + 1)}>Try again</button></> : 'Checking available times…'}</div>;

  const slots = [];
  let anyAvailable = false;
  for (let hour = openHour; hour < Math.min(closeHour, 24); hour++) {
    const slot = `${String(hour).padStart(2, '0')}:00`;
    const start = Date.parse(`${date}T${slot}:00+08:00`);
    const past = !Number.isFinite(start) || start <= Date.now();
    const state = getSlotState(hour, Number(duration), closeHour, counts, roomCount);
    const available = !past && state === 'available';
    if (available) anyAvailable = true;
    const remaining = available ? getAvailableRoomCountForDuration(counts, roomCount, hour, Number(duration)) : 0;
    const label = past ? 'Past time' : state === 'insufficient' ? 'Ends after closing' : available ? roomCount === 1 ? 'Available' : `${remaining} room${remaining === 1 ? '' : 's'} available` : 'Unavailable';
    slots.push(<button key={hour} type="button" className={`admin-slot${timeIn === slot ? ' is-selected' : ''}`} aria-pressed={available ? timeIn === slot : undefined} aria-label={`${formatHour(hour)}, ${label}`} disabled={!available} onClick={() => onSelect(slot)}><strong>{formatHour(hour)}</strong><span>{label}</span></button>);
  }

  return <div className="admin-slot-picker"><div className="admin-slot-heading"><strong>Available start times</strong><span>{Number(duration)} hour{Number(duration) === 1 ? '' : 's'} · {date}</span></div>{!anyAvailable && <p className="admin-slot-hint admin-slot-hint--warning">No start times are available for this date and duration.</p>}<div className="admin-slot-grid" role="group" aria-label="Available reservation start times">{slots}</div><p className={`admin-slot-selection${selectedState === 'unavailable' ? ' is-unavailable' : ''}`} role="status">{selectedHour === null ? 'Select an available time to continue.' : selectedState === 'available' ? `${formatHour(selectedHour)} selected · ends ${formatHour(selectedHour + Number(duration))}` : 'The selected time is unavailable. Choose another time.'}</p></div>;
}

export default ReservationTimePicker;
