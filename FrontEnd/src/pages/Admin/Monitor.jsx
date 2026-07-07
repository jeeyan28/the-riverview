import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { roomsService } from '../../services/rooms';
import { bookingsService } from '../../services/bookings';

// ─────────────────────────────────────────────────────────────────────────
// Admin / Room Monitor — migrated from admin.html's <div id="panel-monitor">
// + admin.js's "ROOM MONITOR PANEL (Tier 2)" section (fetchMonitorBookings,
// renderRoomMonitor, tickRoomMonitor, paintRoomMonitorGrid,
// roomMonitorCardHtml, autoExpireRoom, deleteWalkInSession, ensureAssignModal,
// openAssignModal, openManualMonitorModal, openEditMonitorModal,
// submitWalkInAssignment). Part of Phase 8 (Page Migration).
//
// Rewritten this session to match admin.js's current Room Monitoring design
// (the previous port matched an older version of this feature — see
// MIGRATION_PROGRESS.md). Room Monitoring no longer asks for a typed-in
// Guest Name at all: a room is identified purely by its Room No., which is
// either fixed (Assign/Edit) or chosen from a dropdown (Manual Add).
// Duration is entered as separate Hours / Minutes / Seconds fields (plus
// quick-preset buttons) so staff can manage a session down to the second.
//
// Behavior preserved 1:1:
//   - A room's remaining time is derived purely from its live walk-in
//     booking's date + timeIn + duration — never a separate client-only
//     timer state — so it's still correct after a refresh.
//   - A 1-second ticker (setInterval) repaints countdowns (HH:MM:SS,
//     precise to the second) and, the first time any booking's remaining
//     time hits zero, fires exactly one PUT /api/rooms/:id
//     (status: Available) for it — tracked with a Set of already-handled
//     booking ids so it can't double-fire while the request is in flight,
//     and un-marked again on failure so the very next tick retries instead
//     of silently giving up.
//   - "Assign Walk-in" (a specific vacant room's card) and "Manual Add"
//     (panel-level button, room chosen from a dropdown of Available rooms)
//     both create a walk-in booking via the same POST /api/bookings
//     admin/staff already use for Manual Booking (date/time defaulted to
//     right now), then PUT the room to Occupied. guestName is still
//     required by the schema, so it's auto-filled from the room's own
//     number, same as the original.
//   - "Edit" (an occupied room's card) re-anchors the session to right now
//     and applies the freshly-chosen duration/payment method via a single
//     PUT /api/bookings/:id — the simplest way to let staff set an exact
//     "time left".
//   - "Delete" (an occupied room's card) marks that booking Done and PUTs
//     the room back to Available immediately, instead of waiting for the
//     timer.
//   - All endpoints (GET /api/bookings?status=Active, PUT /api/rooms/:id,
//     POST/PUT /api/bookings) are unchanged.
//
// Adapted only because this is now its own routed page instead of an
// always-mounted panel: the 1s ticker starts on mount and is cleaned up in
// this component's own effect cleanup (equivalent to the original's
// stopRoomMonitorTicker(), which used to fire from switchPanel() whenever
// you navigated to a different panel — React Router unmounting this page
// on navigation now does that job instead).
//
// The original's Assign/Edit modal didn't exist in admin.html's markup at
// all — admin.js built it once into document.body on first use
// (ensureAssignModal()), and one modal covers all three entry points
// (Assign Walk-in / Manual Add / Edit). Here it's just ordinary JSX using
// the shared <Modal/>, since React doesn't need the manual DOM-injection
// trick, but it's still the one component covering all three modes.
//
// Permission gating — PHASE 12. Direct port of roomMonitorCardHtml()'s
// canManageRoom = hasAdminPermission('room:manage'): occupied rooms without
// it show "In use" instead of Edit/Delete, Available rooms show
// "No permission" instead of Assign Walk-in (exact same placeholder text
// pairing as the original). autoExpireRoom(), deleteWalkInSession(), and
// the modal's submit path each also re-check room:manage themselves,
// matching the originals' own defense-in-depth (the buttons are already
// hidden, but autoExpireRoom() in particular fires from the ticker, not a
// click).
//
// deleteWalkInSession now uses the shared <ConfirmDialog/> (via
// useConfirm()) instead of native window.confirm() — ports the original's
// UIModal.confirm() styling/behavior. Same fix applied across Bookings.jsx
// and Users.jsx in the same pass; see components/ConfirmDialog.jsx.
// ─────────────────────────────────────────────────────────────────────────

