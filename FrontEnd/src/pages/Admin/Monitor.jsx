import '../../styles/admin/monitor.css';
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import DataTable from '../../components/DataTable';
import Pagination from '../../components/Pagination';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { monitorRoomsService, roomSessionsService } from '../../services/monitoring';
import { bookingsService } from '../../services/bookings';
import { dateKey } from '../../utils/rooms';
import {
  useRoomMonitorData,
  normalizeRoom,
  sessionEnd,
  formatStartTime,
  formatEndTime,
  formatTimeRemaining,
  findRoomOccupancy,
  buildRoomView,
} from '../../hooks/useRoomMonitorData';

const FACILITY_ICONS = { Billiards: 'bi-disc', Karaoke: 'bi-mic', 'Private Rooms': 'bi-door-open', 'Rental Court': 'bi-trophy' };
const FACILITY_ICON_DEFAULT = 'bi-building';
const DUE_BOOKINGS_POLL_MS = 20 * 1000;

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
  const facilityRooms = rooms.filter((r) => r.facilityName === facilityName);

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
  const canManageBookings = hasPermission('booking:manage');
  const canStartFromBooking = canManage || canManageBookings;
  const { confirm, confirmProps } = useConfirm();

  const {
    rooms, setRooms, sessions, loading,
    fetchRooms, fetchMonitorSessions,
    viewMode, changeViewMode,
    soundMuted, toggleSoundMuted,
  } = useRoomMonitorData('admin');

  const [modal, setModal] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editRoomId, setEditRoomId] = useState(null);
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [roomNameFilter, setRoomNameFilter] = useState('All');
  const [sortBy, setSortBy] = useState('default');
  const [detailRoomId, setDetailRoomId] = useState(null);
  const [dueBookings, setDueBookings] = useState([]);
  const [gridPage, setGridPage] = useState(1);
  const [gridPageSize, setGridPageSize] = useState(10);

  async function fetchDueBookings() {
    if (!canStartFromBooking) return;
    try {
      const today = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
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

  async function endSession(sessionId, roomId, paid) {
    if (!guardPermission('room:manage')) return;
    const message = paid
      ? 'End this session and settle the remaining balance as Paid? The room will be marked Available.'
      : 'End this session without recording payment? The room will be marked Available and no sale will be recorded.';
    if (!(await confirm(message, { confirmText: paid ? 'End & Mark Paid' : 'End without Payment' }))) return;
    try {
      const result = await roomSessionsService.end(sessionId, paid);

      if (result?.roomDeleted) {
        setRooms((prev) => prev.filter((r) => r._id !== roomId));
      } else {
        try {
          const updatedRoom = await monitorRoomsService.updateStatus(roomId, 'Available');
          setRooms((prev) => prev.map((r) => (r._id === roomId ? normalizeRoom({ ...r, ...updatedRoom }) : r)));
        } catch {}
      }

      await fetchMonitorSessions();
    } catch (err) {
      console.error(err);
      alert('Could not end this session.');
    }
  }

  function openStartSessionModal(room) {
    if (!guardPermission('room:manage')) return;
    setModal({ mode: 'start', fixedRoom: room, session: null });
  }
  function openExtendModal(session, room) {
    if (!guardPermission('room:manage')) return;
    setModal({ mode: 'extend', fixedRoom: room, session });
  }
  function openStartFromBooking(booking, matchedRoom, roomTarget, previewNumber) {
    if (!canStartFromBooking) return;
    setModal({
      mode: 'start',
      fixedRoom: matchedRoom,
      roomTarget: matchedRoom ? null : roomTarget,
      previewNumber: matchedRoom ? null : previewNumber,
      session: null,
      bookingId: booking._id,
      initialGuestName: booking.guestName,
      initialDurationHours: booking.duration,
      downPaymentInfo: { paid: booking.downPayment || 0, total: booking.amount || 0 },
    });
  }

  async function handleModalSubmit({ mode, roomId, roomTarget, sessionId, totalHours, paymentMethod, paymentStatus, paymentTiming, guestName, bookingId }) {
    if (mode !== 'extend' && bookingId) {
      if (!canStartFromBooking) return;
    } else if (!guardPermission('room:manage')) {
      return;
    }

    if (mode === 'extend') {
      await roomSessionsService.extend(sessionId, { addedHours: totalHours, paymentStatus });
    } else {
      const created = await roomSessionsService.create({ roomId, roomTarget, duration: totalHours, paymentMethod, paymentStatus, paymentTiming, guestName, bookingId });

      try {
        const updatedRoom = await monitorRoomsService.updateStatus(created.room, 'Occupied');
        setRooms((prev) => {
          const exists = prev.some((r) => r._id === created.room);
          if (exists) return prev.map((r) => (r._id === created.room ? normalizeRoom({ ...r, ...updatedRoom }) : r));
          return [...prev, normalizeRoom(updatedRoom)];
        });
      } catch {}
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
    if (!(await confirm('Delete this room permanently? This cannot be undone.', { confirmText: 'Delete' }))) return;
    try {
      await monitorRoomsService.remove(roomId);
      setRooms((prev) => prev.filter((r) => r._id !== roomId));
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not delete this room.');
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

  const detailRoom = detailRoomId ? rooms.find((r) => r._id === detailRoomId) || null : null;
  const detailView = detailRoom ? buildRoomView(detailRoom, sessions) : null;

  const roomTableColumns = [
    {
      key: 'room',
      label: 'Room',
      sortable: true,
      sortValue: (r) => Number(r.roomNumber) || r.roomNumber,
      render: (r) => (
        <>
          <div className="rm-name">Room {r.roomNumber}</div>
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
      sortValue: (r) => buildRoomView(r, sessions).occupancy?.paymentStatus || '',
      render: (r) => {
        const { occupancy } = buildRoomView(r, sessions);
        return occupancy ? (
          <>
            <span className={`pay-pill pay-${(occupancy.paymentStatus || 'Unpaid').toLowerCase()}`}>{occupancy.paymentStatus || 'Unpaid'}</span>
            <span className="pay-timing-tag">{occupancy.paymentTiming === 'After' ? 'Pay After' : 'Pay Before'}</span>
          </>
        ) : '—';
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
              canManage ? (
                <>
                  <button className="rm-btn" onClick={() => openExtendModal(occupancy, r)}><i className="bi bi-pencil-square"></i>Extend</button>
                  <button className="rm-btn" onClick={() => endSession(occupancy._id, r._id, true)}><i className="bi bi-check2-circle"></i>End & Mark Paid</button>
                  <button className="rm-btn danger" onClick={() => endSession(occupancy._id, r._id, false)}><i className="bi bi-trash"></i>End without Payment</button>
                </>
              ) : (
                <span className="rm-note">In use</span>
              )
            ) : r.status === 'Available' ? (
              canManage ? (
                <>
                  <button className="rm-btn primary" onClick={() => openStartSessionModal(r)}><i className="bi bi-play-fill"></i>Start Session</button>
                  <button className="rm-btn" onClick={() => setEditRoomId(r._id)}><i className="bi bi-pencil-square"></i>Edit</button>
                  <button className="rm-btn danger" onClick={() => deleteRoom(r._id)}><i className="bi bi-trash"></i>Delete</button>
                </>
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
          <span className="live-badge"><span className="dot"></span>Live</span>
          <span className="rm-page-sub">Real-time room status and session monitoring</span>
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
            <button className="btn-teal" onClick={() => setShowAddRoom(true)}>
              <i className="bi bi-building-add"></i>New Room
            </button>
          )}
        </div>
      </div>

      {canStartFromBooking && dueBookings.length > 0 && (
        <div className="card card-flush rm-table-wrap rm-due-wrap">
          <div className="rm-group-head">Reservations Due</div>
          <table className="rm-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Facility / Room</th>
                <th>Scheduled</th>
                <th>Downpayment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {dueBookings
                .slice()
                .sort((a, b) => a.timeIn.localeCompare(b.timeIn))
                .map((b) => {
                  const roomTarget = getBookingRoomTarget(b);
                  const { matchedRoom, previewNumber } = matchRoomForTarget(rooms, roomTarget);
                  const scheduledStart = new Date(`${b.date}T${String(b.timeIn).padStart(5, '0')}:00`);
                  const isDue = scheduledStart.getTime() <= Date.now();
                  const occupancy = matchedRoom ? findRoomOccupancy(matchedRoom._id, sessions) : null;
                  const hasConflict = matchedRoom && occupancy;
                  return (
                    <tr key={b._id} className={isDue ? 'blink-expired' : ''}>
                      <td>{b.guestName}</td>
                      <td>
                        <div className="rm-name">{b.roomLabel}</div>
                        <div className="rm-type">
                          {matchedRoom
                            ? `Room No.${matchedRoom.roomNumber}`
                            : roomTarget
                              ? previewNumber
                                ? `Room No.${previewNumber} (will be created)`
                                : 'Room No. will be auto-assigned'
                              : 'No matching Room Monitor room'}
                        </div>
                      </td>
                      <td>{scheduledStart.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>₱{(b.downPayment || 0).toFixed(2)} / ₱{(b.amount || 0).toFixed(2)}</td>
                      <td>
                        <span className={`rm-status-pill ${isDue ? 'status-expired' : 'status-warning'}`}>
                          <span className="dot"></span>{isDue ? 'Due Now' : 'Upcoming'}
                        </span>
                        {hasConflict && (
                          <div style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: '4px' }}>
                            Room occupied — end that session first
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          className="rm-btn"
                          disabled={!roomTarget || hasConflict}
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
        <div className="room-grid"><div className="room-grid-empty">Loading rooms…</div></div>
      ) : rooms.length === 0 ? (
        <div className="room-grid"><div className="room-grid-empty">No rooms yet — click New Room above to add one.</div></div>
      ) : (
        <>
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
              <div className="fac-chips" role="group" aria-label="Filter by room name">
                <button
                  type="button"
                  className={`fac-chip${roomNameFilter === 'All' ? ' active' : ''}`}
                  onClick={() => setRoomNameFilter('All')}
                >
                  All Rooms
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
                Sort: Room No.
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
              >
                {occupancy && (isCritical || isPastEnd) && (
                  <span className="rm-warning-pop"><i className="bi bi-exclamation-triangle-fill"></i></span>
                )}
                <div className="rm-head">
                  <div>
                    <div className="rm-name">Room {r.roomNumber}</div>
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
                      <div className={`rm-foot-info rm-foot-info--${(occupancy.paymentStatus || 'Unpaid').toLowerCase()}`}>
                        <i className="bi bi-person"></i>{occupancy.paymentStatus || 'Unpaid'} · {occupancy.paymentTiming === 'After' ? 'Pay After' : 'Pay Before'}
                      </div>
                      <div className="rm-foot-price">₱{r.price}/hr</div>
                    </div>
                  </>
                ) : (
                  <div className="rm-empty">
                    <i className="bi bi-check-circle"></i>
                    <span>{r.status === 'Available' ? 'Available' : r.status}</span>
                  </div>
                )}
                {!occupancy && r.status === 'Available' && canManage && (
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
            getRowClassName={(r) => (buildRoomView(r, sessions).blinkClass ? 'blink-expired' : undefined)}
            emptyMessage="No rooms match the current filters."
            itemLabel="rooms"
          />
        </div>
      )}
        </>
      )}

      <SessionModal modal={modal} onClose={() => setModal(null)} onSubmit={handleModalSubmit} />
      <RoomFormModal open={showAddRoom} onClose={() => setShowAddRoom(false)} onSubmit={handleAddRoom} existingFacilities={facilities} rooms={rooms} />
      <RoomFormModal
        open={!!editRoomId}
        onClose={() => setEditRoomId(null)}
        onSubmit={handleEditRoom}
        existingFacilities={facilities}
        rooms={rooms}
        initialRoom={rooms.find((r) => r._id === editRoomId) || null}
      />
      <RoomDetailModal
        room={detailRoom}
        view={detailView}
        onClose={() => setDetailRoomId(null)}
        canManage={canManage}
        onExtend={() => {
          setDetailRoomId(null);
          openExtendModal(detailView.occupancy, detailRoom);
        }}
        onEndSessionPaid={() => {
          setDetailRoomId(null);
          endSession(detailView.occupancy._id, detailRoom._id, true);
        }}
        onEndSessionUnpaid={() => {
          setDetailRoomId(null);
          endSession(detailView.occupancy._id, detailRoom._id, false);
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

function RoomDetailModal({ room, view, onClose, canManage, onExtend, onEndSessionPaid, onEndSessionUnpaid, onEdit, onDelete }) {
  const title = room ? `${room.roomName} — ${room.facilityName}` : 'Room details';

  return (
    <Modal open={!!room} onClose={onClose} title={title}>
      {room && view && (
        <>
          <div className="rm-rows">
            <div className="rm-row">
              <span className="lbl">Status</span>
              <span className={`rm-status-pill status-${view.stateClass}`}><span className="dot"></span>{view.statusLabel}</span>
            </div>
            <div className="rm-row"><span className="lbl">Facility</span><span className="val">{room.facilityName}</span></div>
            <div className="rm-row"><span className="lbl">Room Name</span><span className="val">{room.roomName}</span></div>
            <div className="rm-row"><span className="lbl">Room No.</span><span className="val">{room.roomNumber}</span></div>
            {view.occupancy ? (
              <>
                {view.occupancy.guestName && (
                  <div className="rm-row"><span className="lbl">Guest</span><span className="val">{view.occupancy.guestName}</span></div>
                )}
                <div className="rm-row"><span className="lbl">Payment Method</span><span className="val">{view.occupancy.paymentMethod || '—'}</span></div>
                <div className="rm-row">
                  <span className="lbl">Payment Status</span>
                  <span className={`pay-pill pay-${(view.occupancy.paymentStatus || 'Unpaid').toLowerCase()}`}>{view.occupancy.paymentStatus || 'Unpaid'}</span>
                </div>
                <div className="rm-row"><span className="lbl">Payment Timing</span><span className="val">{view.occupancy.paymentTiming === 'After' ? 'Pay After' : 'Pay Before'}</span></div>
                <div className="rm-row"><span className="lbl">Amount</span><span className="val">₱{(view.occupancy.amount || 0).toFixed(2)}</span></div>
                <div className="rm-row"><span className="lbl">Start Time</span><span className="val">{formatStartTime(view.occupancy)}</span></div>
                <div className="rm-row"><span className="lbl">End Time</span><span className="val">{formatEndTime(view.occupancy)}</span></div>
                <div className="rm-row">
                  <span className="lbl">Time Left</span>
                  <span className={`val rm-timer${view.isWarning ? ' warn' : ''}${(view.isPastEnd || view.isCritical) ? ' expired' : ''}`}>
                    {formatTimeRemaining(view.remaining, view.isPastEnd)}
                  </span>
                </div>
              </>
            ) : (
              <div className="rm-row"><span className="lbl">Rate</span><span className="val">₱{room.price}/hr</span></div>
            )}
          </div>
          <div className="modal-actions">
            {view.occupancy ? (
              canManage && (
                <>
                  <button className="rm-btn" onClick={onExtend}><i className="bi bi-pencil-square"></i>Extend</button>
                  <button className="rm-btn" onClick={onEndSessionPaid}><i className="bi bi-check2-circle"></i>End & Mark Paid</button>
                  <button className="rm-btn danger" onClick={onEndSessionUnpaid}><i className="bi bi-trash"></i>End without Payment</button>
                </>
              )
            ) : room.status === 'Available' ? (
              canManage && (
                <>
                  <button className="rm-btn" onClick={onEdit}><i className="bi bi-pencil-square"></i>Edit</button>
                  <button className="rm-btn danger" onClick={onDelete}><i className="bi bi-trash"></i>Delete Room</button>
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
    if (!window.confirm(`Remove "${option}" from this facility's Room Name list?`)) return;
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
      alert('Please fill in Facility, Room Name, and Room No.');
      return;
    }
    const parsedRoomNumber = parseInt(trimmedRoomNumber, 10);
    if (Number.isFinite(parsedRoomNumber) && parsedRoomNumber <= 0) {
      alert('Room No. must be greater than 0.');
      return;
    }
    const trimmedPrice = price.trim();
    if (trimmedPrice && (Number.isNaN(Number(trimmedPrice)) || Number(trimmedPrice) < 0)) {
      alert('Rate must be a valid non-negative number.');
      return;
    }
    const numberTaken = rooms.some((r) => r.roomName === trimmedRoomName && String(r.roomNumber) === trimmedRoomNumber && r._id !== initialRoom?._id);
    if (numberTaken) {
      alert(`Room No. ${trimmedRoomNumber} is already used in "${trimmedRoomName}". Choose a different number.`);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ facilityName: trimmedFacility, roomName: trimmedRoomName, roomNumber: trimmedRoomNumber, price: trimmedPrice ? Number(trimmedPrice) : 0 });
      onClose();
    } catch (err) {
      console.error(err);
      alert(err.message || `Could not ${isEdit ? 'save' : 'create'} this room.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Room — Room Monitoring' : 'New Room — Room Monitoring'}>
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
        label="Room Name"
        value={roomName}
        options={roomNameOptions}
        onSelect={setRoomName}
        onAdd={handleAddRoomName}
        onDelete={handleDeleteRoomName}
        placeholder={facilityName ? 'Select a room name…' : 'Pick a facility first'}
      />
      <div className="mfield">
        <label>Rate (₱/hr)</label>
        <input type="number" min="0" step="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 150" />
      </div>
      <div className="mfield">
        <label>Room No.</label>
        <input type="text" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="e.g. 101" />
      </div>
      <div className="modal-actions">
        <button className="btn-cancel" onClick={onClose}>Cancel</button>
        <button className="btn-confirm" disabled={submitting} onClick={handleSubmit}>
          {submitting ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save Changes' : 'Add Room')}
        </button>
      </div>
    </Modal>
  );
}


const DURATION_PRESETS = [
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '1h', mins: 60 },
  { label: '2h', mins: 120 },
  { label: '3h', mins: 180 },
];

const EXTEND_PRESETS = [
  { label: '1hr', mins: 60 },
  { label: '2hr', mins: 120 },
  { label: '3hr', mins: 180 },
];

function SessionModal({ modal, onClose, onSubmit }) {
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentStatus, setPaymentStatus] = useState('Unpaid');
  const [paymentTiming, setPaymentTiming] = useState('Before');
  const [guestName, setGuestName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isExtend = modal?.mode === 'extend';
  const fromBooking = !isExtend && !!modal?.bookingId;

  useEffect(() => {
    if (!modal) return;

    if (modal.mode === 'extend' && modal.session) {
      setHours('');
      setMinutes('');
      setSeconds('');
      setPaymentStatus('Unpaid');
    } else if (fromBooking) {
      setDurationFromHours(modal.initialDurationHours || 0);
      setPaymentMethod('Cash');
      setPaymentStatus('Unpaid');
      setPaymentTiming('Before');
      setGuestName(modal.initialGuestName || '');
    } else {
      setHours('');
      setMinutes('');
      setSeconds('');
      setPaymentMethod('Cash');
      setPaymentStatus('Unpaid');
      setPaymentTiming('Before');
      setGuestName('');
    }
  }, [modal]);

  function setDurationFromHours(totalHours) {
    const totalSeconds = Math.max(1, Math.min(24 * 3600, Math.round((totalHours || 0) * 3600)));
    setHours(String(Math.floor(totalSeconds / 3600)));
    setMinutes(String(Math.floor((totalSeconds % 3600) / 60)));
    setSeconds(String(totalSeconds % 60));
  }

  function handleHmsChange(field, rawValue) {
    const current = { hours: Number(hours) || 0, minutes: Number(minutes) || 0, seconds: Number(seconds) || 0 };
    current[field] = Math.max(0, Number(rawValue) || 0);
    const totalSeconds = Math.max(0, Math.min(24 * 3600, current.hours * 3600 + current.minutes * 60 + current.seconds));
    setHours(String(Math.floor(totalSeconds / 3600)));
    setMinutes(String(Math.floor((totalSeconds % 3600) / 60)));
    setSeconds(String(totalSeconds % 60));
  }

  function collectDurationHours() {
    const h = Math.max(0, Number(hours) || 0);
    const m = Math.max(0, Number(minutes) || 0);
    const s = Math.max(0, Number(seconds) || 0);
    return h + m / 60 + s / 3600;
  }

  async function handleSubmit() {
    const totalHours = collectDurationHours();
    if (!totalHours || totalHours < 1 / 3600) {
      alert(isExtend ? 'Hours to add must be at least 1 second.' : 'Duration must be at least 1 second.');
      return;
    }
    if (totalHours > 24) {
      alert(isExtend ? 'Hours to add cannot exceed 24 hours.' : 'Duration cannot exceed 24 hours.');
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
        paymentStatus,
        paymentTiming,
        guestName,
        bookingId: modal.bookingId,
      });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save this room monitoring session.');
    } finally {
      setSubmitting(false);
    }
  }

  const fixedRoomLabel = modal?.fixedRoom
    ? `${modal.fixedRoom.roomName} — Room No. ${modal.fixedRoom.roomNumber} (${modal.fixedRoom.facilityName})`
    : modal?.roomTarget
      ? `${modal.roomTarget.roomName} — ${modal.previewNumber ? `Room No. ${modal.previewNumber} ` : ''}(${modal.roomTarget.facilityName}) — will be created`
      : '';
  const fixedRoomRate = modal?.fixedRoom ? `₱${modal.fixedRoom.price}/hr` : modal?.roomTarget ? '—' : '';
  const title = isExtend ? `Extend Session — ${modal?.fixedRoom?.roomName || ''}` : fromBooking ? 'Start Session from Reservation' : 'Start Session';

  return (
    <Modal open={!!modal} onClose={onClose} title={title}>
      {modal && (
        <>
          {!isExtend && (
            <>
              <p style={{ margin: '-10px 0 4px', fontSize: '.78rem', color: 'var(--muted)' }}>{fixedRoomLabel}</p>
              <p style={{ margin: '0 0 16px', fontSize: '.78rem', color: 'var(--muted)' }}>Rate: {fixedRoomRate}</p>
            </>
          )}

          <div className="mfield">
            <label>{isExtend ? 'Hours to Add (Hours / Minutes / Seconds)' : 'Duration (Hours / Minutes / Seconds)'}</label>

            {isExtend && (
              <div className="aw-preset-row">
                {EXTEND_PRESETS.map((p) => (
                  <button key={p.label} type="button" className="aw-preset-btn" onClick={() => setDurationFromHours(p.mins / 60)}>{p.label}</button>
                ))}
              </div>
            )}

            <div className={`field-row${isExtend ? ' field-row--extend-gap' : ''}`}>
              <div className="field-col">
                <input type="number" min="0" step="1" value={hours} disabled={fromBooking} onChange={(e) => handleHmsChange('hours', e.target.value)} />
                <div className="aw-unit-lbl">Hours</div>
              </div>
              <div className="field-col">
                <input type="number" min="0" step="1" value={minutes} disabled={fromBooking} onChange={(e) => handleHmsChange('minutes', e.target.value)} />
                <div className="aw-unit-lbl">Minutes</div>
              </div>
              <div className="field-col">
                <input type="number" min="0" step="1" value={seconds} disabled={fromBooking} onChange={(e) => handleHmsChange('seconds', e.target.value)} />
                <div className="aw-unit-lbl">Seconds</div>
              </div>
            </div>
            {fromBooking && (
              <p style={{ margin: '6px 0 0', fontSize: '.72rem', color: 'var(--muted)' }}>Duration is fixed to what the guest reserved.</p>
            )}

            {!isExtend && !fromBooking && (
              <div className="aw-preset-row" style={{ marginTop: '9px' }}>
                {DURATION_PRESETS.map((p) => (
                  <button key={p.label} type="button" className="aw-preset-btn" onClick={() => setDurationFromHours(p.mins / 60)}>{p.label}</button>
                ))}
              </div>
            )}
          </div>

          {!isExtend && (
            <div className="mfield">
              <label>Guest Name{fromBooking ? '' : ' (optional)'}</label>
              <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Juan Dela Cruz" />
            </div>
          )}

          {!isExtend && !fromBooking && (
            <div className="mfield">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Maya">Maya</option>
              </select>
            </div>
          )}

          {!isExtend && (
            <div className="mfield">
              <label>Payment Timing</label>
              <div className="pay-toggle" role="group" aria-label="Payment timing">
                <button
                  type="button"
                  className={`pay-toggle-btn pay-toggle-btn--paid${paymentTiming === 'Before' ? ' active' : ''}`}
                  onClick={() => setPaymentTiming('Before')}
                >
                  Pay Before
                </button>
                <button
                  type="button"
                  className={`pay-toggle-btn pay-toggle-btn--unpaid${paymentTiming === 'After' ? ' active' : ''}`}
                  onClick={() => setPaymentTiming('After')}
                >
                  Pay After
                </button>
              </div>
            </div>
          )}

          {fromBooking ? (
            <div className="mfield">
              <label>Payment</label>
              <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--muted)' }}>
                Downpayment already paid online: ₱{(modal.downPaymentInfo?.paid || 0).toFixed(2)} of ₱{(modal.downPaymentInfo?.total || 0).toFixed(2)}. Applied automatically.
              </p>
            </div>
          ) : (
            <div className="mfield">
              <label>{isExtend ? 'Payment Status (for added time)' : 'Payment Status'}</label>
              <div className="pay-toggle" role="group" aria-label="Payment status">
                <button
                  type="button"
                  className={`pay-toggle-btn pay-toggle-btn--paid${paymentStatus === 'Paid' ? ' active' : ''}`}
                  onClick={() => setPaymentStatus('Paid')}
                >
                  Paid
                </button>
                <button
                  type="button"
                  className={`pay-toggle-btn pay-toggle-btn--unpaid${paymentStatus === 'Unpaid' ? ' active' : ''}`}
                  onClick={() => setPaymentStatus('Unpaid')}
                >
                  Unpaid
                </button>
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-confirm" disabled={submitting} onClick={handleSubmit}>
              {submitting ? (isExtend ? 'Saving…' : 'Starting…') : (isExtend ? 'Save Changes' : 'Start Session')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Monitor;