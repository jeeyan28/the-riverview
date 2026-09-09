import '../../styles/admin/monitor.css';
import '../../styles/admin/finance.css';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/Modal';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import ConfirmDialog from '../../components/ConfirmDialog';
import DateRangePicker from '../../components/DateRangePicker';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { monitorRoomsService, roomSessionsService } from '../../services/monitoring';
import { bookingsService } from '../../services/bookings';
import { businessDate } from '../../utils/businessDate';
import { CORKAGE_FEE, calculateBookingPrice, variantRateLabel } from '../../utils/roomPricing';
import { BarChart3, Download, Radio } from 'lucide-react';
import {
  useRoomMonitorData,
  sessionEnd,
  formatStartTime,
  formatEndTime,
  formatTimeRemaining,
  findRoomOccupancy,
  buildRoomView,
} from '../../hooks/useRoomMonitorData';

const FACILITY_ICONS = { Billiards: 'bi-disc', KTV: 'bi-mic', Court: 'bi-trophy' };
const FACILITY_ICON_DEFAULT = 'bi-building';
const DUE_BOOKINGS_POLL_MS = 20 * 1000;

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
  return { total, collected, balance, status: balance === 0 ? 'Paid' : collected > 0 ? 'Partially paid' : 'Unpaid' };
}

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SessionPayment({ session }) {
  const payment = paymentSummary(session);
  const state = payment.balance === 0 ? 'paid' : payment.collected > 0 ? 'partial' : 'unpaid';
  return (
    <div className="rm-payment-summary">
      <span className={`pay-timing-tag ${state}`}>{payment.status}</span>
      <span>{money(payment.balance)} balance</span>
    </div>
  );
}

