import '../../styles/admin/monitor.css';
import '../../styles/admin/finance.css';
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import Modal from '../../components/Modal';
import { ExtendSessionModal, FinishSessionModal, RoomDetailModal } from '../../components/admin/MonitorDialogs';
import DataTable from '../../components/DataTable';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { roomSessionsService } from '../../services/monitoring';
import { bookingsService } from '../../services/bookings';
import { businessDate } from '../../utils/businessDate';
import { reservationWindow, roomMonitorSchedule } from '../../utils/reservationStatus';
import { calculateBookingPrice, variantRateLabel } from '../../utils/roomPricing';
import { getBookingRoomTarget } from '../../utils/monitorInventory';
import {
  useRoomMonitorData,
  sessionEnd,
  formatTimeRemaining,
  findRoomOccupancy,
  buildRoomView,
} from '../../hooks/useRoomMonitorData';

const FACILITY_ICONS = { Billiards: 'bi-disc', KTV: 'bi-mic', Court: 'bi-trophy' };
const FACILITY_ICON_DEFAULT = 'bi-building';
const DUE_BOOKINGS_POLL_MS = 20 * 1000;
const MAX_SESSION_HOURS = 5;
function canExtendSession(session) {
  return MAX_SESSION_HOURS - Number(session?.duration || 0) >= 0.5;
}

function paymentSummary(record, isBooking = false) {
  const total = Math.max(0, Number(record?.amount) || 0);
  const paid = Math.max(
    0,
    Number(record?.paidAmount) || 0,
    isBooking ? Number(record?.downPayment) || 0 : record?.paymentStatus === 'Paid' ? total : 0,
  );
  const refunded = Math.max(0, Number(record?.refundedAmount) || 0);
  const collected = Math.max(0, paid - refunded);
  const balance = Math.max(0, Math.round((total - collected) * 100) / 100);
  return { total, paid, refunded, collected, balance };
}

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const boardClock = (date) => date.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s+/g, '').toLowerCase();
const scheduleDate = (date) => new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' });
const reservationNoticeTime = (value) => {
  const startMs = Date.parse(value || '');
  return Number.isFinite(startMs)
    ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(startMs)
    : '';
};

function SessionPayment({ session }) {
  const payment = paymentSummary(session);
  const hasBalance = payment.balance > 0;
  return (
    <div className={`rm-payment-summary${hasBalance ? ' has-balance' : ' is-paid'}`}>
      <span className="rm-payment-label">{hasBalance ? 'Balance remaining' : 'Paid in full'}</span>
      <strong className="rm-payment-amount">{money(hasBalance ? payment.balance : payment.collected)}</strong>
      {hasBalance && <span className="rm-payment-detail">{payment.collected > 0 ? `${money(payment.collected)} paid` : 'No payment recorded'}</span>}
    </div>
  );
}

function matchRoomForTarget(rooms, roomTarget) {
  if (!roomTarget) return { matchedRoom: null, previewNumber: null };
  const { facilityName, roomName, startingRoomNumber, roomCount } = roomTarget;
  const facilityRooms = rooms.filter((r) => r.facilityName === facilityName && r.roomName === roomName);

  if (!Number.isFinite(startingRoomNumber) || startingRoomNumber < 1 || !Number.isFinite(roomCount) || roomCount < 1) {
    const matchedRoom = facilityRooms.find((r) => r.roomName === roomName && r.status === 'Available') || null;
    return { matchedRoom, previewNumber: null };
  }

  const rangeEnd = startingRoomNumber + roomCount - 1;
  const inRange = facilityRooms
    .map((r) => ({ room: r, num: Number(r.roomNumber) }))
    .filter((r) => Number.isFinite(r.num) && r.num >= startingRoomNumber && r.num <= rangeEnd)
    .sort((a, b) => a.num - b.num);

  const availableInRange = inRange.find((r) => r.room.status === 'Available');
  if (availableInRange) return { matchedRoom: availableInRange.room, previewNumber: null };

  const usedInRange = new Set(inRange.map((r) => r.num));
  let nextInRange = startingRoomNumber;
  while (nextInRange <= rangeEnd && usedInRange.has(nextInRange)) nextInRange++;
  if (nextInRange <= rangeEnd) return { matchedRoom: null, previewNumber: nextInRange };
  if (inRange.length) return { matchedRoom: inRange[0].room, previewNumber: null };

  const usedAll = new Set(facilityRooms.map((r) => Number(r.roomNumber)).filter((n) => Number.isFinite(n) && n > 0));
  let overflow = rangeEnd + 1;
  while (usedAll.has(overflow)) overflow++;
  return { matchedRoom: null, previewNumber: overflow };
}

