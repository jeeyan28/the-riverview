import { useCallback, useEffect, useRef, useState } from 'react';
import { roomSessionsService } from '../services/monitoring';
import { bookingsService } from '../services/bookings';
import { BOOKING_STATUS } from '../utils/bookingStatus';
import { reservationWindow } from '../utils/reservationStatus';
import { sessionEnd, formatTimeRemaining } from './useRoomMonitorData';

export const TIME_WARNING_MS = 5 * 60 * 1000;
const TIME_WARNING_POLL_MS = 10 * 1000;

const startFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function sessionRoomLabel(session) {
  const room = session?.room && typeof session.room === 'object' ? session.room : null;
  return room?.roomName || session?.roomName || room?.facilityName || session?.facilityName || 'Monitor room';
}

function bookingRoomLabel(booking) {
  const room = booking?.room && typeof booking.room === 'object' ? booking.room : null;
  const label = room?.name || booking?.roomLabel || 'Room';
  return booking?.variantLabel ? `${label} · ${booking.variantLabel}` : label;
}

export function buildTimeWarnings(sessions, bookings, now = Date.now()) {
  const items = [];

  (Array.isArray(sessions) ? sessions : []).forEach((session) => {
    if (session?.status !== 'Active') return;
    const remaining = sessionEnd(session).getTime() - now;
    if (remaining > TIME_WARNING_MS) return;
    const reached = remaining <= 0;
    items.push({
      key: `session-${session._id}`,
      kind: 'session',
      severity: reached ? 'critical' : 'warning',
      title: reached ? 'Session time limit reached' : 'Session ending soon',
      detail: `${sessionRoomLabel(session)} · ${session.guestName || 'Walk-in guest'}`,
      hint: reached ? `Overdue by ${formatTimeRemaining(-remaining)}` : `Ends in ${formatTimeRemaining(remaining)}`,
      urgency: remaining,
    });
  });

  (Array.isArray(bookings) ? bookings : []).forEach((booking) => {
    if (booking?.status !== BOOKING_STATUS.CONFIRMED || booking?.cancellationStatus === 'Requested') return;
    const window = reservationWindow(booking);
    if (!window || now > window.end) return;
    const untilStart = window.start - now;
    if (untilStart > TIME_WARNING_MS) return;
    const started = untilStart <= 0;
    items.push({
      key: `booking-${booking._id}`,
      kind: 'reservation',
      severity: started ? 'critical' : 'warning',
      title: started ? 'Reservation not checked in' : 'Reservation starting soon',
      detail: `${bookingRoomLabel(booking)} · ${booking.guestName || 'Guest'}`,
      hint: started ? `Start time ${startFormatter.format(new Date(window.start))} passed` : `Starts in ${formatTimeRemaining(untilStart)}`,
      urgency: untilStart,
    });
  });

  return items.sort((a, b) => a.urgency - b.urgency);
}

export function useAdminTimeWarnings() {
  const [sessions, setSessions] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [, forceTick] = useState(0);
  const mountedRef = useRef(false);
  const pendingRef = useRef(null);
  const generationRef = useRef(0);

  // warnings polling
  const refresh = useCallback(() => {
    if (pendingRef.current) return pendingRef.current;
    const generation = generationRef.current;
    const request = (async () => {
      try {
        const [nextSessions, nextBookings] = await Promise.all([
          roomSessionsService.list().catch(() => null),
          bookingsService.list({ status: BOOKING_STATUS.CONFIRMED }).catch(() => null),
        ]);
        if (!mountedRef.current || generation !== generationRef.current) return;
        if (Array.isArray(nextSessions)) setSessions(nextSessions);
        if (Array.isArray(nextBookings)) setBookings(nextBookings);
      } finally {
        if (mountedRef.current && generation === generationRef.current && pendingRef.current === request) {
          pendingRef.current = null;
        }
      }
    })();
    pendingRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const pollId = setInterval(refresh, TIME_WARNING_POLL_MS);
    const tickId = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingRef.current = null;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [refresh]);

  return { sessions, bookings };
}