function getBookingRoomTarget(booking) {
  const facilityName = booking.room?.name;
  if (!facilityName) return null;
  const variants = Array.isArray(booking.room?.variants) ? booking.room.variants : [];
  const variant = booking.variantLabel ? variants.find((v) => v.label === booking.variantLabel) : null;
  const roomName = variant?.label || booking.variantLabel || booking.roomLabel;
  if (!roomName) return null;
  return {
    facilityName,
    roomName,
    startingRoomNumber: variant?.startingRoomNumber != null ? Number(variant.startingRoomNumber) : null,
    roomCount: variant?.roomCount != null ? Number(variant.roomCount) : null,
  };
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
    rooms, setRooms, sessions, loading, refreshError, lastUpdatedAt,
    fetchRooms, fetchMonitorSessions,
    viewMode, changeViewMode,
    soundMuted, toggleSoundMuted,
  } = useRoomMonitorData('admin');

  const [modal, setModal] = useState(null);
  const [finishingSession, setFinishingSession] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editRoomId, setEditRoomId] = useState(null);
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [roomNameFilter, setRoomNameFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [detailRoomId, setDetailRoomId] = useState(null);
  const [dueBookings, setDueBookings] = useState([]);
  const [gridPage, setGridPage] = useState(1);
  const [gridPageSize, setGridPageSize] = useState(10);
  const [workspaceTab, setWorkspaceTab] = useState('live');
  const [reportFrom, setReportFrom] = useState(() => businessDate());
  const [reportTo, setReportTo] = useState(() => businessDate());
  const [monitorReport, setMonitorReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportExporting, setReportExporting] = useState(false);

  async function loadMonitorReport() {
    setReportLoading(true);
    setReportError('');
    try {
      setMonitorReport(await roomSessionsService.report(reportFrom, reportTo));
    } catch (err) {
      setReportError(err.message || 'Could not load the session report.');
    } finally {
      setReportLoading(false);
    }
  }

  useEffect(() => {
    if (workspaceTab === 'report') loadMonitorReport();
  }, [workspaceTab, reportFrom, reportTo]);

  async function exportMonitorReport() {
    setReportExporting(true);
    setReportError('');
    try {
      await roomSessionsService.exportReport(reportFrom, reportTo);
    } catch (err) {
      setReportError(err.message || 'Could not export the session report.');
    } finally {
      setReportExporting(false);
    }
  }

  async function fetchDueBookings() {
    if (!canStartFromBooking) return;
    try {
      const today = businessDate();
      const data = await bookingsService.list({ status: 'Confirmed' });
      const list = Array.isArray(data) ? data : [];
      setDueBookings(list.filter((b) => b.date <= today));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchDueBookings();
    const handle = setInterval(fetchDueBookings, DUE_BOOKINGS_POLL_MS);
    return () => clearInterval(handle);
  }, []);

  useEffect(() => {
    setGridPage(1);
  }, [facilityFilter, roomNameFilter, sortBy, viewMode, rooms.length]);

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

  async function cancelSession(sessionId) {
    if (refreshError || !guardPermission('room:operate')) return;
    if (!(await confirm('Cancel this accidental session and release the table? Its payment and session history will be kept. A linked reservation will be restored for a new start.', { confirmText: 'Cancel Session' }))) return;
    try {
      await roomSessionsService.remove(sessionId);
      await fetchMonitorSessions();
      await fetchDueBookings();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not cancel this session.');
    }
  }

  function openStartSessionModal(room) {
    if (refreshError || !guardPermission('room:operate')) return;
    setModal({ mode: 'start', fixedRoom: room, session: null });
  }
  function openExtendModal(session, room) {
    if (refreshError || !guardPermission('room:operate')) return;
    setModal({ mode: 'extend', fixedRoom: room, session });
  }
  function openStartFromBooking(booking, matchedRoom, roomTarget, previewNumber) {
    if (refreshError || !canStartFromBooking) return;
    setModal({
      mode: 'start',
      fixedRoom: matchedRoom,
      roomTarget: matchedRoom ? null : roomTarget,
      previewNumber: matchedRoom ? null : previewNumber,
      session: null,
      bookingId: booking._id,
      initialGuestName: booking.guestName,
      initialDurationHours: booking.duration,
      downPaymentInfo: paymentSummary(booking, true),
    });
  }

  async function handleModalSubmit({ mode, roomId, roomTarget, sessionId, totalHours, paymentMethod, paymentTiming, paidAmount, guestName, guestCount, hasCorkage, bookingId }) {
    if (refreshError) throw new Error('Wait for the table status to refresh before changing this session.');
    if (mode !== 'extend' && bookingId) {
      if (!canStartFromBooking) return;
    } else if (!guardPermission('room:operate')) {
      return;
    }

    if (mode === 'extend') {
      await roomSessionsService.extend(sessionId, { addedHours: totalHours });
    } else {
      await roomSessionsService.create({ roomId, roomTarget, duration: totalHours, paymentMethod, paymentTiming, paidAmount, guestName, guestCount, hasCorkage, bookingId });
    }

    setModal(null);
    await fetchMonitorSessions();
    if (bookingId) await fetchDueBookings();
  }

  async function handleAddRoom({ facilityName, roomName, roomNumber, price }) {
    if (!guardPermission('room:manage')) return;
    await monitorRoomsService.create({ facilityName, roomName, roomNumber, price });
    await fetchRooms();
  }

  async function handleEditRoom({ facilityName, roomName, roomNumber, price }) {
    if (!guardPermission('room:manage')) return;
    await monitorRoomsService.update(editRoomId, { facilityName, roomName, roomNumber, price });
    await fetchRooms();
  }

  async function deleteRoom(roomId) {
    if (!guardPermission('room:manage')) return;
    if (!(await confirm('Delete this table permanently? This cannot be undone.', { confirmText: 'Delete' }))) return;
    try {
      await monitorRoomsService.remove(roomId);
      setRooms((prev) => prev.filter((r) => r._id !== roomId));
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not delete this table.');
    }
  }

  const facilities = [...new Set(rooms.map((r) => r.facilityName))];
  const facilityCounts = rooms.reduce((acc, r) => {
    acc[r.facilityName] = (acc[r.facilityName] || 0) + 1;
    return acc;
  }, {});
  const filteredRooms = facilityFilter === 'All' ? rooms : rooms.filter((r) => r.facilityName === facilityFilter);
  const roomNameOptions = facilityFilter === 'All' ? [] : [...new Set(filteredRooms.map((r) => r.roomName))];
  const visibleRooms = (() => {
    let list = roomNameFilter === 'All' ? filteredRooms : filteredRooms.filter((r) => r.roomName === roomNameFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const occ = findRoomOccupancy(r._id, sessions);
        return String(r.roomNumber).toLowerCase().includes(q) || (occ?.guestName || '').toLowerCase().includes(q);
      });
    }
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
      return [...list].sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true, sensitivity: 'base' }));
    }
    return list;
  })();
  const gridTotalPages = Math.max(1, Math.ceil(visibleRooms.length / gridPageSize));
  const safeGridPage = Math.min(gridPage, gridTotalPages);
  const pagedGridRooms = visibleRooms.slice((safeGridPage - 1) * gridPageSize, safeGridPage * gridPageSize);
  const facilityGroups = [];
  const groupIndex = new Map();
  pagedGridRooms.forEach((r) => {
    if (!groupIndex.has(r.facilityName)) {
      groupIndex.set(r.facilityName, []);
      facilityGroups.push([r.facilityName, groupIndex.get(r.facilityName)]);
    }
    groupIndex.get(r.facilityName).push(r);
  });

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

  const roomTableColumns = [
    {
      key: 'room',
      label: 'Table',
      sortable: true,
      sortValue: (r) => Number(r.roomNumber) || r.roomNumber,
      render: (r) => (
        <>
          <div className="rm-name">Table {r.roomNumber}</div>
          <div className="rm-type">{r.facilityName}{r.hasCustomName ? ` · ${r.roomName}` : ''}</div>
        </>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => {
        const { stateClass, statusLabel } = buildRoomView(r, sessions);
        return <span className={`rm-status-pill status-${stateClass}`}><span className="dot"></span>{statusLabel}</span>;
      },
    },
    {
      key: 'guest',
      label: 'Guest',
      sortable: true,
      sortValue: (r) => buildRoomView(r, sessions).occupancy?.guestName || '',
      render: (r) => buildRoomView(r, sessions).occupancy?.guestName || '—',
    },
    {
      key: 'start',
      label: 'Start',
      render: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        return occupancy ? formatStartTime(occupancy) : '—';
      },
    },
    {
      key: 'end',
      label: 'End',
      render: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        return occupancy ? formatEndTime(occupancy) : '—';
      },
    },
    {
      key: 'remaining',
      label: 'Remaining',
      sortable: true,
      sortValue: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        return occupancy ? sessionEnd(occupancy).getTime() : Number.POSITIVE_INFINITY;
      },
      render: (r) => {
        const { occupancy, remaining, isPastEnd, isCritical, isWarning } = buildRoomView(r, sessions);
        return (
          <span className={`rm-timer${isWarning ? ' warn' : ''}${(isPastEnd || isCritical) ? ' expired' : ''}`}>
            {occupancy && (isCritical || isPastEnd) && (
              <i className="bi bi-exclamation-triangle-fill rm-timer-warn-ico"></i>
            )}
            {occupancy ? formatTimeRemaining(remaining, isPastEnd) : '—'}
          </span>
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
                  <button className="rm-btn" onClick={() => openExtendModal(occupancy, r)}><i className="bi bi-clock-history"></i>Extend</button>
                  <button className="rm-btn rm-btn--success" onClick={() => endSession(occupancy)}><i className="bi bi-check2-circle"></i>Finish</button>
                  <button className="rm-btn danger" onClick={() => cancelSession(occupancy._id, r._id)}><i className="bi bi-x-circle"></i>Cancel</button>
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
      <div className="monitor-section-tabs" role="tablist" aria-label="Live monitor sections">
        <button type="button" role="tab" aria-selected={workspaceTab === 'live'} className={workspaceTab === 'live' ? 'active' : ''} onClick={() => setWorkspaceTab('live')}><Radio size={17} aria-hidden="true" /><span>Live floor</span><small>Rooms and active guests</small></button>
        <button type="button" role="tab" aria-selected={workspaceTab === 'report'} className={workspaceTab === 'report' ? 'active' : ''} onClick={() => setWorkspaceTab('report')}><BarChart3 size={17} aria-hidden="true" /><span>Session report</span><small>Played hours and payments</small></button>
      </div>

      {workspaceTab === 'report' && (
        <MonitorReportPanel
          report={monitorReport}
          from={reportFrom}
          to={reportTo}
          loading={reportLoading}
          error={reportError}
          exporting={reportExporting}
          onRangeChange={(nextFrom, nextTo) => { setReportFrom(nextFrom); setReportTo(nextTo); }}
          onReload={loadMonitorReport}
          onExport={exportMonitorReport}
        />
      )}

      <div className="monitor-live-workspace" hidden={workspaceTab !== 'live'}>
      <div className="rm-toolbar-head">
        <div className="rm-page-head">
          <span className="live-badge"><span className="dot"></span>{refreshError ? 'Reconnecting' : loading ? 'Connecting' : 'Live'}</span>
          <span className="rm-page-sub">Real-time table status and session monitoring</span>
        </div>
        <div className="rm-toolbar-actions">
          <div className="view-toggle" role="group" aria-label="Switch view">
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => changeViewMode('grid')}
            >
              <i className="bi bi-grid"></i>Grid View
            </button>
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'table' ? ' active' : ''}`}
              onClick={() => changeViewMode('table')}
            >
              <i className="bi bi-list-ul"></i>Table View
            </button>
          </div>
          <a className="rm-btn" href="/lobby-monitor" target="_blank" rel="noreferrer">
            <i className="bi bi-tv"></i>View Lobby Display
          </a>
          {canManage && (
            <Link className="btn-teal" to="/admin/room-management">
              <i className="bi bi-building-gear"></i>Manage Inventory
            </Link>
          )}
        </div>
      </div>

      {refreshError && (
        <div className="rm-refresh-error" role="status">
          <span>Table status could not refresh. {lastUpdatedAt ? `Showing occupancy last checked at ${new Date(lastUpdatedAt).toLocaleTimeString([], { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' })}.` : 'Availability is not yet known.'} Session controls resume after a successful refresh.</span>
          <button type="button" className="rm-btn" onClick={fetchMonitorSessions}>Retry</button>
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

      {canStartFromBooking && dueBookings.length > 0 && (
        <div className="card card-flush rm-table-wrap rm-due-wrap">
          <div className="rm-due-head">
            <span className="card-title"><i className="bi bi-alarm"></i>Reservations Due</span>
            <span className="rm-group-count">{dueBookings.length}</span>
          </div>
          <table className="rm-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Facility / Table</th>
                <th>Scheduled</th>
                <th>Payment collected</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {dueBookings
                .slice()
                .sort((a, b) => String(a.timeIn || '').localeCompare(String(b.timeIn || '')))
                .map((b) => {
                  const roomTarget = getBookingRoomTarget(b);
                  const { matchedRoom, previewNumber } = matchRoomForTarget(rooms, roomTarget);
                  const scheduledStart = new Date(`${b.date}T${String(b.timeIn).padStart(5, '0')}:00+08:00`);
                  const isDue = scheduledStart.getTime() <= Date.now();
                  const occupancy = matchedRoom ? findRoomOccupancy(matchedRoom._id, sessions) : null;
                  const hasConflict = matchedRoom && occupancy;
                  const payment = paymentSummary(b, true);
                  return (
                    <tr key={b._id} className={isDue ? 'blink-expired' : ''}>
                      <td><span className="rm-guest-name">{b.guestName}</span></td>
                      <td>
                        <div className="rm-name">{b.roomLabel}</div>
                        <div className="rm-type">
                          {matchedRoom
                            ? `Table No.${matchedRoom.roomNumber}`
                            : roomTarget
                              ? previewNumber
                                ? `Table No.${previewNumber} (will be created)`
                                : 'Table No. will be auto-assigned'
                              : 'No matching Table Monitor table'}
                        </div>
                      </td>
                      <td>{scheduledStart.toLocaleString([], { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        <div className="rm-amount">{money(payment.collected)}</div>
                        <div className={`rm-amount-sub${payment.balance === 0 ? ' paid' : ''}`}>
                          {payment.balance === 0 ? 'Fully paid' : `${money(payment.balance)} balance`}
                        </div>
                      </td>
                      <td>
                        <span className={`rm-status-pill ${isDue ? 'status-expired' : 'status-warning'}`}>
                          <span className="dot"></span>{isDue ? 'Due Now' : 'Upcoming'}
                        </span>
                        {hasConflict && (
                          <div className="rm-conflict-note">
                            <i className="bi bi-exclamation-triangle"></i>Table occupied — end that session first
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="rm-btn primary"
                          disabled={!!refreshError || !roomTarget || hasConflict}
                          title={!roomTarget ? 'Could not determine this reservation\'s room.' : hasConflict ? 'End the current session on this room first.' : ''}
                          onClick={() => openStartFromBooking(b, matchedRoom, roomTarget, previewNumber)}
                        >
                          <i className="bi bi-play-circle"></i>Start Now
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {loading ? (
        <div className="room-grid"><div className="room-grid-empty">Loading tables…</div></div>
      ) : rooms.length === 0 ? (
        <div className="room-grid"><div className="room-grid-empty">{refreshError ? 'Waiting for table status…' : 'No tables configured yet.'}</div></div>
      ) : (
        <>
          <div className="rm-search-row">
            <i className="bi bi-search rm-search-ico"></i>
            <input
              type="text"
              className="rm-search-input"
              placeholder="Search by table number or guest name"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" className="rm-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                <i className="bi bi-x-lg"></i>
              </button>
            )}
          </div>
          <div className="fac-toolbar">
            <div className="fac-chips" role="group" aria-label="Filter by facility">
              <button
                type="button"
                className={`fac-chip${facilityFilter === 'All' ? ' active' : ''}`}
                onClick={() => selectFacilityFilter('All')}
              >
                All Facilities
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
            <div className="fac-chips" role="group" aria-label="Sort rooms">
              <button
                type="button"
                className={`fac-chip${sortBy === 'default' ? ' active' : ''}`}
                onClick={() => setSortBy('default')}
              >
                Sort: Default
              </button>
              <button
                type="button"
                className={`fac-chip${sortBy === 'timeLeft' ? ' active' : ''}`}
                onClick={() => setSortBy('timeLeft')}
              >
                Sort: Time Left
              </button>
              <button
                type="button"
                className={`fac-chip${sortBy === 'roomNumber' ? ' active' : ''}`}
                onClick={() => setSortBy('roomNumber')}
              >
                Sort: Table No.
              </button>
            </div>
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
              <div className="room-grid">
                {facilityRooms.map((r) => {
            const v = buildRoomView(r, sessions);
            const { occupancy, remaining, isPastEnd, isCritical, isWarning, stateClass, statusLabel, blinkClass } = v;

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
                      <span className={`rm-ico ico-${(isPastEnd || isCritical) ? 'red' : isWarning ? 'amber' : 'green'}`}>
                        <i className={`bi ${(isCritical || isPastEnd) ? 'bi-exclamation-triangle-fill' : 'bi-clock'}`}></i>
                      </span>
                      <div>
                        <div className={`rm-timer-big${isWarning ? ' warn' : ''}${(isPastEnd || isCritical) ? ' expired' : ''}`}>
                          {formatTimeRemaining(remaining, isPastEnd)}
                        </div>
                        <div className="rm-timer-caption">Time left</div>
                      </div>
                    </div>
                    <div className="rm-foot">
                      <div className="rm-foot-info">
                        <i className="bi bi-person"></i>{occupancy.guestName || 'Walk-in guest'}
                      </div>
                      <div className="rm-foot-price">₱{r.price}/hr</div>
                    </div>
                    <SessionPayment session={occupancy} />
                    {canOperate && !refreshError && (
                      <div className="rm-quick-actions">
                        <button
                          type="button"
                          className="rm-btn"
                          onClick={(e) => { e.stopPropagation(); openExtendModal(occupancy, r); }}
                        >
                          <i className="bi bi-clock-history"></i>Extend
                        </button>
                        <button
                          type="button"
                          className="rm-btn rm-btn--success"
                          onClick={(e) => { e.stopPropagation(); endSession(occupancy); }}
                        >
                          <i className="bi bi-check2-circle"></i>Finish
                        </button>
                        <button
                          type="button"
                          className="rm-btn danger rm-btn--icon"
                          title="Cancel session (accidental start)"
                          aria-label="Cancel session"
                          onClick={(e) => { e.stopPropagation(); cancelSession(occupancy._id, r._id); }}
                        >
                          <i className="bi bi-x-circle"></i>
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
          <Pagination
            page={safeGridPage}
            pageSize={gridPageSize}
            totalItems={visibleRooms.length}
            onPageChange={setGridPage}
            onPageSizeChange={(n) => { setGridPageSize(n); setGridPage(1); }}
            itemLabel="rooms"
          />
        </>
      ) : (
        <div className="card card-flush rm-table-wrap">
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
          />
        </div>
      )}
        </>
      )}

      </div>

      <SessionModal modal={modal} onClose={() => setModal(null)} onSubmit={handleModalSubmit} />
      <FinishSessionModal session={finishingSession ? sessions.find((session) => session._id === finishingSession._id) || finishingSession : null} disabled={!!refreshError} onClose={() => setFinishingSession(null)} onSubmit={finishSession} />
      <RoomDetailModal
        room={detailRoom}
        view={detailView}
        onClose={() => setDetailRoomId(null)}
        canManage={canManage}
        canOperate={canOperate && !refreshError}
        onExtend={() => {
          setDetailRoomId(null);
          openExtendModal(detailView.occupancy, detailRoom);
        }}
        onEndSessionPaid={() => {
          setDetailRoomId(null);
          endSession(detailView.occupancy);
        }}
        onCancelSession={() => {
          setDetailRoomId(null);
          cancelSession(detailView.occupancy._id, detailRoom._id);
        }}
        onEdit={() => {
          setDetailRoomId(null);
          setEditRoomId(detailRoom._id);
        }}
        onDelete={() => {
          setDetailRoomId(null);
          deleteRoom(detailRoom._id);
        }}
      />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

function MonitorReportPanel({ report, from, to, loading, error, exporting, onRangeChange, onReload, onExport }) {
  return (
    <section className="monitor-report" aria-labelledby="monitor-report-title">
      <div className="monitor-report-head">
        <div>
          <h2 id="monitor-report-title">Played session report</h2>
          <p>One row per live-monitor session, grouped by its start date and exact room type.</p>
        </div>
        <button type="button" className="save-btn" onClick={onExport} disabled={loading || exporting}>
          <Download size={16} aria-hidden="true" />{exporting ? 'Generating…' : 'Export Excel'}
        </button>
      </div>

      <div className="monitor-report-filters">
        <DateRangePicker from={from} to={to} onChange={onRangeChange} />
        <button type="button" className="btn-cancel" onClick={onReload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      {error && <div className="finance-error" role="alert">{error}</div>}

      <div className="monitor-report-summary" aria-label="Session totals">
        <div><span>Played sessions</span><strong>{loading && !report ? '—' : report?.summary?.sessions ?? 0}</strong><small>{report?.summary?.hours ?? 0} occupied hours</small></div>
        <div><span>Hourly charges</span><strong>{money(report?.summary?.charged)}</strong><small>Room and facility time</small></div>
        <div><span>Collected</span><strong>{money(report?.summary?.collected)}</strong><small>{report?.summary?.paid ?? 0} fully paid</small></div>
        <div className={(report?.summary?.outstanding || 0) > 0 ? 'has-balance' : ''}><span>Outstanding</span><strong>{money(report?.summary?.outstanding)}</strong><small>{report?.summary?.partial ?? 0} partial · {report?.summary?.unpaid ?? 0} unpaid</small></div>
      </div>

      <div className="monitor-report-layout">
        <div className="card card-flush monitor-report-table-card">
          <div className="monitor-report-card-head"><div><h3>Session activity</h3><p>Time in, scheduled time out, rate, charge, and payment balance.</p></div><span>{report?.rows?.length ?? 0} rows</span></div>
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Live monitor session report">
            <table className="tbl monitor-report-table">
              <thead><tr><th>Date / time</th><th>Facility / room</th><th>Guest</th><th>Source</th><th>Hours</th><th>Rate</th><th>Charge</th><th>Paid</th><th>Balance</th><th>Payment</th></tr></thead>
              <tbody>
                {loading && !report ? <tr><td colSpan="10" className="finance-empty">Loading played sessions…</td></tr> : report?.rows?.length ? report.rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.date}</strong><div className="finance-meta">{row.timeIn} – {row.timeOut}</div></td>
                    <td>{row.facilityName}<div className="finance-meta">{row.roomType}{row.unitNumber ? ` · Unit ${row.unitNumber}` : ''}</div></td>
                    <td>{row.guestName}</td>
                    <td>{row.source === 'booking' ? 'Reservation' : 'Walk-in'}</td>
                    <td className="finance-value">{row.duration}h</td>
                    <td>{row.rateLabel}</td>
                    <td className="finance-value">{money(row.amount)}</td>
                    <td className="finance-value">{money(row.collected)}</td>
                    <td className="finance-value">{money(row.balance)}</td>
                    <td><span className={`monitor-payment-pill ${String(row.paymentStatus).toLowerCase()}`}>{row.paymentStatus}</span><div className="finance-meta">{row.paymentTiming === 'After' ? 'Pay after play' : 'Collected before play'}</div></td>
                  </tr>
                )) : <tr><td colSpan="10" className="finance-empty">No played sessions for these service dates.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="card monitor-room-totals">
          <div className="monitor-report-card-head"><div><h3>By room type</h3><p>Revenue stays tied to its hourly room rate.</p></div></div>
          <div className="monitor-room-total-list">
            {report?.byRoomType?.length ? report.byRoomType.map((group) => (
              <div key={`${group.facilityName}-${group.roomType}`}>
                <span><strong>{group.roomType}</strong><small>{group.facilityName} · {group.sessions} session{group.sessions === 1 ? '' : 's'} · {group.hours}h</small></span>
                <span><strong>{money(group.collected)}</strong><small>{money(group.outstanding)} due</small></span>
              </div>
            )) : <p className="finance-empty">Room totals appear after a session is recorded.</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function guestInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

function FinishSessionModal({ session, disabled, onClose, onSubmit }) {
  const [paidAmount, setPaidAmount] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) setPaidAmount(String(session.paidAmount ?? 0));
  }, [session]);

  async function handleSubmit(event) {
    event.preventDefault();
    const received = Number(paidAmount);
    if (!Number.isFinite(received) || received < 0) {
      alert('Amount collected must be a valid non-negative number.');
      return;
    }
    if (received > Number(session?.amount || 0)) {
      alert('Amount collected cannot exceed the session charge.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ paid: received >= Number(session?.amount || 0), paidAmount: received });
    } catch (err) {
      alert(err.message || 'Could not finish this session.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!session} onClose={onClose} title="Finish session">
      {session && (
        <form onSubmit={handleSubmit}>
          <p className="mfield-note">{session.guestName || 'Walk-in guest'} · {session.roomName || `Table ${session.roomNumber}`} · charge {money(session.amount)}</p>
          <div className="mfield"><label htmlFor="finish-paid-amount">Amount collected (₱)</label><input id="finish-paid-amount" type="number" min="0" max={session.amount || 0} step="0.01" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} disabled={disabled} autoFocus /><p className="mfield-note">Enter the money actually received. A partial or zero amount keeps the balance outstanding while preserving the session history.</p></div>
          <div className="modal-actions"><button type="button" className="btn-cancel" onClick={onClose}>Keep active</button><button type="submit" className="btn-confirm" disabled={disabled || submitting}>{submitting ? 'Saving…' : 'Finish session'}</button></div>
        </form>
      )}
    </Modal>
  );
}

function RoomDetailModal({ room, view, onClose, canManage, canOperate, onExtend, onEndSessionPaid, onCancelSession, onEdit, onDelete }) {
  const title = room ? `Table ${room.roomNumber} — ${room.facilityName}` : 'Table details';

  return (
    <Modal open={!!room} onClose={onClose} title={title}>
      {room && view && (
        <>
          <div className="rmd-top">
            <span className={`rm-status-pill status-${view.stateClass}`}><span className="dot"></span>{view.statusLabel}</span>
            {view.occupancy && <span className="rm-foot-price">₱{room.price}/hr</span>}
          </div>

          {view.occupancy ? (
            <>
              <div className={`rmd-timer-block${view.isWarning ? ' warn' : ''}${(view.isPastEnd || view.isCritical) ? ' expired' : ''}`}>
                <div className="rmd-timer-value">{formatTimeRemaining(view.remaining, view.isPastEnd)}</div>
                <div className="rmd-timer-caption">Time left · ends {formatEndTime(view.occupancy)}</div>
              </div>

              {view.occupancy.guestName && (
                <div className="rmd-guest-row">
                  <div className="rmd-avatar">{guestInitials(view.occupancy.guestName)}</div>
                  <div>
                    <div className="rmd-guest-name">{view.occupancy.guestName}</div>
                    <div className="rmd-guest-sub">Started {formatStartTime(view.occupancy)}</div>
                  </div>
                </div>
              )}

              <div className="rmd-stat-grid">
                <div className="rmd-stat-box">
                  <div className="lbl">Timing</div>
                  <div className="val">{view.occupancy.paymentTiming === 'After' ? 'Pay After' : 'Pay Before'}</div>
                </div>
                <div className="rmd-stat-box">
                  <div className="lbl">Amount</div>
                  <div className="val">₱{(view.occupancy.amount || 0).toFixed(2)}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="rmd-empty-block">
              <i className="bi bi-check-circle"></i>
              <span>Ready for a new session</span>
              <div className="rmd-rate">₱{room.price}/hr</div>
            </div>
          )}

          <div className="rmd-actions">
            {view.occupancy ? (
              canOperate && (
                <>
                  <button className="rm-btn rm-btn--success rm-btn--block" onClick={onEndSessionPaid}><i className="bi bi-check2-circle"></i>Finish Session</button>
                  <div className="rmd-actions-row">
                    <button className="rm-btn" onClick={onExtend}><i className="bi bi-clock-history"></i>Extend</button>
                    <button className="rm-btn danger" onClick={onCancelSession}><i className="bi bi-x-circle"></i>Cancel Session</button>
                  </div>
                </>
              )
            ) : null}
            <button className="btn-cancel" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}


const FACILITY_PRESETS_KEY = 'roomMonitor.facilityPresets';
const roomNamePresetsKey = (facilityName) => `roomMonitor.roomNamePresets.${facilityName}`;

function loadPresets(key, seed = []) {
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(stored)) stored = [];
  } catch {
    stored = [];
  }
  const clean = [...stored, ...seed].filter((v) => typeof v === 'string' && v.trim());
  return [...new Set(clean)].sort((a, b) => a.localeCompare(b));
}

function savePresets(key, options) {
  localStorage.setItem(key, JSON.stringify(options));
}

function PresetDropdown({ label, value, options, onSelect, onAdd, onDelete, placeholder }) {
  const [addingNew, setAddingNew] = useState(false);
  const [input, setInput] = useState('');

  function handleSelect(v) {
    if (v === '__add_new__') {
      setAddingNew(true);
      return;
    }
    setAddingNew(false);
    onSelect(v);
  }

  function handleAdd() {
    const trimmed = input.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setAddingNew(false);
    setInput('');
  }

  return (
    <div className="mfield">
      <label>{label}</label>
      <div className="field-row">
        <select value={value} onChange={(e) => handleSelect(e.target.value)} className="field-col">
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
          <option value="__add_new__">+ Add new option…</option>
        </select>
        {value && options.includes(value) && (
          <button type="button" className="rm-btn danger" style={{ flex: '0 0 auto', padding: '7px 10px' }} onClick={() => onDelete(value)} title={`Remove "${value}" from list`}>
            <i className="bi bi-trash"></i>
          </button>
        )}
      </div>
      {addingNew && (
        <div className="field-row field-row--top-gap">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`New ${label.toLowerCase()}`} className="field-col" autoFocus />
          <button type="button" className="rm-btn primary" style={{ flex: '0 0 auto', padding: '7px 12px' }} onClick={handleAdd}>Add</button>
          <button type="button" className="rm-btn" style={{ flex: '0 0 auto', padding: '7px 10px' }} onClick={() => { setAddingNew(false); setInput(''); }} title="Cancel">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
      )}
    </div>
  );
}

function RoomFormModal({ open, onClose, onSubmit, existingFacilities, rooms, initialRoom }) {
  const isEdit = !!initialRoom;
  const [facilityName, setFacilityName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [price, setPrice] = useState('');
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [roomNameOptions, setRoomNameOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFacilityName(initialRoom?.facilityName || '');
    setRoomName(initialRoom?.roomName || '');
    setRoomNumber(initialRoom?.roomNumber || '');
    setPrice(initialRoom ? String(initialRoom.price ?? '') : '');
    setFacilityOptions(loadPresets(FACILITY_PRESETS_KEY, existingFacilities));
  }, [open, initialRoom]);

  useEffect(() => {
    if (!open || !facilityName) {
      setRoomNameOptions([]);
      return;
    }
    const seed = rooms.filter((r) => r.facilityName === facilityName).map((r) => r.roomName);
    setRoomNameOptions(loadPresets(roomNamePresetsKey(facilityName), seed));
  }, [open, facilityName, rooms]);

  function handleAddFacility(trimmed) {
    setFacilityOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed].sort((a, b) => a.localeCompare(b));
      savePresets(FACILITY_PRESETS_KEY, next);
      return next;
    });
    setFacilityName(trimmed);
    setRoomName('');
  }

  function handleDeleteFacility(option) {
    if (!window.confirm(`Remove "${option}" from the Facility list? This only affects the dropdown, not any existing room.`)) return;
    setFacilityOptions((prev) => {
      const next = prev.filter((o) => o !== option);
      savePresets(FACILITY_PRESETS_KEY, next);
      return next;
    });
    if (facilityName === option) setFacilityName('');
  }

  function handleAddRoomName(trimmed) {
    setRoomNameOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed].sort((a, b) => a.localeCompare(b));
      savePresets(roomNamePresetsKey(facilityName), next);
      return next;
    });
    setRoomName(trimmed);
  }

  function handleDeleteRoomName(option) {
    if (!window.confirm(`Remove "${option}" from this facility's Table Name list?`)) return;
    setRoomNameOptions((prev) => {
      const next = prev.filter((o) => o !== option);
      savePresets(roomNamePresetsKey(facilityName), next);
      return next;
    });
    if (roomName === option) setRoomName('');
  }

  async function handleSubmit() {
    const trimmedFacility = facilityName.trim();
    const trimmedRoomName = roomName.trim();
    const trimmedRoomNumber = roomNumber.trim();
    if (!trimmedFacility || !trimmedRoomName || !trimmedRoomNumber) {
      alert('Please fill in Facility, Table Name, and Table No.');
      return;
    }
    const parsedRoomNumber = parseInt(trimmedRoomNumber, 10);
    if (Number.isFinite(parsedRoomNumber) && parsedRoomNumber <= 0) {
      alert('Table No. must be greater than 0.');
      return;
    }
    const trimmedPrice = price.trim();
    if (trimmedPrice && (Number.isNaN(Number(trimmedPrice)) || Number(trimmedPrice) < 0)) {
      alert('Rate must be a valid non-negative number.');
      return;
    }
    const numberTaken = rooms.some((r) => r.roomName === trimmedRoomName && String(r.roomNumber) === trimmedRoomNumber && r._id !== initialRoom?._id);
    if (numberTaken) {
      alert(`Table No. ${trimmedRoomNumber} is already used in "${trimmedRoomName}". Choose a different number.`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ facilityName: trimmedFacility, roomName: trimmedRoomName, roomNumber: trimmedRoomNumber, price: trimmedPrice ? Number(trimmedPrice) : 0 });
      onClose();
    } catch (err) {
      console.error(err);
      alert(err.message || `Could not ${isEdit ? 'save' : 'create'} this table.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Table — Table Monitoring' : 'New Table — Table Monitoring'}>
      <div className="mfield-section-label">Table identity</div>
      <PresetDropdown
        label="Facility"
        value={facilityName}
        options={facilityOptions}
        onSelect={(v) => { setFacilityName(v); setRoomName(''); }}
        onAdd={handleAddFacility}
        onDelete={handleDeleteFacility}
        placeholder="Select a facility…"
      />
      <PresetDropdown
        label="Table Name"
        value={roomName}
        options={roomNameOptions}
        onSelect={setRoomName}
        onAdd={handleAddRoomName}
        onDelete={handleDeleteRoomName}
        placeholder={facilityName ? 'Select a table name…' : 'Pick a facility first'}
      />

      <div className="mfield-section-label">Number and rate</div>
      <div className="mfield-grid">
        <div className="mfield">
          <label>Table No.</label>
          <input type="text" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="e.g. 101" />
        </div>
        <div className="mfield">
          <label>Rate (₱/hr)</label>
          <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 150" />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-cancel" onClick={onClose}>Cancel</button>
        <button className="btn-confirm" disabled={submitting} onClick={handleSubmit}>
          {submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Table')}
        </button>
      </div>
    </Modal>
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
  const [partialAmount, setPartialAmount] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestCount, setGuestCount] = useState('1');
  const [hasCorkage, setHasCorkage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const isExtend = modal?.mode === 'extend';
  const fromBooking = !isExtend && !!modal?.bookingId;

  useEffect(() => {
    if (!modal) return;

    if (modal.mode === 'extend' && modal.session) {
      setHours(1);
    } else if (fromBooking) {
      setHours(Math.max(1, Math.round(Number(modal.initialDurationHours) || 1)));
      setPaymentMethod('Cash');
      setCollectionMode((modal.downPaymentInfo?.balance || 0) > 0 ? 'later' : 'full');
      setGuestName(modal.initialGuestName || '');
      setGuestCount('1');
      setHasCorkage(false);
    } else {
      setHours(1);
      setPaymentMethod('Cash');
      setCollectionMode('later');
      setPartialAmount('');
      setGuestName('');
      setGuestCount('1');
      setHasCorkage(false);
    }
    setFormError('');
  }, [modal]);

  const duration = Math.max(1, Math.round(Number(hours) || 1));
  const maxHours = isExtend ? Math.max(1, 24 - Math.ceil(Number(modal?.session?.duration) || 0)) : 24;
  const walkInPricing = !isExtend && !fromBooking && modal?.fixedRoom
    ? calculateBookingPrice({ variant: modal.fixedRoom, startHour: manilaHour(), duration, guestCount: Number(guestCount) || 1, hasCorkage })
    : null;
  const totalCharge = fromBooking ? Number(modal?.downPaymentInfo?.total) || 0 : Number(walkInPricing?.amount) || 0;
  const alreadyCollected = fromBooking ? Number(modal?.downPaymentInfo?.collected) || 0 : 0;
  const outstanding = Math.max(0, totalCharge - alreadyCollected);
  const paidAmount = fromBooking
    ? collectionMode === 'full' ? totalCharge : alreadyCollected
    : collectionMode === 'full' ? totalCharge : collectionMode === 'partial' ? Math.max(0, Number(partialAmount) || 0) : 0;

  async function handleSubmit() {
    const totalHours = duration;
    setFormError('');
    if (!Number.isInteger(totalHours) || totalHours < 1) {
      setFormError(isExtend ? 'Choose at least one whole hour to add.' : 'Choose a duration of at least one whole hour.');
      return;
    }
    if (totalHours > maxHours) {
      setFormError(`Choose no more than ${maxHours} whole hour${maxHours === 1 ? '' : 's'}.`);
      return;
    }
    if (!isExtend && paidAmount > totalCharge) {
      setFormError('The amount collected cannot be higher than the session charge.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        mode: modal.mode,
        roomId: modal.fixedRoom?._id,
        roomTarget: modal.roomTarget,
        sessionId: modal.session?._id,
        totalHours,
        paymentMethod,
        paymentTiming: paidAmount >= totalCharge && totalCharge > 0 ? 'Before' : 'After',
        paidAmount,
        guestName,
        guestCount: Number(guestCount) || 1,
        hasCorkage,
        bookingId: modal.bookingId,
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
  const fixedRoomRate = modal?.fixedRoom ? variantRateLabel(modal.fixedRoom) : modal?.roomTarget ? 'From reservation' : '';
  const title = isExtend ? `Extend Session — ${modal?.fixedRoom?.roomName || ''}` : fromBooking ? 'Start Session from Reservation' : 'Start Session';

  return (
    <Modal open={!!modal} onClose={onClose} title={title} size="lg">
      {modal && (
        <>
          {!isExtend && (
            <div className="rmd-stat-box">
              <div className="val">{fixedRoomLabel}</div>
              <div className="lbl lbl--sub">Rate: {fixedRoomRate}</div>
            </div>
          )}

          <div className="mfield-section-label">Session details</div>
          <div className="mfield">
            <label>{isExtend ? 'Whole hours to add' : 'Session length'}</label>
            <div className="session-hour-picker" role="group" aria-label={isExtend ? 'Hours to add' : 'Session length'}>
              {HOUR_PRESETS.filter((value) => value <= maxHours).map((value) => (
                <button key={value} type="button" className={`session-hour-option${duration === value ? ' active' : ''}`} aria-pressed={duration === value} disabled={fromBooking} onClick={() => setHours(value)}>{value}<small>hr</small></button>
              ))}
              {!fromBooking && <label className="session-hour-custom"><span>Other</span><input type="number" min="1" max={maxHours} step="1" value={hours} onChange={(event) => setHours(event.target.value)} aria-label="Custom whole hours" /></label>}
            </div>
            {fromBooking && (
              <p className="mfield-note">This {duration}-hour length comes from the confirmed reservation.</p>
            )}
            {isExtend && <p className="mfield-note">The original start time stays unchanged. The full charge is recalculated from its hourly rates.</p>}
          </div>

          {!isExtend && (
            <div className="mfield">
              <label>Guest Name{fromBooking ? '' : ' (optional)'}</label>
              <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
            </div>
          )}

          {!isExtend && !fromBooking && (
            <>
              <div className="mfield">
                <label>Number of Guests</label>
                <input type="number" min="1" value={guestCount} onChange={(event) => setGuestCount(event.target.value)} />
              </div>
              <label className="booking-addon-check">
                <input type="checkbox" checked={hasCorkage} onChange={(event) => setHasCorkage(event.target.checked)} />
                <span><strong>Outside food or drinks</strong><small>Add ₱{CORKAGE_FEE.toLocaleString()} corkage.</small></span>
              </label>
            </>
          )}

          <div className="mfield-section-label">Payment</div>

          {fromBooking && (
            <div className="session-payment-ledger">
              <div><span>Total charge</span><strong>{money(totalCharge)}</strong></div>
              <div><span>Downpayment received</span><strong>{money(alreadyCollected)}</strong></div>
              <div className={outstanding > 0 ? 'balance-due' : 'balance-paid'}><span>Balance due</span><strong>{money(outstanding)}</strong></div>
            </div>
          )}

          {!isExtend && (
            <div className="session-collection-options" role="group" aria-label="Payment collection">
              <button type="button" className={collectionMode === 'later' ? 'active' : ''} aria-pressed={collectionMode === 'later'} onClick={() => setCollectionMode('later')}><strong>{fromBooking ? 'Keep balance due' : 'Pay after play'}</strong><small>{fromBooking ? `${money(outstanding)} stays visible to staff` : 'Start now with no payment collected'}</small></button>
              <button type="button" className={collectionMode === 'full' ? 'active' : ''} aria-pressed={collectionMode === 'full'} onClick={() => setCollectionMode('full')}><strong>{fromBooking ? 'Collect balance now' : 'Collect full amount'}</strong><small>{fromBooking ? `Record ${money(outstanding)} more` : `Record ${money(totalCharge)} before play`}</small></button>
              {!fromBooking && <button type="button" className={collectionMode === 'partial' ? 'active' : ''} aria-pressed={collectionMode === 'partial'} onClick={() => setCollectionMode('partial')}><strong>Collect part now</strong><small>Keep the rest as a visible balance</small></button>}
            </div>
          )}

          {!isExtend && !fromBooking && collectionMode === 'partial' && (
            <div className="mfield">
              <label>Amount collected now</label>
              <input type="number" min="0" max={totalCharge} step="0.01" value={partialAmount} onChange={(event) => setPartialAmount(event.target.value)} placeholder="0.00" />
            </div>
          )}

          {!isExtend && collectionMode !== 'later' && (
            <div className="mfield">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Maya">Maya</option>
              </select>
            </div>
          )}

          {!isExtend && !fromBooking && walkInPricing && (
            <div className="session-charge-preview">
              <span>{modal.fixedRoom.roomName} · {duration} whole hour{duration === 1 ? '' : 's'}</span>
              <strong>{money(totalCharge)}</strong>
              <small>{variantRateLabel(modal.fixedRoom)}{hasCorkage ? ` · includes ${money(CORKAGE_FEE)} corkage` : ''}</small>
            </div>
          )}

          {formError && <p className="session-form-error" role="alert">{formError}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="button" className="btn-confirm" disabled={submitting} onClick={handleSubmit}>
              {submitting ? (isExtend ? 'Extending…' : 'Starting…') : (isExtend ? `Add ${duration} hour${duration === 1 ? '' : 's'}` : 'Start session')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Monitor;