function Monitor() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');
  const canOperate = hasPermission('room:operate');
  const canManageBookings = hasPermission('booking:manage');
  const canStartFromBooking = canOperate || canManageBookings;
  const { confirm, confirmProps } = useConfirm();

  const {
    rooms, sessions, loading, refreshError, lastUpdatedAt,
    fetchMonitorSessions, applySessionChange,
    viewMode, changeViewMode,
    soundMuted, toggleSoundMuted,
  } = useRoomMonitorData('admin');

  const [modal, setModal] = useState(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedulePeriod, setSchedulePeriod] = useState('today');
  const [finishingSession, setFinishingSession] = useState(null);
  const [extendingSession, setExtendingSession] = useState(null);
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [roomNameFilter, setRoomNameFilter] = useState('All');
  const [sortBy, setSortBy] = useState('default');
  const [detailRoomId, setDetailRoomId] = useState(null);
  const [dueBookings, setDueBookings] = useState([]);
  const [cancellingSessionId, setCancellingSessionId] = useState(null);
  async function fetchDueBookings() {
    if (!canStartFromBooking) return;
    try {
      const data = await bookingsService.list({ status: 'Confirmed' });
      const list = Array.isArray(data) ? data : [];
      setDueBookings(list);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchDueBookings();
    const handle = setInterval(fetchDueBookings, DUE_BOOKINGS_POLL_MS);
    return () => clearInterval(handle);
  }, []);

  function selectFacilityFilter(name) {
    setFacilityFilter(name);
    setRoomNameFilter('All');
  }

  function endSession(session) {
    if (refreshError || !guardPermission('room:operate')) return;
    setFinishingSession(session);
  }

  async function finishSession(payment) {
    if (refreshError || !guardPermission('room:operate')) return;
    await roomSessionsService.end(finishingSession._id, payment);
    setFinishingSession(null);
    await fetchMonitorSessions();
    await fetchDueBookings();
  }

  async function extendSession({ addedHours, collectNow, expectedCharge, paymentMethod }) {
    if (refreshError) throw new Error('Wait for the table status to refresh before extending this session.');
    if (!guardPermission('room:operate')) throw new Error('You do not have permission to extend this session.');
    await roomSessionsService.extend(extendingSession._id, { addedHours, collectNow, expectedCharge, ...(collectNow ? { paymentMethod } : {}) });
    setExtendingSession(null);
    await fetchMonitorSessions();
    if (extendingSession.booking) await fetchDueBookings();
  }

  async function cancelSession(sessionId) {
    if (cancellingSessionId || refreshError || !guardPermission('room:operate')) return;
    if (!(await confirm('Cancel this accidental session and release the table? Its payment and session history will be kept. A linked reservation will be restored for a new start.', { confirmText: 'Cancel Session' }))) return;
    setCancellingSessionId(sessionId);
    try {
      const result = await roomSessionsService.remove(sessionId);
      applySessionChange(result.session, result.room);
      fetchMonitorSessions();
      if (result.session.booking) fetchDueBookings();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not cancel this session.');
    } finally {
      setCancellingSessionId(null);
    }
  }

  function openStartSessionModal(room) {
    if (refreshError || !guardPermission('room:operate')) return;
    setModal({ fixedRoom: room });
  }
  function openStartFromBooking(booking, matchedRoom, roomTarget, previewNumber) {
    if (refreshError || !canStartFromBooking) return;
    setModal({
      fixedRoom: matchedRoom,
      roomTarget: matchedRoom ? null : roomTarget,
      previewNumber: matchedRoom ? null : previewNumber,
      bookingId: booking._id,
      scheduledStartMs: reservationWindow(booking)?.start,
      scheduledEndMs: reservationWindow(booking)?.end,
      initialGuestName: booking.guestName,
      initialDurationHours: booking.duration,
      downPaymentInfo: paymentSummary(booking, true),
      venueDiscount: booking.paymentChoice === 'deposit' ? Number(booking.eligibleDiscount || 0) : 0,
      paymentChoice: booking.paymentChoice,
    });
  }

  async function handleModalSubmit({ roomId, roomTarget, totalHours, paymentMethod, paymentTiming, paidAmount, guestName, guestCount, bookingId, applyVenueDiscount }) {
    if (refreshError) throw new Error('Wait for the table status to refresh before changing this session.');
    if (bookingId) {
      if (!canStartFromBooking) return;
    } else if (!guardPermission('room:operate')) {
      return;
    }

    await roomSessionsService.create({ roomId, roomTarget: roomTarget || undefined, duration: totalHours, paymentMethod, paymentTiming, paidAmount, guestName, guestCount, bookingId, applyVenueDiscount });

    setModal(null);
    await fetchMonitorSessions();
    if (bookingId) await fetchDueBookings();
  }

  const facilities = [...new Set(rooms.map((r) => r.facilityName))];
  const facilityCounts = rooms.reduce((acc, r) => {
    acc[r.facilityName] = (acc[r.facilityName] || 0) + 1;
    return acc;
  }, {});
  const filteredRooms = facilityFilter === 'All' ? rooms : rooms.filter((r) => r.facilityName === facilityFilter);
  const roomNameOptions = facilityFilter === 'All' ? [] : [...new Set(filteredRooms.map((r) => r.roomName))];
  const visibleRooms = (() => {
    const list = roomNameFilter === 'All' ? filteredRooms : filteredRooms.filter((r) => r.roomName === roomNameFilter);
    const compareRoomNumber = (a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true, sensitivity: 'base' });
    if (sortBy === 'timeLeft') {
      return [...list].sort((a, b) => {
        const occA = findRoomOccupancy(a._id, sessions);
        const occB = findRoomOccupancy(b._id, sessions);
        const remA = occA ? sessionEnd(occA).getTime() - Date.now() : null;
        const remB = occB ? sessionEnd(occB).getTime() - Date.now() : null;
        if (remA == null && remB == null) return 0;
        if (remA == null) return 1;
        if (remB == null) return -1;
        return remA - remB;
      });
    }
    if (sortBy === 'roomNumber') {
      return [...list].sort(compareRoomNumber);
    }
    return list;
  })();
  const facilityGroups = facilities
    .map((name) => [name, visibleRooms.filter((room) => room.facilityName === name)])
    .filter(([, facilityRooms]) => facilityRooms.length > 0);

  const stats = rooms.reduce((acc, r) => {
    const v = buildRoomView(r, sessions);
    if (!v.occupancy) {
      if (r.status === 'Available') acc.available += 1;
    } else if (v.isPastEnd || v.isCritical) {
      acc.overdue += 1;
    } else if (v.isWarning) {
      acc.endingSoon += 1;
    } else {
      acc.occupied += 1;
    }
    return acc;
  }, { available: 0, occupied: 0, endingSoon: 0, overdue: 0 });

  const detailRoom = detailRoomId ? rooms.find((r) => r._id === detailRoomId) || null : null;
  const detailView = detailRoom ? buildRoomView(detailRoom, sessions) : null;
  const scheduleNow = Date.now();
  const scheduleToday = businessDate(scheduleNow);
  const schedule = roomMonitorSchedule(dueBookings, scheduleNow);
  const { bookings: scheduledBookings, today: todayBookings, upcoming: upcomingBookings, earlier: earlierBookings } = schedule;
  const displayedBookings = schedule[schedulePeriod];

  const roomTableColumns = [
    {
      key: 'rate',
      label: 'Rate',
      sortable: true,
      sortValue: (r) => Number(buildRoomView(r, sessions).occupancy?.rate) || Number(r.price) || 0,
      render: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        const rate = Number(occupancy?.rate) || Number(r.price) || 0;
        return <div className="rm-board-rate"><strong>{money(rate)}</strong><small>per hour</small></div>;
      },
    },
    {
      key: 'room',
      label: 'Table #',
      sortable: true,
      sortValue: (r) => Number(r.roomNumber) || r.roomNumber,
      render: (r) => (
        <>
          <div className="rm-name">{r.facilityName === 'Billiards' ? 'Table' : 'Room'} {r.roomNumber}</div>
          <div className="rm-type">{r.facilityName}{r.hasCustomName ? ` · ${r.roomName}` : ''}</div>
        </>
      ),
    },
    {
      key: 'start',
      label: 'Time-in',
      render: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        if (!occupancy) return <span className="rm-board-empty">—</span>;
        const start = new Date(occupancy.startTime);
        return <span className="rm-board-time"><strong>{boardClock(start)}</strong></span>;
      },
    },
    {
      key: 'end',
      label: 'Time-out',
      render: (r) => {
        const { occupancy, remaining, isPastEnd, isCritical, isWarning } = buildRoomView(r, sessions);
        if (!occupancy) return <span className="rm-board-empty">—</span>;
        const end = sessionEnd(occupancy);
        return <div className="rm-board-time"><strong>{boardClock(end)}</strong><small className={`rm-timer${isWarning ? ' warn' : ''}${(isPastEnd || isCritical) ? ' expired' : ''}`}>{isPastEnd ? `Overdue ${formatTimeRemaining(remaining, true)}` : `${formatTimeRemaining(remaining, false)} left`}</small></div>;
      },
    },
    {
      key: 'status',
      label: 'Status / Guest',
      render: (r) => {
        const { occupancy, stateClass, statusLabel } = buildRoomView(r, sessions);
        return (
          <div className="rm-board-status"><span className={`rm-status-pill status-${stateClass}`}><span className="dot"></span>{statusLabel}</span>{occupancy && <small>{occupancy.guestName || 'Walk-in guest'}</small>}</div>
        );
      },
    },
    {
      key: 'payment',
      label: 'Payment',
      sortable: true,
      sortValue: (r) => paymentSummary(buildRoomView(r, sessions).occupancy).balance,
      render: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        return occupancy ? <SessionPayment session={occupancy} /> : '—';
      },
    },
    {
      key: 'actions',
      label: 'Action',
      render: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        return (
          <div className="rm-actions rm-actions--table">
            {occupancy ? (
              canOperate && !refreshError ? (
                <>
                  {canExtendSession(occupancy) && <button className="rm-btn" disabled={!!cancellingSessionId} onClick={() => setExtendingSession(occupancy)}><i className="bi bi-clock-history"></i>Extend</button>}
                  <button className="rm-btn rm-btn--success" disabled={!!cancellingSessionId} onClick={() => endSession(occupancy)}><i className="bi bi-check2-circle"></i>Finish</button>
                  <button className="rm-btn danger" disabled={!!cancellingSessionId} onClick={() => cancelSession(occupancy._id)}><i className="bi bi-x-circle"></i>{cancellingSessionId === occupancy._id ? 'Cancelling…' : 'Cancel'}</button>
                </>
              ) : (
                <span className="rm-note">In use</span>
              )
            ) : r.status === 'Available' ? (
              canOperate ? (
                <button className="rm-btn primary" onClick={() => openStartSessionModal(r)}><i className="bi bi-play-fill"></i>Start Session</button>
              ) : (
                <span className="rm-note">No permission</span>
              )
            ) : (
              <span className="rm-note">{r.status}</span>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="panel active" id="panel-monitor">
      <div className="rm-toolbar-head">
        <div className="rm-page-head">
          <span className="live-badge"><span className="dot"></span>{refreshError ? 'Reconnecting' : loading ? 'Connecting' : 'Live'}</span>
          <span className="rm-page-sub">Real-time table status and session monitoring</span>
        </div>
        <div className="rm-toolbar-actions">
          {canStartFromBooking && (
            <button type="button" className="rm-reservations-button" aria-haspopup="dialog" onClick={() => { setSchedulePeriod(schedule.defaultPeriod); setScheduleOpen(true); }}>
              <i className="bi bi-calendar-check" aria-hidden="true"></i>View reservations ({scheduledBookings.length})
            </button>
          )}
          <div className="view-toggle" role="group" aria-label="Room display">
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
              aria-pressed={viewMode === 'grid'}
              onClick={() => changeViewMode('grid')}
            >
              <i className="bi bi-grid" aria-hidden="true"></i>Grid
            </button>
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'table' ? ' active' : ''}`}
              aria-pressed={viewMode === 'table'}
              onClick={() => changeViewMode('table')}
            >
              <i className="bi bi-list-ul" aria-hidden="true"></i>Table
            </button>
          </div>
          <div className="rm-toolbar-links">
            <a className="rm-toolbar-link" href="/lobby-monitor" target="_blank" rel="noreferrer" aria-label="Open lobby display in a new tab">
              <i className="bi bi-tv" aria-hidden="true"></i>Lobby display
            </a>
            {canManage && (
              <Link className="rm-toolbar-link" to="/admin/room-management">
                <i className="bi bi-building-gear" aria-hidden="true"></i>Manage inventory
              </Link>
            )}
          </div>
        </div>
      </div>

      {refreshError && (
        <div className="rm-refresh-error" role="status">
          <div className="rm-refresh-error-copy">
            <i className="bi bi-wifi-off" aria-hidden="true"></i>
            <span>
              <strong>Monitor is reconnecting</strong>
              <small>{lastUpdatedAt ? `Last checked at ${new Date(lastUpdatedAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}.` : 'Availability is temporarily unknown.'} Controls resume after a successful refresh.</small>
            </span>
          </div>
          <button type="button" className="rm-btn" onClick={fetchMonitorSessions}><i className="bi bi-arrow-clockwise" aria-hidden="true"></i>Retry</button>
        </div>
      )}

      {!loading && rooms.length > 0 && (
        <div className="rm-stats-bar">
          <div className="rm-stat rm-stat--available">
            <span className="rm-stat-label">Available</span>
            <span className="rm-stat-value">{stats.available}</span>
          </div>
          <div className="rm-stat rm-stat--occupied">
            <span className="rm-stat-label">Occupied</span>
            <span className="rm-stat-value">{stats.occupied}</span>
          </div>
          <div className="rm-stat rm-stat--warning">
            <span className="rm-stat-label">Ending Soon</span>
            <span className="rm-stat-value">{stats.endingSoon}</span>
          </div>
          <div className="rm-stat rm-stat--overdue">
            <span className="rm-stat-label">Overdue</span>
            <span className="rm-stat-value">{stats.overdue}</span>
          </div>
        </div>
      )}

      {canStartFromBooking && (
        <Modal
          open={scheduleOpen}
          onClose={() => setScheduleOpen(false)}
          ariaLabel="Reservation schedule"
          className="rm-schedule-drawer"
          backdropClassName="rm-schedule-backdrop"
        >
          <div className="rm-due-wrap">
            <div className="rm-schedule-top">
              <div className="rm-due-head">
                <div className="rm-schedule-heading">
                  <span className="card-title">Reservation schedule</span>
                  <span className="rm-schedule-today">Confirmed reservations waiting to start{schedulePeriod === 'today' ? ` · ${scheduleDate(scheduleToday)}` : ''}</span>
                </div>
                <button type="button" className="rm-btn rm-schedule-close" onClick={() => setScheduleOpen(false)} aria-label="Close reservation schedule">Close</button>
              </div>
              <div className="rm-schedule-tabs" aria-label="Reservation dates">
                <button type="button" className={schedulePeriod === 'today' ? 'active' : ''} aria-pressed={schedulePeriod === 'today'} onClick={() => setSchedulePeriod('today')}>Today <span>{todayBookings.length}</span></button>
                <button type="button" className={schedulePeriod === 'upcoming' ? 'active' : ''} aria-pressed={schedulePeriod === 'upcoming'} onClick={() => setSchedulePeriod('upcoming')}>Upcoming <span>{upcomingBookings.length}</span></button>
                <button type="button" className={schedulePeriod === 'earlier' ? 'active' : ''} aria-pressed={schedulePeriod === 'earlier'} onClick={() => setSchedulePeriod('earlier')}>Earlier <span>{earlierBookings.length}</span></button>
              </div>
            </div>
            {displayedBookings.length > 0 ? (
              <div className="rm-schedule-list">
                {displayedBookings.map((b, index) => {
                  const roomTarget = getBookingRoomTarget(b, rooms);
                  const { matchedRoom, previewNumber } = matchRoomForTarget(rooms, roomTarget);
                  const scheduledStart = new Date(`${b.date}T${String(b.timeIn).padStart(5, '0')}:00+08:00`);
                  const isDue = scheduledStart.getTime() <= Date.now();
                  const scheduledEnd = new Date(reservationWindow(b).end);
                  const occupancy = matchedRoom ? findRoomOccupancy(matchedRoom._id, sessions) : null;
                  const hasConflict = matchedRoom && (matchedRoom.status !== 'Available' || occupancy);
                  const payment = paymentSummary(b, true);
                  const facilityLabel = roomTarget?.facilityName || b.room?.name || b.roomLabel || 'Facility unavailable';
                  const variantLabel = b.variantLabel || (roomTarget?.roomName !== facilityLabel ? roomTarget?.roomName : '');
                  const unitLabel = facilityLabel === 'Billiards' ? 'Table' : facilityLabel === 'Court' ? 'Court' : 'Room';
                  const assignmentLabel = matchedRoom
                    ? `${unitLabel} ${matchedRoom.roomNumber}`
                    : roomTarget
                      ? previewNumber ? `${unitLabel} ${previewNumber} · assigned on start` : 'Assigned on start'
                      : 'No matching active room';
                  return (
                    <Fragment key={b._id}>
                      {schedulePeriod !== 'today' && (index === 0 || displayedBookings[index - 1].date !== b.date) && (
                        <h3 className="rm-schedule-date">{scheduleDate(b.date)}</h3>
                      )}
                      <div className={`rm-schedule-item rm-schedule-item--${isDue ? 'due' : 'upcoming'}`}>
                        <div className="rm-schedule-slot">
                          <strong>{boardClock(scheduledStart)}</strong>
                          <small>to {boardClock(scheduledEnd)}</small>
                        </div>
                        <div className="rm-schedule-reservation">
                          <strong className="rm-guest-name">{b.guestName}</strong>
                          <span className={`rm-schedule-location${!roomTarget ? ' needs-review' : ''}`}>
                            {facilityLabel}{variantLabel ? ` · ${variantLabel}` : ''} · {assignmentLabel}
                          </span>
                          <span className={`rm-schedule-payment${payment.balance === 0 ? ' paid' : ' due'}`}>
                            {payment.balance === 0 ? 'Fully paid' : `${money(payment.balance)} balance due`}
                          </span>
                          {payment.balance > 0 && payment.collected > 0 && <small className="rm-schedule-collected">{money(payment.collected)} collected</small>}
                          {b.paymentChoice === 'deposit' && Number(b.eligibleDiscount) > 0 && <small className="rm-schedule-discount">{Number(b.discountPercent) > 0 ? `${b.discountPercent}% room discount` : 'Room discount'} · {money(b.eligibleDiscount)} to settle at the facility</small>}
                          {b.paymentChoice === 'full' && Number(b.discountAmount) > 0 && <small className="rm-schedule-discount">{Number(b.discountPercent) > 0 ? `${b.discountPercent}% room discount` : 'Room discount'} · {money(b.discountAmount)} applied online</small>}
                          {hasConflict && <small className="rm-schedule-warning">{unitLabel} occupied — end that session first</small>}
                        </div>
                        <div className="rm-schedule-action">
                          <span className={`rm-schedule-state${isDue ? ' is-due' : ''}`}>{isDue ? 'Due now' : 'Upcoming'}</span>
                          <button
                            type="button"
                            className="rm-btn primary"
                            disabled={!!refreshError || !isDue || !roomTarget || hasConflict}
                            title={!isDue ? 'This reservation has not started yet.' : !roomTarget ? 'No matching active room was found for this reservation.' : hasConflict ? 'End the current session on this room first.' : ''}
                            aria-label={`Start reservation for ${b.guestName}`}
                            onClick={() => {
                              setScheduleOpen(false);
                              openStartFromBooking(b, matchedRoom, roomTarget, previewNumber);
                            }}
                          >
                            <i className="bi bi-play-circle" aria-hidden="true"></i>Start Now
                          </button>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            ) : (
              <p className="rm-schedule-empty">{schedulePeriod === 'today' ? 'No reservations waiting to start today.' : schedulePeriod === 'upcoming' ? 'No upcoming reservations waiting to start.' : 'No earlier reservations waiting to start.'}</p>
            )}
          </div>
        </Modal>
      )}

      {loading ? (
        <div className="room-grid"><div className="room-grid-empty">Loading tables…</div></div>
      ) : rooms.length === 0 ? (
        <div className="room-grid">
          <div className="room-grid-empty rm-monitor-empty">
            <i className={`bi ${refreshError ? 'bi-cloud-slash' : 'bi-grid-3x3-gap'}`} aria-hidden="true"></i>
            <strong>{refreshError ? 'Waiting for table status' : 'No tables configured yet'}</strong>
            <span>{refreshError ? 'The live floor will appear here when the connection returns.' : 'Add a facility and its rooms to begin monitoring.'}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="fac-toolbar">
            <div className="fac-chips" role="group" aria-label="Filter by facility">
              <button
                type="button"
                className={`fac-chip${facilityFilter === 'All' ? ' active' : ''}`}
                onClick={() => selectFacilityFilter('All')}
              >
                View all ({rooms.length})
              </button>
              {facilities.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`fac-chip${facilityFilter === name ? ' active' : ''}`}
                  onClick={() => selectFacilityFilter(name)}
                >
                  {name} ({facilityCounts[name] || 0})
                </button>
              ))}
            </div>
            {facilityFilter !== 'All' && roomNameOptions.length > 1 && (
              <div className="fac-chips" role="group" aria-label="Filter by table type">
                <button
                  type="button"
                  className={`fac-chip${roomNameFilter === 'All' ? ' active' : ''}`}
                  onClick={() => setRoomNameFilter('All')}
                >
                  All Tables
                </button>
                {roomNameOptions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`fac-chip${roomNameFilter === name ? ' active' : ''}`}
                    onClick={() => setRoomNameFilter(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <label className="rm-sort-control">
              <span>Sort rooms</span>
              <select className="rm-sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="default">Default order</option>
                <option value="timeLeft">Time left</option>
                <option value="roomNumber">Table number</option>
              </select>
            </label>
            <div className="legend">
              <button
                type="button"
                className={`fac-chip${soundMuted ? '' : ' active'}`}
                onClick={toggleSoundMuted}
                title={soundMuted ? 'Unmute overdue alert sound' : 'Mute overdue alert sound'}
              >
                <i className={`bi ${soundMuted ? 'bi-bell-slash' : 'bi-bell-fill'}`}></i>{soundMuted ? 'Sound Off' : 'Sound On'}
              </button>
            </div>
          </div>

          {viewMode === 'grid' ? (
        <>
          {facilityGroups.map(([facilityName, facilityRooms]) => (
            <div className="rm-group" key={facilityName}>
              <div className="rm-group-head">
                <i className={`bi ${FACILITY_ICONS[facilityName] || FACILITY_ICON_DEFAULT} rm-group-ico`}></i>
                {facilityName} <span className="rm-group-count">· {facilityRooms.length} Room{facilityRooms.length === 1 ? '' : 's'}</span>
              </div>
              <div className={`room-grid${facilityFilter === 'All' ? ' room-grid--all' : ''}`}>
                {facilityRooms.map((r) => {
            const v = buildRoomView(r, sessions);
            const { occupancy, remaining, isPastEnd, isCritical, isWarning, stateClass, statusLabel, blinkClass } = v;
            const isPaid = occupancy ? paymentSummary(occupancy).balance <= 0 : false;

            return (
              <div
                className={`rm ${stateClass}${blinkClass}`}
                key={r._id}
                onClick={() => setDetailRoomId(r._id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    setDetailRoomId(r._id);
                  }
                }}
              >
                {occupancy && (isCritical || isPastEnd) && (
                  <span className="rm-warning-pop"><i className="bi bi-exclamation-triangle-fill"></i></span>
                )}
                <div className="rm-head">
                  <div>
                    <div className="rm-name">Table {r.roomNumber}</div>
                    {r.hasCustomName && <div className="rm-type">{r.roomName}</div>}
                  </div>
                  <div className="rm-head-right">
                    {occupancy && (isCritical || isPastEnd) && (
                      <span className="rm-ico ico-red"><i className="bi bi-exclamation-triangle-fill"></i></span>
                    )}
                    <span className={`rm-status-pill status-${stateClass}`}><span className="dot"></span>{statusLabel}</span>
                  </div>
                </div>
                {occupancy ? (
                  <>
                    <div className="rm-timer-row">
                      <div>
                        {isPastEnd && <div className="rm-timer-caption">Overdue</div>}
                        <div className={`rm-timer-big${isWarning ? ' warn' : ''}${(isPastEnd || isCritical) ? ' expired' : ''}`}>
                          {formatTimeRemaining(remaining, isPastEnd)}
                        </div>
                        {!isPastEnd && <div className="rm-timer-caption">Time left</div>}
                      </div>
                      <span className={`pay-pill ${isPaid ? 'pay-paid' : 'pay-unpaid'}`}>
                        {isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </div>
                    <button type="button" className="rm-card-details" onClick={(event) => { event.stopPropagation(); setDetailRoomId(r._id); }}>View details <i className="bi bi-arrow-right" aria-hidden="true"></i></button>
                    {canOperate && !refreshError && (
                      <div className={`rm-quick-actions${canExtendSession(occupancy) ? '' : ' rm-quick-actions--no-extend'}`}>
                        {canExtendSession(occupancy) && <button
                          type="button"
                          className="rm-btn"
                          disabled={!!cancellingSessionId}
                          onClick={(e) => { e.stopPropagation(); setExtendingSession(occupancy); }}
                        >
                          <i className="bi bi-clock-history"></i>Extend
                        </button>}
                        <button
                          type="button"
                          className="rm-btn rm-btn--success"
                          disabled={!!cancellingSessionId}
                          onClick={(e) => { e.stopPropagation(); endSession(occupancy); }}
                        >
                          <i className="bi bi-check2-circle"></i>Finish
                        </button>
                        <button
                          type="button"
                          className="rm-btn danger rm-btn--icon"
                          disabled={!!cancellingSessionId}
                          title={cancellingSessionId === occupancy._id ? 'Cancelling session…' : 'Cancel session (accidental start)'}
                          aria-label={cancellingSessionId === occupancy._id ? 'Cancelling session…' : 'Cancel session'}
                          onClick={(e) => { e.stopPropagation(); cancelSession(occupancy._id); }}
                        >
                          <i className={cancellingSessionId === occupancy._id ? 'bi bi-hourglass-split' : 'bi bi-x-circle'}></i>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rm-empty">
                    <i className="bi bi-check-circle"></i>
                    <span>{r.status === 'Available' ? 'Available' : r.status}</span>
                  </div>
                )}
                {!occupancy && r.status === 'Available' && canOperate && (
                  <div className="rm-foot">
                    <button
                      type="button"
                      className="rm-btn primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={(e) => { e.stopPropagation(); openStartSessionModal(r); }}
                    >
                      <i className="bi bi-play-fill"></i>Start Session
                    </button>
                  </div>
                )}
              </div>
            );
                  })}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="card card-flush rm-table-wrap rm-board-wrap">
          <DataTable
            tableClassName="tbl rm-table"
            columns={roomTableColumns}
            rows={visibleRooms}
            getRowKey={(r) => r._id}
            getRowClassName={(r) => {
              const v = buildRoomView(r, sessions);
              return [v.blinkClass ? 'blink-expired' : '', `rm-row-${v.stateClass}`].filter(Boolean).join(' ');
            }}
            emptyMessage="No rooms match the current filters."
            itemLabel="rooms"
            paginate={false}
          />
        </div>
      )}
        </>
      )}

      <SessionModal modal={modal} onClose={() => setModal(null)} onSubmit={handleModalSubmit} />
      <ExtendSessionModal
        session={extendingSession ? sessions.find((session) => session._id === extendingSession._id) || extendingSession : null}
        maxSessionHours={MAX_SESSION_HOURS}
        canExtendSession={canExtendSession}
        formatMoney={money}
        formatClock={boardClock}
        formatReservationTime={reservationNoticeTime}
        onClose={() => setExtendingSession(null)}
        onSubmit={extendSession}
      />
      <FinishSessionModal
        session={finishingSession ? sessions.find((session) => session._id === finishingSession._id) || finishingSession : null}
        disabled={!!refreshError}
        getPaymentSummary={paymentSummary}
        formatMoney={money}
        onClose={() => setFinishingSession(null)}
        onSubmit={finishSession}
      />
      <RoomDetailModal
        room={detailRoom}
        view={detailView}
        onClose={() => setDetailRoomId(null)}
        canOperate={canOperate && !refreshError}
        getPaymentSummary={paymentSummary}
        canExtendSession={canExtendSession}
        formatMoney={money}
        onExtend={() => {
          setDetailRoomId(null);
          setExtendingSession(detailView.occupancy);
        }}
        onEndSessionPaid={() => {
          setDetailRoomId(null);
          endSession(detailView.occupancy);
        }}
        onCancelSession={() => {
          setDetailRoomId(null);
          cancelSession(detailView.occupancy._id);
        }}
      />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

const HOUR_PRESETS = [1, 2, 3, 4, 5];

function manilaHour() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
}

function SessionModal({ modal, onClose, onSubmit }) {
  const [hours, setHours] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [collectionMode, setCollectionMode] = useState('later');
  const [guestName, setGuestName] = useState('');
  const [guestCount, setGuestCount] = useState('1');
  const [applyVenueDiscount, setApplyVenueDiscount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [startQuote, setStartQuote] = useState(null);
  const [startQuoteFailure, setStartQuoteFailure] = useState(null);
  const [startQuoteAttempt, setStartQuoteAttempt] = useState(0);

  const fromBooking = !!modal?.bookingId;
  const bookingNotStarted = fromBooking && Date.now() < Number(modal?.scheduledStartMs);
  const bookingEnded = fromBooking && Date.now() >= Number(modal?.scheduledEndMs);

  useEffect(() => {
    if (!modal) return;

    if (fromBooking) {
      setHours(Math.max(1, Math.round(Number(modal.initialDurationHours) || 1)));
      setPaymentMethod('Cash');
      setCollectionMode((modal.downPaymentInfo?.balance || 0) > 0 ? 'later' : 'full');
      setGuestName(modal.initialGuestName || '');
      setGuestCount('1');
      setApplyVenueDiscount(false);
    } else {
      setHours(1);
      setPaymentMethod('Cash');
      setCollectionMode('later');
      setGuestName('');
      setGuestCount('1');
      setApplyVenueDiscount(false);
    }
    setFormError('');
  }, [modal]);

  const duration = Math.max(1, Math.round(Number(hours) || 1));
  const startQuoteKey = `${modal?.fixedRoom?._id}:${duration}`;
  const checkedStartQuote = startQuote?.key === startQuoteKey ? startQuote : null;
  const startQuoteError = startQuoteFailure?.key === startQuoteKey ? startQuoteFailure.message : '';
  const reservationStartMs = Date.parse(checkedStartQuote?.reservationStart || '');
  const reservationTime = reservationNoticeTime(checkedStartQuote?.reservationStart);
  const oneHourFitsBeforeReservation = reservationStartMs - Date.now() >= 60 * 60 * 1000;

  useEffect(() => {
    if (!modal?.fixedRoom?._id || fromBooking) return;
    let cancelled = false;
    setStartQuote(null);
    setStartQuoteFailure(null);
    roomSessionsService.quoteStart(modal.fixedRoom._id, duration)
      .then((result) => { if (!cancelled) setStartQuote({ ...result, key: startQuoteKey }); })
      .catch((error) => { if (!cancelled) setStartQuoteFailure({ key: startQuoteKey, message: error.message || 'Could not check this session length.' }); });
    return () => { cancelled = true; };
  }, [modal?.fixedRoom?._id, fromBooking, duration, startQuoteAttempt]);

  const maxHours = MAX_SESSION_HOURS;
  const bookedLengthExceedsLimit = fromBooking && duration > maxHours;
  const walkInPricing = !fromBooking && modal?.fixedRoom
    ? calculateBookingPrice({ variant: modal.fixedRoom, startHour: manilaHour(), duration, guestCount: Number(guestCount) || 1 })
    : null;
  const originalCharge = fromBooking ? Number(modal?.downPaymentInfo?.total) || 0 : Number(walkInPricing?.amount) || 0;
  const previouslyCollected = fromBooking ? Number(modal?.downPaymentInfo?.collected) || 0 : 0;
  const venueDiscount = fromBooking ? Number(modal?.venueDiscount || 0) : 0;
  const appliedDiscount = applyVenueDiscount ? venueDiscount : 0;
  const originalBalance = Math.max(0, originalCharge - previouslyCollected);
  const cashToReturn = duration === 1 ? appliedDiscount : Math.max(0, appliedDiscount - originalBalance);
  const totalCharge = Math.max(0, Math.round((originalCharge - appliedDiscount) * 100) / 100);
  const alreadyCollected = Math.max(0, previouslyCollected - cashToReturn);
  const outstanding = Math.max(0, Math.round((totalCharge - alreadyCollected) * 100) / 100);
  const recordedRefund = Number(modal?.downPaymentInfo?.refunded || 0) + cashToReturn;
  const reservationPaidInFull = fromBooking && totalCharge > 0 && outstanding === 0;
  const paidAmount = fromBooking
    ? collectionMode === 'full' ? totalCharge + recordedRefund : Number(modal?.downPaymentInfo?.paid || 0)
    : collectionMode === 'full' ? totalCharge : 0;

  async function handleSubmit() {
    const totalHours = duration;
    setFormError('');
    if (fromBooking && (Date.now() < Number(modal?.scheduledStartMs) || Date.now() >= Number(modal?.scheduledEndMs))) {
      setFormError('This reservation can only start during its reserved time. Refresh the schedule if its slot has ended.');
      return;
    }
    if (!fromBooking && !(Number(modal?.fixedRoom?.price) > 0)) {
      setFormError('Set this table’s hourly rate before starting a session.');
      return;
    }
    if (!Number.isInteger(totalHours) || totalHours < 1) {
      setFormError('Choose a duration of at least one whole hour.');
      return;
    }
    if (totalHours > maxHours) {
      setFormError(`Choose no more than ${maxHours} whole hour${maxHours === 1 ? '' : 's'}.`);
      return;
    }
    if (!fromBooking && checkedStartQuote?.canStart !== true) {
      setFormError(checkedStartQuote?.notice || startQuoteError || 'Wait for the reservation check before starting.');
      return;
    }
    if (fromBooking && venueDiscount > 0 && !applyVenueDiscount) {
      setFormError('Settle the room discount with the guest before starting this reservation.');
      return;
    }
    if (paidAmount - recordedRefund > totalCharge) {
      setFormError('The amount collected cannot be higher than the session charge.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        roomId: modal.fixedRoom?._id,
        roomTarget: modal.roomTarget,
        totalHours,
        paymentMethod: reservationPaidInFull || collectionMode === 'later' ? undefined : paymentMethod,
        paymentTiming: paidAmount - recordedRefund >= totalCharge && totalCharge > 0 ? 'Before' : 'After',
        paidAmount,
        guestName,
        guestCount: Number(guestCount) || 1,
        bookingId: modal.bookingId,
        applyVenueDiscount: fromBooking && applyVenueDiscount,
      });
    } catch (err) {
      console.error(err);
      setFormError(err.message || 'Could not save this room session.');
    } finally {
      setSubmitting(false);
    }
  }

  const fixedRoomLabel = modal?.fixedRoom
    ? `${modal.fixedRoom.roomName} — Table No. ${modal.fixedRoom.roomNumber} (${modal.fixedRoom.facilityName})`
    : modal?.roomTarget
      ? `${modal.roomTarget.roomName} — ${modal.previewNumber ? `Table No. ${modal.previewNumber} ` : ''}(${modal.roomTarget.facilityName}) — will be created`
      : '';
  const fixedRoomRate = modal?.fixedRoom
    ? Number(modal.fixedRoom.price) > 0 ? variantRateLabel(modal.fixedRoom) : 'Rate not set'
    : modal?.roomTarget ? 'From reservation' : '';
  const title = fromBooking ? 'Start Session from Reservation' : 'Start Session';

  return (
    <Modal open={!!modal} onClose={onClose} title={title} size="lg">
      {modal && (
        <>
          <div className="rmd-stat-box">
            <div className="val">{fixedRoomLabel}</div>
            <div className="lbl lbl--sub">Rate: {fixedRoomRate}</div>
          </div>

          <div className="mfield-section-label">Session details</div>
          <div className="mfield">
            <label>Session length</label>
            {fromBooking ? (
              <div className="session-fixed-length"><strong>{duration} hour{duration === 1 ? '' : 's'}</strong><small>Fixed by the confirmed reservation</small></div>
            ) : (
              <div className="session-hour-picker" role="group" aria-label="Session length">
                {HOUR_PRESETS.filter((value) => value <= maxHours).map((value) => (
                  <button key={value} type="button" className={`session-hour-option${duration === value ? ' active' : ''}`} aria-pressed={duration === value} onClick={() => { setHours(value); setFormError(''); }}>{value}<small>hr</small></button>
                ))}
              </div>
            )}
            {fromBooking && <p className="session-reservation-deadline">{bookingNotStarted ? 'Starts at' : 'Ends at'} {boardClock(new Date(bookingNotStarted ? modal.scheduledStartMs : modal.scheduledEndMs))}{!bookingNotStarted && !bookingEnded ? ` · ${Math.ceil((modal.scheduledEndMs - Date.now()) / 60000)} min left` : ''}</p>}
            {bookedLengthExceedsLimit && <p className="session-form-error" role="alert">This reservation exceeds the five-hour session limit. Update its reserved length before starting the session.</p>}
            {!fromBooking && !checkedStartQuote && !startQuoteError && <p className="mfield-note" role="status">Checking upcoming reservations…</p>}
            {!fromBooking && startQuoteError && <div className="session-extension-retry"><p className="session-form-error" role="alert">{startQuoteError}</p><button type="button" className="rm-btn" onClick={() => setStartQuoteAttempt((value) => value + 1)}>Try again</button></div>}
            {!fromBooking && checkedStartQuote?.canStart === false && (
              <div className="session-availability-notice session-availability-notice--conflict" role="alert">
                <TriangleAlert size={20} aria-hidden="true" />
                <div>
                  <span className="session-availability-label">Upcoming reservation{reservationTime ? ` · ${reservationTime}` : ''}</span>
                  <strong>Keep one {modal.fixedRoom.roomName} table free</strong>
                  <p>A {duration}-hour session here would still be running when the reservation starts.</p>
                  <p className="session-availability-action">
                    {reservationTime && !oneHourFitsBeforeReservation
                      ? `No session can end before then. Leave this table free, or free up another ${modal.fixedRoom.roomName} table.`
                      : `Pick a session that ends before the reservation, or free up another ${modal.fixedRoom.roomName} table.`}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mfield">
            <label>Guest Name{fromBooking ? '' : ' (optional)'}</label>
            <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Juan Dela Cruz" readOnly={fromBooking} />
          </div>

          {!fromBooking && (
            <>
              <div className="mfield">
                <label>Number of Guests</label>
                <input type="number" min="1" value={guestCount} onChange={(event) => setGuestCount(event.target.value)} />
              </div>
            </>
          )}

          <div className="mfield-section-label">Payment</div>

          {fromBooking && (
            <>
              {venueDiscount > 0 && (
                <label className="booking-addon-check">
                  <input type="checkbox" checked={applyVenueDiscount} onChange={(event) => setApplyVenueDiscount(event.target.checked)} />
                  <span><strong>Apply {money(venueDiscount)} room discount at the venue</strong><small>{duration === 1 ? `Return ${money(venueDiscount)} to the guest. Optional services stay due separately.` : originalBalance >= venueDiscount ? `Reduce the balance to ${money(originalBalance - venueDiscount)}.` : `Return ${money(venueDiscount - originalBalance)} to the guest before confirming.`}</small></span>
                </label>
              )}
              <div className="session-payment-ledger">
                <div><span>Reservation charge</span><strong>{money(originalCharge)}</strong></div>
                {appliedDiscount > 0 && <div><span>Room discount</span><strong>−{money(appliedDiscount)}</strong></div>}
                <div><span>Payment received</span><strong>{money(alreadyCollected)}</strong></div>
                <div className={outstanding > 0 ? 'balance-due' : 'balance-paid'}><span>Balance remaining</span><strong>{money(outstanding)}</strong></div>
              </div>
              {venueDiscount > 0 && !applyVenueDiscount && <p className="mfield-note" role="status">The room discount is still due at the venue. Select the checkbox when settling it with the guest.</p>}
              {reservationPaidInFull && (
                <div className="session-payment-complete" role="status">
                  <i className="bi bi-check-circle-fill" aria-hidden="true"></i>
                  <span><strong>{modal?.paymentChoice === 'deposit' && duration === 1 ? 'One-hour payment complete' : 'Reservation fully paid'}</strong><small>No balance or payment method is needed to start this session.</small></span>
                </div>
              )}
            </>
          )}

          {!reservationPaidInFull && (
            <div className="session-collection-options" role="group" aria-label="Payment collection">
              <button type="button" className={collectionMode === 'later' ? 'active' : ''} aria-pressed={collectionMode === 'later'} onClick={() => setCollectionMode('later')}><strong>Pay after play</strong><small>{fromBooking ? `${money(outstanding)} remains to collect` : `Collect ${money(totalCharge)} when the session ends`}</small></button>
              <button type="button" className={collectionMode === 'full' ? 'active' : ''} aria-pressed={collectionMode === 'full'} onClick={() => setCollectionMode('full')}><strong>Pay before play</strong><small>{fromBooking ? `Collect the full ${money(outstanding)} balance now` : `Collect ${money(totalCharge)} now`}</small></button>
            </div>
          )}

          {!reservationPaidInFull && collectionMode !== 'later' && (
            <div className="mfield">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Maya">Maya</option>
              </select>
            </div>
          )}

          {formError && <p className="session-form-error" role="alert">{formError}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-confirm" disabled={submitting || maxHours < 1 || bookedLengthExceedsLimit || bookingNotStarted || bookingEnded || (!fromBooking && checkedStartQuote?.canStart !== true)} onClick={handleSubmit}>
              {submitting ? 'Starting…' : 'Start session'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Monitor;
