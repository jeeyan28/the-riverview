import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { monitorRoomsService, roomSessionsService } from '../../services/monitoring';


const MONITOR_WARNING_MS = 10 * 60 * 1000; // timer turns yellow at ≤10 min
const MONITOR_CRITICAL_MS = 60 * 1000;     // timer turns red at ≤1 min
const MONITOR_WARNING_MIN = MONITOR_WARNING_MS / 60000;
const MONITOR_CRITICAL_MIN = MONITOR_CRITICAL_MS / 60000;

// Overdue sound alert: beeps once the instant a room first hits 00:00, then
// repeats on this interval for as long as any room is still overdue.
const OVERDUE_ALERT_REPEAT_MS = 30 * 1000;
const OVERDUE_SOUND_MUTED_KEY = 'roomMonitor.overdueSoundMuted';

// Two-tone beep via the Web Audio API — no audio file/asset dependency.
// Browsers block audio before any user gesture on the page; since staff are
// actively clicking around Room Monitor this only ever fails silently on
// the very first page load, which the visual ring already covers.
function playOverdueBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [880, 660].forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Web Audio unavailable — the visual ring still applies.
  }
}

const BASE_STATUS_CLASS = { Available: 'available', Occupied: 'occupied', 'Under Maintenance': 'overdue', Inactive: 'vacant' };

// Facility group header icon — keyed off r.facilityName. Unrecognized
// facilities fall back to a generic building icon.
const FACILITY_ICONS = { Billiards: 'ti-disc', Karaoke: 'ti-microphone-2', 'Private Rooms': 'ti-door', 'Rental Court': 'ti-trophy' };
const FACILITY_ICON_DEFAULT = 'ti-building';

// Badge text for Grid + Table. Any active occupancy reads "In Use" —
// urgency (>10min/≤10min/≤1min) is conveyed by color/icon, not by text.
// Non-occupied rooms fall back to the room's own status (Available, etc).

const VIEW_MODE_KEY = 'roomMonitor.viewMode';

// Rooms created before the facilityName/roomName split only have the old
// `name` field (which held the facility) and no roomName at all. Filling
// both in here, once, means every render below can assume they exist —
// no repeated fallback checks scattered through the grid/table/modals.
// Edit the room via the UI to replace these placeholders with real values.
function normalizeRoom(r) {
  return {
    ...r,
    facilityName: r.facilityName || r.name || 'Unassigned',
    hasCustomName: !!(r.roomName && r.roomName.trim()),
    roomName: r.roomName || `Room ${r.roomNumber ?? ''}`.trim(),
  };
}