const MONITOR_WARNING_MS = 5 * 60 * 1000; // "almost over" — 5 minutes left

const BASE_STATUS_CLASS = { Available: 'vacant', Occupied: 'occupied', 'Under Maintenance': 'overdue', Inactive: 'vacant' };

function bookingStart(booking) {
  const [h, m] = String(booking.timeIn).split(':').map(Number);
  const start = new Date(booking.date + 'T00:00:00');
  start.setHours(h || 0, m || 0, 0, 0);
  return start;
}
function bookingEnd(booking) {
  return new Date(bookingStart(booking).getTime() + booking.duration * 60 * 60 * 1000);
}
// Precise HH:MM:SS countdown, ticking every second — direct port of
// formatTimeRemaining() in admin.js. Expiration itself is signaled by the
// "expired" state class + "Time's up" badge on the card, not by this string.
function formatTimeRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function activeWalkInBookings(bookings) {
  return (bookings || []).filter((b) => b.source === 'walk-in' && b.status === 'Active');
}
function findRoomOccupancy(roomId, walkIns) {
  const matches = walkIns.filter((b) => String(b.room?._id || b.room) === String(roomId));
  if (!matches.length) return null;
  return matches.reduce((latest, b) => (!latest || bookingEnd(b) > bookingEnd(latest) ? b : latest), null);
}
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Monitor() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');
  const { confirm, confirmProps } = useConfirm();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [walkIns, setWalkIns] = useState([]);
  const [, forceTick] = useState(0); // re-render every second so countdowns move without re-deriving state

  const expiredHandled = useRef(new Set());
  const roomsRef = useRef(rooms);
  const walkInsRef = useRef(walkIns);
  roomsRef.current = rooms;
  walkInsRef.current = walkIns;

  // modal: null (closed) | { mode: 'add'|'edit', fixedRoom: room|null, booking: booking|null }
  // fixedRoom set + mode 'add'  → "Assign Walk-in" on a specific vacant room card
  // fixedRoom null + mode 'add' → "Manual Add" — room chosen from a dropdown
  // fixedRoom set + mode 'edit' → "Edit" on an occupied room card
  const [modal, setModal] = useState(null);

  async function fetchRooms() {
    try {
      const data = await roomsService.list();
      setRooms(Array.isArray(data) ? data : []);
      return data;
    } catch (err) {
      console.error(err);
      setRooms([]);
      return [];
    }
  }

  async function fetchMonitorBookings() {
    try {
      const data = await bookingsService.listActive();
      const filtered = activeWalkInBookings(data);
      setWalkIns(filtered);
      return filtered;
    } catch (err) {
      console.error(err);
      setWalkIns([]);
      return [];
    }
  }

  // Initial load + start the 1s ticker. Cleaned up on unmount — this is
  // this page's equivalent of the original's stopRoomMonitorTicker(),
  // which used to be called manually from switchPanel() on navigation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([fetchRooms(), fetchMonitorBookings()]);
      if (!cancelled) setLoading(false);
    })();

    const tickHandle = setInterval(async () => {
      // Check for newly-expired sessions and auto-reset their room, exactly
      // as the original's tickRoomMonitor() did.
      for (const b of walkInsRef.current) {
        if (expiredHandled.current.has(b._id)) continue;
        if (bookingEnd(b).getTime() - Date.now() <= 0) {
          expiredHandled.current.add(b._id);
          await autoExpireRoom(b);
        }
      }
      forceTick((n) => n + 1); // repaint countdowns
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(tickHandle);
    };
  }, []);

  async function autoExpireRoom(booking) {
    if (!hasPermission('room:manage')) return;
    const roomId = booking.room?._id || booking.room;
    const room = roomsRef.current.find((rm) => rm._id === roomId);
    if (!room || room.status === 'Available') return;

    try {
      const updated = await roomsService.updateStatus(roomId, 'Available');
      setRooms((prev) => prev.map((r) => (r._id === roomId ? { ...r, ...updated } : r)));
    } catch (err) {
      console.error(err);
      expiredHandled.current.delete(booking._id); // let the next tick try again
    }
  }

  // "Delete" on an occupied room card — end the session early instead of
  // waiting for the timer to run out on its own.
  async function deleteWalkInSession(bookingId, roomId) {
    if (!guardPermission('room:manage')) return;
    if (!(await confirm('Remove this room from monitoring now? The room will be marked Available.', { confirmText: 'Remove' }))) return;
    try {
      await bookingsService.updateStatus(bookingId, 'Done');

      // Soft-fail on purpose, matching the original's `if (roomRes.ok)`
      // check: a failed room reset here doesn't abort ending the session
      // (the booking is already marked Done above) — it just means the
      // room card won't repaint as Available until the next successful
      // update.
      try {
        const updatedRoom = await roomsService.updateStatus(roomId, 'Available');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? { ...r, ...updatedRoom } : r)));
      } catch {
        /* soft-fail — see comment above */
      }

      expiredHandled.current.add(bookingId); // it's over — the ticker shouldn't touch it again
      await fetchMonitorBookings();
    } catch (err) {
      console.error(err);
      alert('Could not end this session.');
    }
  }

  // Direct ports of the three entry points' guards — the buttons that call
  // these are already hidden without room:manage (see the room-card render
  // below), but the originals guarded the functions themselves too.
  function openAssignModal(room) {
    if (!guardPermission('room:manage')) return;
    setModal({ mode: 'add', fixedRoom: room, booking: null });
  }
  function openManualMonitorModal() {
    if (!guardPermission('room:manage')) return;
    setModal({ mode: 'add', fixedRoom: null, booking: null });
  }
  function openEditMonitorModal(booking, room) {
    if (!guardPermission('room:manage')) return;
    setModal({ mode: 'edit', fixedRoom: room, booking });
  }

  async function handleModalSubmit({ mode, roomId, bookingId, totalHours, paymentMethod }) {
    if (!guardPermission('room:manage')) return;

    if (mode === 'edit') {
      // Re-anchor the session to right now and give it the freshly chosen
      // remaining duration — the simplest way to let staff set an exact
      // "time left" via hours/minutes/seconds.
      await bookingsService.update(bookingId, {
        date: todayDateStr(),
        timeIn: nowTimeStr(),
        duration: totalHours,
        paymentMethod,
      });
    } else {
      const room = rooms.find((r) => r._id === roomId);
      // Admin/staff sessions hitting POST /bookings automatically get
      // source: "walk-in", status: "Active", paymentStatus: "Paid" — see
      // bookingRoutes.js — so we don't send (and couldn't override) those.
      // guestName is still required by the schema, so it's auto-filled
      // from the room's own number — Room Monitoring identifies rooms,
      // not guests.
      await bookingsService.create({
        guestName: `Room ${room ? room.roomNumber : ''}`.trim() || 'Room Monitoring',
        roomId,
        date: todayDateStr(),
        timeIn: nowTimeStr(),
        duration: totalHours,
        paymentMethod,
      });

      // Reflect the room as occupied right away rather than waiting for a refetch.
      try {
        const updatedRoom = await roomsService.updateStatus(roomId, 'Occupied');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? { ...r, ...updatedRoom } : r)));
      } catch {
        /* soft-fail — matches original's `if (roomRes.ok)` check */
      }
    }

    setModal(null);
    await fetchMonitorBookings();
  }

  return (
    <div className="panel active" id="panel-monitor">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Live monitoring — updates every second</span>
        {canManage && (
          <button
            onClick={openManualMonitorModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', background: 'rgba(0,201,167,.1)', border: '1px solid rgba(0,201,167,.3)', borderRadius: '9px', fontSize: '.78rem', color: 'var(--teal)', cursor: 'pointer', fontFamily: "'Inter',sans-serif" }}
          >
            <i className="ti ti-plus"></i>Manual Add
          </button>
        )}
      </div>

      <div className="room-grid" id="monitor-room-grid">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', gridColumn: '1/-1' }}>Loading rooms…</div>
        ) : rooms.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', gridColumn: '1/-1' }}>
            No rooms yet — add facilities in Settings.
          </div>
        ) : (
          rooms.map((r) => {
            const occupancy = findRoomOccupancy(r._id, walkIns);
            const remaining = occupancy ? bookingEnd(occupancy).getTime() - Date.now() : null;
            const isExpired = occupancy && remaining <= 0;
            const isWarning = occupancy && !isExpired && remaining <= MONITOR_WARNING_MS;

            // "expired" is its own state (distinct from the static "Under
            // Maintenance" -> 'overdue' mapping below) so a truly timed-out
            // session can blink red without also making every
            // maintenance-flagged room blink.
            const stateClass = isExpired ? 'expired' : isWarning ? 'warning' : BASE_STATUS_CLASS[r.status] || 'vacant';
            const icoClass = r.status === 'Occupied' ? 'ico-teal' : r.status === 'Under Maintenance' ? 'ico-amber' : 'ico-blue';
            const icoGlyph = r.status === 'Occupied' ? 'ti-circle-dashed' : r.status === 'Under Maintenance' ? 'ti-alert-triangle' : 'ti-circle-off';

            const barPercent = occupancy
              ? Math.max(0, Math.min(100, (remaining / (occupancy.duration * 60 * 60 * 1000)) * 100))
              : r.status === 'Occupied' ? 60 : 0;
            const barColor = isExpired ? 'var(--red)' : isWarning ? 'var(--amber)' : occupancy || r.status === 'Occupied' ? 'var(--teal)' : '#378ADD';

            return (
              <div className={`rm ${stateClass}`} key={r._id}>
                <div className="rm-head">
                  <div>
                    <div className="rm-name">{r.name}</div>
                    <div className="rm-type">{r.roomNumber}</div>
                  </div>
                  <div className={`rm-ico ${icoClass}`}><i className={`ti ${icoGlyph}`}></i></div>
                </div>
                <div className="rm-rows">
                  <div className="rm-row"><span className="lbl">Status</span><span className="val">{r.status}</span></div>
                  {occupancy ? (
                    <>
                      {/* "Room No." replaces the old "Guest" row — Room Monitoring
                          tracks rooms, not guest identities. */}
                      <div className="rm-row"><span className="lbl">Room No.</span><span className="val">{r.roomNumber}</span></div>
                      <div className="rm-row">
                        <span className="lbl">Time Left</span>
                        <span className={`val rm-timer${isWarning ? ' warn' : ''}${isExpired ? ' expired' : ''}`}>
                          {formatTimeRemaining(remaining)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="rm-row"><span className="lbl">Rate</span><span className="val">₱{r.price}/hr</span></div>
                  )}
                </div>
                {isExpired ? (
                  <div className="rm-expired-badge"><i className="ti ti-alarm"></i>Time's up</div>
                ) : isWarning ? (
                  <div className="rm-warn-badge"><i className="ti ti-alert-triangle"></i>Ending soon</div>
                ) : null}
                <div className="rm-bar-wrap">
                  <div className="rm-bar" style={{ width: `${barPercent}%`, background: barColor }}></div>
                </div>
                <div className="rm-actions">
                  {occupancy ? (
                    canManage ? (
                      <>
                        <button className="rm-btn" onClick={() => openEditMonitorModal(occupancy, r)}><i className="ti ti-edit"></i>Edit</button>
                        <button className="rm-btn danger" onClick={() => deleteWalkInSession(occupancy._id, r._id)}><i className="ti ti-trash"></i>Delete</button>
                      </>
                    ) : (
                      <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>In use</span>
                    )
                  ) : r.status === 'Available' ? (
                    canManage ? (
                      <button className="rm-btn primary" onClick={() => openAssignModal(r)}><i className="ti ti-plus"></i>Assign Walk-in</button>
                    ) : (
                      <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>No permission</span>
                    )
                  ) : (
                    <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{r.status}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <AssignWalkInModal modal={modal} rooms={rooms} onClose={() => setModal(null)} onSubmit={handleModalSubmit} />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AssignWalkInModal — admin.html shipped no markup for this at all; the
// original built it once into document.body on first use
// (ensureAssignModal()), and one modal covers all three entry points
// (Assign Walk-in / Manual Add / Edit). Here it's ordinary JSX using the
// shared <Modal/>, same .mfield/.modal-actions conventions as Bookings.jsx.
// ─────────────────────────────────────────────────────────────────────────
const DURATION_PRESETS = [
  { label: '15m', mins: 15 },
  { label: '30m', mins: 30 },
  { label: '1h', mins: 60 },
  { label: '2h', mins: 120 },
  { label: '3h', mins: 180 },
];

function AssignWalkInModal({ modal, rooms, onClose, onSubmit }) {
  const [roomId, setRoomId] = useState('');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [seconds, setSeconds] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [submitting, setSubmitting] = useState(false);

  const isEdit = modal?.mode === 'edit';
  const isManual = !!modal && modal.mode === 'add' && !modal.fixedRoom;
  const availableRooms = rooms.filter((r) => r.status === 'Available');

  // Prefill exactly as the original's openAssignModal() / openManualMonitorModal() /
  // openEditMonitorModal() did, each time the modal is opened for a new target.
  useEffect(() => {
    if (!modal) return;

    if (modal.fixedRoom) setRoomId(modal.fixedRoom._id);
    else setRoomId(availableRooms[0]?._id || '');

    if (modal.mode === 'edit' && modal.booking) {
      const remainingMs = Math.max(0, bookingEnd(modal.booking).getTime() - Date.now());
      setDurationFromHours(remainingMs > 0 ? remainingMs / 3600000 : 1 / 3600);
      setPaymentMethod(modal.booking.paymentMethod || 'Cash');
    } else {
      setDurationFromHours(1);
      setPaymentMethod('Cash');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal]);

  function setDurationFromHours(totalHours) {
    const totalSeconds = Math.max(1, Math.round((totalHours || 0) * 3600));
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
    if (!roomId) {
      alert('Please choose a Room No.');
      return;
    }
    const totalHours = collectDurationHours();
    if (!totalHours || totalHours <= 0) {
      alert('Please set a duration greater than zero.');
      return;
    }
    if (totalHours > 24) {
      alert('Duration cannot exceed 24 hours.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ mode: modal.mode, roomId, bookingId: modal.booking?._id, totalHours, paymentMethod });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save this room monitoring session.');
    } finally {
      setSubmitting(false);
    }
  }

  const fixedRoomLabel = modal?.fixedRoom ? `Room No. ${modal.fixedRoom.roomNumber} — ${modal.fixedRoom.name}` : '';

  return (
    <Modal open={!!modal} onClose={onClose} title={isEdit ? 'Edit Room Monitoring' : isManual ? 'Manual Add — Room Monitoring' : 'Assign Walk-in'}>
      {modal && (
        <>
          {isManual ? (
            <div className="mfield">
              <label>Room No.</label>
              <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {availableRooms.length ? (
                  availableRooms.map((r) => (
                    <option key={r._id} value={r._id}>{r.roomNumber} — {r.name}</option>
                  ))
                ) : (
                  <option value="">No available rooms</option>
                )}
              </select>
            </div>
          ) : (
            <p style={{ margin: '-10px 0 16px', fontSize: '.78rem', color: 'var(--muted)' }}>{fixedRoomLabel}</p>
          )}

          <div className="mfield">
            <label>Duration (Hours / Minutes / Seconds)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <input type="number" min="0" max="24" step="1" value={hours} onChange={(e) => setHours(e.target.value)} />
                <div className="aw-unit-lbl">Hours</div>
              </div>
              <div style={{ flex: 1 }}>
                <input type="number" min="0" max="59" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                <div className="aw-unit-lbl">Minutes</div>
              </div>
              <div style={{ flex: 1 }}>
                <input type="number" min="0" max="59" step="1" value={seconds} onChange={(e) => setSeconds(e.target.value)} />
                <div className="aw-unit-lbl">Seconds</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '9px', flexWrap: 'wrap' }}>
              {DURATION_PRESETS.map((p) => (
                <button key={p.label} type="button" className="aw-preset-btn" onClick={() => setDurationFromHours(p.mins / 60)}>{p.label}</button>
              ))}
            </div>
          </div>

          <div className="mfield">
            <label>Payment Method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="Cash">Cash</option>
              <option value="GCash">GCash</option>
              <option value="Maya">Maya</option>
            </select>
          </div>

          <div className="modal-actions">
            <button className="btn-cancel" onClick={onClose}>Cancel</button>
            <button className="btn-confirm" disabled={submitting} onClick={handleSubmit}>
              {submitting ? (isEdit ? 'Saving…' : 'Starting…') : (isEdit ? 'Save Changes' : 'Start Session')}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default Monitor;