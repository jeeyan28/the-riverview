import { useCallback, useEffect, useState } from 'react';
import { dateKey, fetchReservedHours, loadMonthAvailability, clearReservedHours, clearMonthAvailability } from '../utils/rooms';
export function useBookingAvailability({ enabled, roomId, variantLabel, viewDate, selectedDate }) {
  const [monthBookings, setMonthBookings] = useState({}), [reserved, setReserved] = useState({});
  const [calendarLoading, setCalendarLoading] = useState(false), [slotsLoading, setSlotsLoading] = useState(false), [availabilityError, setAvailabilityError] = useState('');
  const [revision, setRevision] = useState(0);
  const year = viewDate.getFullYear(), month = viewDate.getMonth() + 1;
  const date = selectedDate ? dateKey(selectedDate.y, selectedDate.m, selectedDate.d) : '';
  useEffect(() => {
    if (!enabled || !roomId || !variantLabel) return undefined;
    const controller = new AbortController(); setCalendarLoading(true); setAvailabilityError('');
    clearMonthAvailability(roomId, year, month);
    loadMonthAvailability(roomId, year, month, variantLabel, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setMonthBookings(data); }).catch(error => { if (!controller.signal.aborted) setAvailabilityError(error.message); }).finally(() => { if (!controller.signal.aborted) setCalendarLoading(false); });
    return () => controller.abort();
  }, [enabled, roomId, variantLabel, year, month, revision]);
  useEffect(() => {
    if (!enabled || !roomId || !date) return undefined;
    const controller = new AbortController(); setSlotsLoading(true); setAvailabilityError(''); setReserved({});
    clearReservedHours(roomId, date);
    fetchReservedHours(roomId, date, variantLabel, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setReserved(data); }).catch(error => { if (!controller.signal.aborted) setAvailabilityError(error.message); }).finally(() => { if (!controller.signal.aborted) setSlotsLoading(false); });
    return () => controller.abort();
  }, [enabled, roomId, variantLabel, date, revision]);
  const retryAvailability = useCallback(() => setRevision(value => value + 1), []);
  return { monthBookings, reserved, setReserved, calendarLoading, slotsLoading, availabilityError, retryAvailability };
}