function sessionStart(session) {
  return new Date(session.startTime);
}
function sessionEnd(session) {
  return new Date(sessionStart(session).getTime() + session.duration * 60 * 60 * 1000);
}
function formatStartTime(session) {
  return sessionStart(session).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatEndTime(session) {
  return sessionEnd(session).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
// Precise HH:MM:SS while time remains; clamps to 00:00:00 once past end.
function formatTimeRemaining(ms, isPastEnd) {
  if (isPastEnd) return '00:00:00';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function findRoomOccupancy(roomId, sessions) {
  const matches = sessions.filter((s) => s.status === 'Active' && String(s.room?._id || s.room) === String(roomId));
  if (!matches.length) return null;
  return matches.reduce((latest, s) => (!latest || sessionEnd(s) > sessionEnd(latest) ? s : latest), null);
}

// Single source of truth for a room's derived monitoring state — shared by
// Grid cards and Table rows so the two views can never disagree or duplicate logic.
function buildRoomView(r, sessions) {
  const occupancy = findRoomOccupancy(r._id, sessions);
  const remaining = occupancy ? sessionEnd(occupancy).getTime() - Date.now() : null;

  const isPastEnd = occupancy && remaining <= 0;
  const isCritical = occupancy && !isPastEnd && remaining <= MONITOR_CRITICAL_MS;
  const isWarning = occupancy && !isPastEnd && !isCritical && remaining <= MONITOR_WARNING_MS;

  // 'safe' = an occupied room with plenty of time left (>10min) — green per
  // the traffic-light spec, same border/pill treatment as Available.
  const stateClass = (isPastEnd || isCritical) ? 'expired' : isWarning ? 'warning' : occupancy ? 'safe' : (BASE_STATUS_CLASS[r.status] || 'vacant');
  const statusLabel = occupancy ? 'In Use' : r.status;
  // Past-end (remaining <= 0) blinks in addition to being red, so it stands
  // out from the merely-critical (≤1 min, still counting) state.
  const blinkClass = isPastEnd ? ' blink-expired' : '';

  return { occupancy, remaining, isPastEnd, isCritical, isWarning, stateClass, statusLabel, blinkClass };
}

function Monitor() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');
  const { confirm, confirmProps } = useConfirm();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [, forceTick] = useState(0); // re-render every second so countdowns move
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(VIEW_MODE_KEY) === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });

  function changeViewMode(mode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* localStorage unavailable — view choice just won't persist */
    }
  }

  // modal: null (closed) | { mode: 'start'|'extend', fixedRoom: room, session: session|null }
  // 'start'  — Available room's "Start Session" button — starts a brand-new session
  // 'extend' — Occupied room's "Extend" button — re-anchors remaining time
  const [modal, setModal] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [editRoomId, setEditRoomId] = useState(null);
  const [facilityFilter, setFacilityFilter] = useState('All');
  const [roomNameFilter, setRoomNameFilter] = useState('All'); // shows only the picked room within the current facility
  const [sortBy, setSortBy] = useState('default'); // 'default' | 'timeLeft' | 'roomNumber'
  const [detailRoomId, setDetailRoomId] = useState(null);
  const [soundMuted, setSoundMuted] = useState(() => {
    try {
      return localStorage.getItem(OVERDUE_SOUND_MUTED_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Kept fresh every render (not just on rooms/sessions change) so the
  // interval below — mounted once — always reads the current overdue set
  // without needing to be recreated every tick.
  const overdueIdsRef = useRef([]);
  const previouslyOverdueRef = useRef(new Set());
  const lastAlertAtRef = useRef(0);
  const soundMutedRef = useRef(soundMuted);

  function toggleSoundMuted() {
    setSoundMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(OVERDUE_SOUND_MUTED_KEY, next ? '1' : '0');
      } catch {
        /* localStorage unavailable — mute choice just won't persist */
      }
      return next;
    });
  }

  function selectFacilityFilter(name) {
    setFacilityFilter(name);
    setRoomNameFilter('All');
  }

  async function fetchRooms() {
    try {
      const data = await monitorRoomsService.list();
      const list = Array.isArray(data) ? data : [];
      setRooms(list.map(normalizeRoom));
      return list;
    } catch (err) {
      console.error(err);
      setRooms([]);
      return [];
    }
  }

  // Fetches every session (Active + Finished) — the card grid derives both
  // current occupancy and each room's last-finished-session from this one list.
  async function fetchMonitorSessions() {
    try {
      const data = await roomSessionsService.list();
      const list = Array.isArray(data) ? data : [];
      setSessions(list);
      return list;
    } catch (err) {
      console.error(err);
      setSessions([]);
      return [];
    }
  }

  useEffect(() => {
    soundMutedRef.current = soundMuted;
  }, [soundMuted]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([fetchRooms(), fetchMonitorSessions()]);
      if (!cancelled) setLoading(false);
    })();

    const tickHandle = setInterval(() => forceTick((n) => n + 1), 1000);

    // Separate interval (mount-once) for the overdue sound alert, so it
    // isn't torn down/recreated by the render-driving tick above. Reads
    // overdueIdsRef, which is kept current every render below.
    const alertHandle = setInterval(() => {
      const current = overdueIdsRef.current;
      if (current.length === 0) {
        previouslyOverdueRef.current = new Set();
        return;
      }
      if (!soundMutedRef.current) {
        const prev = previouslyOverdueRef.current;
        const hasNewOverdue = current.some((id) => !prev.has(id));
        const now = Date.now();
        const dueForRepeat = now - lastAlertAtRef.current >= OVERDUE_ALERT_REPEAT_MS;
        if (hasNewOverdue || dueForRepeat) {
          playOverdueBeep();
          lastAlertAtRef.current = now;
        }
      }
      previouslyOverdueRef.current = new Set(current);
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(tickHandle);
      clearInterval(alertHandle);
    };
  }, []);

  // "End Session" on an occupied room card — finishes it early (or after it
  // has hit 0, since reaching 0 no longer ends it automatically). Marks the
  // session Finished (kept, not deleted) and frees up the room immediately.
  async function endSession(sessionId, roomId) {
    if (!guardPermission('room:manage')) return;
    if (!(await confirm('End this session now? The room will be marked Available.', { confirmText: 'End Session' }))) return;
    try {
      await roomSessionsService.finish(sessionId);

      // Soft-fail on purpose: the session is already marked Finished above —
      // a failed room reset here just means the card won't repaint as
      // Available until the next successful update.
      try {
        const updatedRoom = await monitorRoomsService.updateStatus(roomId, 'Available');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? normalizeRoom({ ...r, ...updatedRoom }) : r)));
      } catch {
        /* soft-fail — see comment above */
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

  async function handleModalSubmit({ mode, roomId, sessionId, totalHours, paymentMethod, paymentStatus }) {
    if (!guardPermission('room:manage')) return;

    if (mode === 'extend') {
      // Re-anchor to right now with the freshly chosen remaining duration —
      // the simplest way to let staff set an exact "time left".
      await roomSessionsService.update(sessionId, {
        startTime: new Date().toISOString(),
        duration: totalHours,
        paymentMethod,
        paymentStatus,
      });
    } else {
      // mode === 'start'
      await roomSessionsService.create({ roomId, duration: totalHours, paymentMethod, paymentStatus });

      // Reflect the room as occupied right away rather than waiting for a refetch.
      try {
        const updatedRoom = await monitorRoomsService.updateStatus(roomId, 'Occupied');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? normalizeRoom({ ...r, ...updatedRoom }) : r)));
      } catch {
        /* soft-fail — matches original's `if (roomRes.ok)` check */
      }
    }

    setModal(null);
    await fetchMonitorSessions();
  }

  // Creates a Room from within Room Monitoring itself. Facility, Room Name,
  // Room No., and Rate (price) are collected; status/capacity keep their
  // existing defaults and can be adjusted later via Settings.
  async function handleAddRoom({ facilityName, roomName, roomNumber, price }) {
    if (!guardPermission('room:manage')) return;
    await monitorRoomsService.create({ facilityName, roomName, roomNumber, price });
    await fetchRooms();
  }

  // Edit button — saves the room's own details (facility/room name/rate/room
  // no.), it does not touch sessions or occupancy.
  async function handleEditRoom({ facilityName, roomName, roomNumber, price }) {
    if (!guardPermission('room:manage')) return;
    await monitorRoomsService.update(editRoomId, { facilityName, roomName, roomNumber, price });
    await fetchRooms();
  }

  // "Delete" beside an Available room's Start Session/Edit buttons — removes
  // the Room itself. Only offered while Available; an Occupied room has none
  // of these buttons.
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

  // Facilities come from each room's own `facilityName` field.
  const facilities = [...new Set(rooms.map((r) => r.facilityName))];
  const facilityCounts = rooms.reduce((acc, r) => {
    acc[r.facilityName] = (acc[r.facilityName] || 0) + 1;
    return acc;
  }, {});
  const filteredRooms = facilityFilter === 'All' ? rooms : rooms.filter((r) => r.facilityName === facilityFilter);
  // Room-name options only make sense once a specific facility is picked —
  // "All Facilities" can have duplicate room names across different facilities.
  const roomNameOptions = facilityFilter === 'All' ? [] : [...new Set(filteredRooms.map((r) => r.roomName))];
  const visibleRooms = (() => {
    const list = roomNameFilter === 'All' ? filteredRooms : filteredRooms.filter((r) => r.roomName === roomNameFilter);
    if (sortBy === 'timeLeft') {
      // Soonest-expiring occupied rooms first; rooms with no active session go last.
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
  const facilityGroups = [];
  const groupIndex = new Map();
  visibleRooms.forEach((r) => {
    if (!groupIndex.has(r.facilityName)) {
      groupIndex.set(r.facilityName, []);
      facilityGroups.push([r.facilityName, groupIndex.get(r.facilityName)]);
    }
    groupIndex.get(r.facilityName).push(r);
  });

  const detailRoom = detailRoomId ? rooms.find((r) => r._id === detailRoomId) || null : null;
  const detailView = detailRoom ? buildRoomView(detailRoom, sessions) : null;

  // Recomputed every render (including every tick) so the alert interval
  // above always sees the latest overdue set via the ref.
  overdueIdsRef.current = rooms
    .filter((r) => {
      const v = buildRoomView(r, sessions);
      return v.occupancy && v.isPastEnd;
    })
    .map((r) => r._id);

  return (
    <div className="panel active" id="panel-monitor">
      <div className="d-flex align-items-center justify-content-between">
        <div className="rm-page-head">
          <span className="live-badge"><span className="dot"></span>Live</span>
          <span className="rm-page-sub">Real-time room status and session monitoring</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div className="view-toggle" role="group" aria-label="Switch view">
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
              onClick={() => changeViewMode('grid')}
            >
              <i className="ti ti-layout-grid"></i>Grid View
            </button>
            <button
              type="button"
              className={`view-toggle-btn${viewMode === 'table' ? ' active' : ''}`}
              onClick={() => changeViewMode('table')}
            >
              <i className="ti ti-list"></i>Table View
            </button>
          </div>
          {canManage && (
            <button className="btn-teal" onClick={() => setShowAddRoom(true)}>
              <i className="ti ti-building-plus"></i>New Room
            </button>
          )}
        </div>
      </div>

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
              <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--green)' }}></span>{'>'} {MONITOR_WARNING_MIN} min</div>
              <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--amber)' }}></span>≤ {MONITOR_WARNING_MIN} min</div>
              <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--red)' }}></span>≤ {MONITOR_CRITICAL_MIN} min</div>
              <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--muted)' }}></span>Available</div>
              <button
                type="button"
                className={`fac-chip${soundMuted ? '' : ' active'}`}
                onClick={toggleSoundMuted}
                title={soundMuted ? 'Unmute overdue alert sound' : 'Mute overdue alert sound'}
              >
                <i className={`ti ${soundMuted ? 'ti-bell-off' : 'ti-bell-ringing'}`}></i>{soundMuted ? 'Sound Off' : 'Sound On'}
              </button>
            </div>
          </div>

          {viewMode === 'grid' ? (
        <>
          {facilityGroups.map(([facilityName, facilityRooms]) => (
            <div className="rm-group" key={facilityName}>
              <div className="rm-group-head">
                <i className={`ti ${FACILITY_ICONS[facilityName] || FACILITY_ICON_DEFAULT} rm-group-ico`}></i>
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
                  <span className="rm-warning-pop"><i className="ti ti-alert-triangle"></i></span>
                )}
                <div className="rm-head">
                  <div>
                    <div className="rm-name">Room {r.roomNumber}</div>
                    {r.hasCustomName && <div className="rm-type">{r.roomName}</div>}
                  </div>
                  <div className="rm-head-right">
                    {occupancy && (isCritical || isPastEnd) && (
                      <span className="rm-ico ico-red"><i className="ti ti-alert-triangle"></i></span>
                    )}
                    <span className={`rm-status-pill status-${stateClass}`}><span className="dot"></span>{statusLabel}</span>
                  </div>
                </div>
                {occupancy ? (
                  <>
                    <div className="rm-timer-row">
                      <span className={`rm-ico ico-${(isPastEnd || isCritical) ? 'red' : isWarning ? 'amber' : 'green'}`}>
                        <i className={`ti ${(isCritical || isPastEnd) ? 'ti-alert-triangle' : 'ti-clock'}`}></i>
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
                        <i className="ti ti-user"></i>{occupancy.paymentStatus || 'Unpaid'}
                      </div>
                      <div className="rm-foot-price">₱{r.price}/hr</div>
                    </div>
                  </>
                ) : (
                  <div className="rm-empty">
                    <i className="ti ti-device-desktop"></i>
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
                      <i className="ti ti-player-play"></i>Start Session
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
        <div className="card card-flush rm-table-wrap">
          <table className="rm-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Remaining</th>
                <th>Payment</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRooms.map((r) => {
                const v = buildRoomView(r, sessions);
                const { occupancy, remaining, isPastEnd, isCritical, isWarning, stateClass, statusLabel } = v;

                return (
                  <tr key={r._id} className={v.blinkClass ? 'blink-expired' : ''}>
                    <td>
                      <div className="rm-name">Room {r.roomNumber}</div>
                      <div className="rm-type">{r.facilityName}{r.hasCustomName ? ` · ${r.roomName}` : ''}</div>
                    </td>
                    <td><span className={`rm-status-pill status-${stateClass}`}><span className="dot"></span>{statusLabel}</span></td>
                    <td>{occupancy ? formatStartTime(occupancy) : '—'}</td>
                    <td>{occupancy ? formatEndTime(occupancy) : '—'}</td>
                    <td>
                      <span className={`rm-timer${isWarning ? ' warn' : ''}${(isPastEnd || isCritical) ? ' expired' : ''}`}>
                        {occupancy && (isCritical || isPastEnd) && (
                          <i className="ti ti-alert-triangle rm-timer-warn-ico"></i>
                        )}
                        {occupancy ? formatTimeRemaining(remaining, isPastEnd) : '—'}
                      </span>
                    </td>
                    <td>
                      {occupancy ? (
                        <span className={`pay-pill pay-${(occupancy.paymentStatus || 'Unpaid').toLowerCase()}`}>{occupancy.paymentStatus || 'Unpaid'}</span>
                      ) : '—'}
                    </td>
                    <td>
                      <div className="rm-actions rm-actions--table">
                        {occupancy ? (
                          canManage ? (
                            <>
                              <button className="rm-btn" onClick={() => openExtendModal(occupancy, r)}><i className="ti ti-edit"></i>Extend</button>
                              <button className="rm-btn danger" onClick={() => endSession(occupancy._id, r._id)}><i className="ti ti-trash"></i>End</button>
                            </>
                          ) : (
                            <span className="rm-note">In use</span>
                          )
                        ) : r.status === 'Available' ? (
                          canManage ? (
                            <>
                              <button className="rm-btn primary" onClick={() => openStartSessionModal(r)}><i className="ti ti-player-play"></i>Start Session</button>
                              <button className="rm-btn" onClick={() => setEditRoomId(r._id)}><i className="ti ti-edit"></i>Edit</button>
                              <button className="rm-btn danger" onClick={() => deleteRoom(r._id)}><i className="ti ti-trash"></i>Delete</button>
                            </>
                          ) : (
                            <span className="rm-note">No permission</span>
                          )
                        ) : (
                          <span className="rm-note">{r.status}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
        onEndSession={() => {
          setDetailRoomId(null);
          endSession(detailView.occupancy._id, detailRoom._id);
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

// ─────────────────────────────────────────────────────────────────────────
// RoomDetailModal — opened by clicking a room card/row. Grid/table only show
// the compact summary (time left + payment); this shows everything else
// (status, room no., facility, payment method, start/end time). `view` is
// recomputed fresh from live `rooms`/`sessions` state each render (see
// detailView in Monitor), so the countdown here keeps ticking too.
// ─────────────────────────────────────────────────────────────────────────
function RoomDetailModal({ room, view, onClose, canManage, onExtend, onEndSession, onEdit, onDelete }) {
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
                <div className="rm-row"><span className="lbl">Payment Method</span><span className="val">{view.occupancy.paymentMethod || '—'}</span></div>
                <div className="rm-row">
                  <span className="lbl">Payment Status</span>
                  <span className={`pay-pill pay-${(view.occupancy.paymentStatus || 'Unpaid').toLowerCase()}`}>{view.occupancy.paymentStatus || 'Unpaid'}</span>
                </div>
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
                  <button className="rm-btn" onClick={onExtend}><i className="ti ti-edit"></i>Extend</button>
                  <button className="rm-btn danger" onClick={onEndSession}><i className="ti ti-trash"></i>End Session</button>
                </>
              )
            ) : room.status === 'Available' ? (
              canManage && (
                <>
                  <button className="rm-btn" onClick={onEdit}><i className="ti ti-edit"></i>Edit</button>
                  <button className="rm-btn danger" onClick={onDelete}><i className="ti ti-trash"></i>Delete Room</button>
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


// Facility and Room Name are both editable dropdowns (add new / delete
// option), stored client-side in localStorage — Room Monitoring doesn't
// depend on Settings. Room Name options are scoped per facility so e.g.
// Billiards and Karaoke each keep their own list.
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
  // Filters out null/undefined/blank — matters for rooms saved before the
  // facilityName/roomName split, which have neither field set yet.
  const clean = [...stored, ...seed].filter((v) => typeof v === 'string' && v.trim());
  return [...new Set(clean)].sort((a, b) => a.localeCompare(b));
}

function savePresets(key, options) {
  localStorage.setItem(key, JSON.stringify(options));
}

// One dropdown-with-add-new-and-delete control, reused for both Facility
// and Room Name fields below.
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
            <i className="ti ti-trash"></i>
          </button>
        )}
      </div>
      {addingNew && (
        <div className="field-row field-row--top-gap">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`New ${label.toLowerCase()}`} className="field-col" autoFocus />
          <button type="button" className="rm-btn primary" style={{ flex: '0 0 auto', padding: '7px 12px' }} onClick={handleAdd}>Add</button>
          <button type="button" className="rm-btn" style={{ flex: '0 0 auto', padding: '7px 10px' }} onClick={() => { setAddingNew(false); setInput(''); }} title="Cancel">
            <i className="ti ti-x"></i>
          </button>
        </div>
      )}
    </div>
  );
}

// Add/Edit Room form. `initialRoom` (present in edit mode) prefills every
// field; submitting always sends the full {facilityName, roomName,
// roomNumber, price} shape so the same handler works for create and update.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRoom]);

  // Room Name options refresh whenever the selected facility changes, scoped
  // to that facility's own existing room names.
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
    const trimmedPrice = price.trim();
    if (trimmedPrice && (Number.isNaN(Number(trimmedPrice)) || Number(trimmedPrice) < 0)) {
      alert('Rate must be a valid non-negative number.');
      return;
    }
    // Room No. must be unique within its room name — same number in two
    // different room names (even same facility) is fine, but not twice inside the same one.
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

// Extend uses a smaller absolute-duration preset set plus an "Add Time"
// control (hours/minutes only — no seconds) that adds on top of whatever
// duration is already showing, rather than replacing it.
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
  const [submitting, setSubmitting] = useState(false);
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [addHours, setAddHours] = useState('');
  const [addMinutes, setAddMinutes] = useState('');

  const isExtend = modal?.mode === 'extend';

  // Prefill on every open, matching each mode's source of truth. Start mode
  // begins empty — staff must explicitly enter a duration — while Extend
  // still pre-fills the session's real remaining time.
  useEffect(() => {
    if (!modal) return;

    setAddTimeOpen(false);
    setAddHours('');
    setAddMinutes('');

    if (modal.mode === 'extend' && modal.session) {
      const remainingMs = Math.max(0, sessionEnd(modal.session).getTime() - Date.now());
      setDurationFromHours(remainingMs > 0 ? remainingMs / 3600000 : 1 / 3600);
      setPaymentMethod(modal.session.paymentMethod || 'Cash');
      setPaymentStatus(modal.session.paymentStatus || 'Unpaid');
    } else {
      setHours('');
      setMinutes('');
      setSeconds('');
      setPaymentMethod('Cash');
      setPaymentStatus('Unpaid');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  function setDurationFromHours(totalHours) {
    const totalSeconds = Math.max(1, Math.min(24 * 3600, Math.round((totalHours || 0) * 3600)));
    setHours(String(Math.floor(totalSeconds / 3600)));
    setMinutes(String(Math.floor((totalSeconds % 3600) / 60)));
    setSeconds(String(totalSeconds % 60));
  }

  // Normalizes the H/M/S fields the instant any one of them changes, so what's
  // displayed always matches the real total duration.
  function handleHmsChange(field, rawValue) {
    const current = { hours: Number(hours) || 0, minutes: Number(minutes) || 0, seconds: Number(seconds) || 0 };
    current[field] = Math.max(0, Number(rawValue) || 0);
    const totalSeconds = Math.max(0, Math.min(24 * 3600, current.hours * 3600 + current.minutes * 60 + current.seconds));
    setHours(String(Math.floor(totalSeconds / 3600)));
    setMinutes(String(Math.floor((totalSeconds % 3600) / 60)));
    setSeconds(String(totalSeconds % 60));
  }

  // "Add Time" only collects hours/minutes, but adds on top of the current
  // total (which may still carry real leftover seconds from the prefilled
  // remaining time) — that precision isn't lost, it's just not editable here.
  function handleAddTime() {
    const deltaSeconds = (Math.max(0, Number(addHours) || 0) * 3600) + (Math.max(0, Number(addMinutes) || 0) * 60);
    if (!deltaSeconds) return;
    const currentSeconds = (Number(hours) || 0) * 3600 + (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
    const totalSeconds = Math.max(1, Math.min(24 * 3600, currentSeconds + deltaSeconds));
    setHours(String(Math.floor(totalSeconds / 3600)));
    setMinutes(String(Math.floor((totalSeconds % 3600) / 60)));
    setSeconds(String(totalSeconds % 60));
    setAddTimeOpen(false);
    setAddHours('');
    setAddMinutes('');
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
      alert('Duration must be at least 1 second.');
      return;
    }
    if (totalHours > 24) {
      alert('Duration cannot exceed 24 hours.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        mode: modal.mode,
        roomId: modal.fixedRoom._id,
        sessionId: modal.session?._id,
        totalHours,
        paymentMethod,
        paymentStatus,
      });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save this room monitoring session.');
    } finally {
      setSubmitting(false);
    }
  }

  const fixedRoomLabel = modal?.fixedRoom ? `${modal.fixedRoom.roomName} — Room No. ${modal.fixedRoom.roomNumber} (${modal.fixedRoom.facilityName})` : '';
  const fixedRoomRate = modal?.fixedRoom ? `₱${modal.fixedRoom.price}/hr` : '';
  // FEATURE_REQUESTS.md Priority 4 — Extend is a quick time-only popup: no
  // rate, no payment method (it keeps the session's existing paymentMethod,
  // prefilled above), just the duration. Room context moves into the title
  // instead of a separate label line.
  const title = isExtend ? `Extend Session — ${modal?.fixedRoom?.roomName || ''}` : 'Start Session';

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
            <label>Duration (Hours / Minutes / Seconds)</label>

            {isExtend && (
              <>
                <div className="aw-preset-row">
                  {EXTEND_PRESETS.map((p) => (
                    <button key={p.label} type="button" className="aw-preset-btn" onClick={() => setDurationFromHours(p.mins / 60)}>{p.label}</button>
                  ))}
                  <button type="button" className="aw-preset-btn aw-preset-btn--add" onClick={() => setAddTimeOpen((v) => !v)}>+ Add Time</button>
                </div>
                {addTimeOpen && (
                  <div className="aw-addtime-row">
                    <div className="field-col">
                      <input type="number" min="0" step="1" value={addHours} onChange={(e) => setAddHours(e.target.value)} placeholder="0" />
                      <div className="aw-unit-lbl">Hours</div>
                    </div>
                    <div className="field-col">
                      <input type="number" min="0" step="1" value={addMinutes} onChange={(e) => setAddMinutes(e.target.value)} placeholder="0" />
                      <div className="aw-unit-lbl">Minutes</div>
                    </div>
                    <button type="button" className="aw-addtime-btn" onClick={handleAddTime}>Add</button>
                  </div>
                )}
              </>
            )}

            <div className={`field-row${isExtend ? ' field-row--extend-gap' : ''}`}>
              <div className="field-col">
                <input type="number" min="0" step="1" value={hours} onChange={(e) => handleHmsChange('hours', e.target.value)} />
                <div className="aw-unit-lbl">Hours</div>
              </div>
              <div className="field-col">
                <input type="number" min="0" step="1" value={minutes} onChange={(e) => handleHmsChange('minutes', e.target.value)} />
                <div className="aw-unit-lbl">Minutes</div>
              </div>
              <div className="field-col">
                <input type="number" min="0" step="1" value={seconds} onChange={(e) => handleHmsChange('seconds', e.target.value)} />
                <div className="aw-unit-lbl">Seconds</div>
              </div>
            </div>

            {!isExtend && (
              <div className="aw-preset-row" style={{ marginTop: '9px' }}>
                {DURATION_PRESETS.map((p) => (
                  <button key={p.label} type="button" className="aw-preset-btn" onClick={() => setDurationFromHours(p.mins / 60)}>{p.label}</button>
                ))}
              </div>
            )}
          </div>

          {!isExtend && (
            <div className="mfield">
              <label>Payment Method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Maya">Maya</option>
              </select>
            </div>
          )}

          <div className="mfield">
            <label>Payment Status</label>
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