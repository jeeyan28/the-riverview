import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { roomsService } from '../../services/rooms';
import { roomSessionsService } from '../../services/roomSessions';


const MONITOR_WARNING_MS = 5 * 60 * 1000;  // timer turns yellow at ≤5 min
const MONITOR_CRITICAL_MS = 60 * 1000;     // timer turns red at ≤1 min

const BASE_STATUS_CLASS = { Available: 'available', Occupied: 'occupied', 'Under Maintenance': 'overdue', Inactive: 'vacant' };

function sessionStart(session) {
  return new Date(session.startTime);
}
function sessionEnd(session) {
  return new Date(sessionStart(session).getTime() + session.duration * 60 * 60 * 1000);
}
function formatStartTime(session) {
  return sessionStart(session).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatTimeRemaining(ms) {
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

function Monitor() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');
  const { confirm, confirmProps } = useConfirm();

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [, forceTick] = useState(0); // re-render every second so countdowns move

  // modal: null (closed) | { mode: 'start'|'extend', fixedRoom: room, session: session|null }
  // 'start'  — Available room's "Edit" button — starts a brand-new session
  // 'extend' — Occupied room's "Extend" button — re-anchors remaining time
  const [modal, setModal] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);

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
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([fetchRooms(), fetchMonitorSessions()]);
      if (!cancelled) setLoading(false);
    })();

    const tickHandle = setInterval(() => forceTick((n) => n + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(tickHandle);
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
        const updatedRoom = await roomsService.updateStatus(roomId, 'Available');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? { ...r, ...updatedRoom } : r)));
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

  async function handleModalSubmit({ mode, roomId, sessionId, totalHours, paymentMethod }) {
    if (!guardPermission('room:manage')) return;

    if (mode === 'extend') {
      // Re-anchor to right now with the freshly chosen remaining duration —
      // the simplest way to let staff set an exact "time left".
      await roomSessionsService.update(sessionId, {
        startTime: new Date().toISOString(),
        duration: totalHours,
        paymentMethod,
      });
    } else {
      // mode === 'start'
      await roomSessionsService.create({ roomId, duration: totalHours, paymentMethod });

      // Reflect the room as occupied right away rather than waiting for a refetch.
      try {
        const updatedRoom = await roomsService.updateStatus(roomId, 'Occupied');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? { ...r, ...updatedRoom } : r)));
      } catch {
        /* soft-fail — matches original's `if (roomRes.ok)` check */
      }
    }

    setModal(null);
    await fetchMonitorSessions();
  }

  // FEATURE_REQUESTS.md Priority 0 — create a Room from within Room
  // Monitoring itself. Name, Room No., and Rate (price) are collected;
  // status/capacity keep their existing defaults and can be adjusted later
  // via Settings.
  async function handleAddRoom({ name, roomNumber, price }) {
    if (!guardPermission('room:manage')) return;
    await roomsService.create({ name, roomNumber, price });
    await fetchRooms();
  }

  // "Delete" beside an Available room's "Edit" button — removes the Room
  // itself (DELETE /api/rooms/:id). Only offered while Available, since an
  // Occupied room has no Edit button to sit beside in the first place.
  async function deleteRoom(roomId) {
    if (!guardPermission('room:manage')) return;
    if (!(await confirm('Delete this room permanently? This cannot be undone.', { confirmText: 'Delete' }))) return;
    try {
      await roomsService.remove(roomId);
      setRooms((prev) => prev.filter((r) => r._id !== roomId));
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not delete this room.');
    }
  }

  return (
    <div className="panel active" id="panel-monitor">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Live monitoring — updates every second</span>
        {canManage && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-teal" onClick={() => setShowAddRoom(true)}>
              <i className="ti ti-building-plus"></i>New Room
            </button>
          </div>
        )}
      </div>

      <div className="room-grid" id="monitor-room-grid">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', gridColumn: '1/-1' }}>Loading rooms…</div>
        ) : rooms.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0', gridColumn: '1/-1' }}>
            No rooms yet — click New Room above to add one.
          </div>
        ) : (
          rooms.map((r) => {
            const occupancy = findRoomOccupancy(r._id, sessions);
            const remaining = occupancy ? sessionEnd(occupancy).getTime() - Date.now() : null;

            // Reaching 0 no longer ends the session automatically — the card
            // turns red and blinks (see blinkClass) and keeps counting until
            // staff steps in.
            const isPastEnd = occupancy && remaining <= 0;
            const isCritical = occupancy && !isPastEnd && remaining <= MONITOR_CRITICAL_MS;
            const isWarning = occupancy && !isPastEnd && !isCritical && remaining <= MONITOR_WARNING_MS;

            const stateClass = (isPastEnd || isCritical) ? 'expired' : isWarning ? 'warning' : BASE_STATUS_CLASS[r.status] || 'vacant';
            // Past-end (remaining <= 0) blinks in addition to being red, so it
            // stands out from the merely-critical (≤1 min, still counting) state.
            const blinkClass = isPastEnd ? ' blink-expired' : '';
            const icoClass = r.status === 'Occupied' ? 'ico-teal' : r.status === 'Under Maintenance' ? 'ico-amber' : r.status === 'Available' ? 'ico-green' : 'ico-blue';
            const icoGlyph = r.status === 'Occupied' ? 'ti-circle-dashed' : r.status === 'Under Maintenance' ? 'ti-alert-triangle' : 'ti-circle-off';

            const barPercent = occupancy
              ? Math.max(0, Math.min(100, (remaining / (occupancy.duration * 60 * 60 * 1000)) * 100))
              : r.status === 'Occupied' ? 60 : 0;
            const barColor = (isPastEnd || isCritical) ? 'var(--red)' : isWarning ? 'var(--amber)' : occupancy || r.status === 'Occupied' ? 'var(--teal)' : 'var(--blue)';

            return (
              <div className={`rm ${stateClass}${blinkClass}`} key={r._id}>
                <div className="rm-head">
                  <div>
                    <div className="rm-name">{r.name}</div>
                    <div className="rm-type">{r.roomNumber}</div>
                  </div>
                  <div className={`rm-ico ${icoClass}`}><i className={`ti ${icoGlyph}`}></i></div>
                </div>
                <div className="rm-rows">
                  <div className="rm-row">
                    <span className="lbl">Status</span>
                    <span className={`rm-status-pill status-${stateClass}`}><span className="dot"></span>{r.status}</span>
                  </div>
                  {occupancy ? (
                    <>
                      <div className="rm-row"><span className="lbl">Room No.</span><span className="val">{r.roomNumber}</span></div>
                      <div className="rm-row"><span className="lbl">Payment Method</span><span className="val">{occupancy.paymentMethod || '—'}</span></div>
                      <div className="rm-row"><span className="lbl">Start Time</span><span className="val">{formatStartTime(occupancy)}</span></div>
                      <div className="rm-row">
                        <span className="lbl">Time Left</span>
                        <span className={`val rm-timer${isWarning ? ' warn' : ''}${(isPastEnd || isCritical) ? ' expired' : ''}`}>
                          {formatTimeRemaining(remaining)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="rm-row"><span className="lbl">Rate</span><span className="val">₱{r.price}/hr</span></div>
                  )}
                </div>
                {(isWarning || isCritical) && (
                  <div className="rm-warn-badge"><i className="ti ti-alert-triangle"></i>Ending soon</div>
                )}
                <div className="rm-bar-wrap">
                  <div className="rm-bar" style={{ width: `${barPercent}%`, background: barColor }}></div>
                </div>
                <div className="rm-actions">
                  {occupancy ? (
                    canManage ? (
                      <>
                        <button className="rm-btn" onClick={() => openExtendModal(occupancy, r)}><i className="ti ti-edit"></i>Extend</button>
                        <button className="rm-btn danger" onClick={() => endSession(occupancy._id, r._id)}><i className="ti ti-trash"></i>End Session</button>
                      </>
                    ) : (
                      <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>In use</span>
                    )
                  ) : r.status === 'Available' ? (
                    canManage ? (
                      <>
                        <button className="rm-btn primary" onClick={() => openStartSessionModal(r)}><i className="ti ti-edit"></i>Edit</button>
                        <button className="rm-btn danger" onClick={() => deleteRoom(r._id)}><i className="ti ti-trash"></i>Delete Room</button>
                      </>
                    ) : (
                      <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>No permission</span>
                    )
                  ) : (
                    <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{r.status}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <SessionModal modal={modal} onClose={() => setModal(null)} onSubmit={handleModalSubmit} />
      <AddRoomModal open={showAddRoom} onClose={() => setShowAddRoom(false)} onSubmit={handleAddRoom} existingNames={[...new Set(rooms.map((r) => r.name))]} />

      <ConfirmDialog {...confirmProps} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AddRoomModal — FEATURE_REQUESTS.md Priority 0: create a new Room (Name
// + Room No.) from within Room Monitoring. Only collects the two fields
// Room.js actually requires; everything else keeps its schema default.
//
// FEATURE_REQUESTS.md Priority 3 — Name is an editable dropdown (add new /
// delete existing option). Options are stored client-side in localStorage
// (seeded from existing room names) rather than via Settings, per the
// "Room Monitoring must not depend on Settings" architecture decision.
// ─────────────────────────────────────────────────────────────────────────
const ROOM_NAME_PRESETS_KEY = 'roomMonitor.roomNamePresets';

function loadRoomNamePresets(existingNames) {
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(ROOM_NAME_PRESETS_KEY) || '[]');
    if (!Array.isArray(stored)) stored = [];
  } catch {
    stored = [];
  }
  return [...new Set([...stored, ...existingNames])].sort((a, b) => a.localeCompare(b));
}

function saveRoomNamePresets(options) {
  localStorage.setItem(ROOM_NAME_PRESETS_KEY, JSON.stringify(options));
}

function AddRoomModal({ open, onClose, onSubmit, existingNames }) {
  const [name, setName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [price, setPrice] = useState('');
  const [nameOptions, setNameOptions] = useState([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newOptionInput, setNewOptionInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setRoomNumber('');
      setPrice('');
      setAddingNew(false);
      setNewOptionInput('');
      setNameOptions(loadRoomNamePresets(existingNames));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSelectName(value) {
    if (value === '__add_new__') {
      setAddingNew(true);
      return;
    }
    setAddingNew(false);
    setName(value);
  }

  function handleAddOption() {
    const trimmed = newOptionInput.trim();
    if (!trimmed) return;
    setNameOptions((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed].sort((a, b) => a.localeCompare(b));
      saveRoomNamePresets(next);
      return next;
    });
    setName(trimmed);
    setAddingNew(false);
    setNewOptionInput('');
  }

  function handleDeleteOption(option) {
    if (!window.confirm(`Remove "${option}" from the Name list? This only affects the dropdown, not any existing room.`)) return;
    setNameOptions((prev) => {
      const next = prev.filter((o) => o !== option);
      saveRoomNamePresets(next);
      return next;
    });
    if (name === option) setName('');
  }

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedRoomNumber = roomNumber.trim();
    if (!trimmedName || !trimmedRoomNumber) {
      alert('Please enter both Room No. and Name.');
      return;
    }
    const trimmedPrice = price.trim();
    if (trimmedPrice && (Number.isNaN(Number(trimmedPrice)) || Number(trimmedPrice) < 0)) {
      alert('Rate must be a valid non-negative number.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: trimmedName, roomNumber: trimmedRoomNumber, price: trimmedPrice ? Number(trimmedPrice) : 0 });
      onClose();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not create this room.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Room — Room Monitoring">
      <div className="mfield">
        <label>Name</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={name} onChange={(e) => handleSelectName(e.target.value)} style={{ flex: 1 }}>
            <option value="">Select a name…</option>
            {nameOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
            <option value="__add_new__">+ Add new option…</option>
          </select>
          {name && nameOptions.includes(name) && (
            <button type="button" className="rm-btn danger" style={{ flex: '0 0 auto', padding: '7px 10px' }} onClick={() => handleDeleteOption(name)} title={`Remove "${name}" from list`}>
              <i className="ti ti-trash"></i>
            </button>
          )}
        </div>
        {addingNew && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <input
              type="text"
              value={newOptionInput}
              onChange={(e) => setNewOptionInput(e.target.value)}
              placeholder="New room name"
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="button" className="rm-btn primary" style={{ flex: '0 0 auto', padding: '7px 12px' }} onClick={handleAddOption}>Add</button>
          </div>
        )}
      </div>
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
          {submitting ? 'Adding…' : 'Add Room'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SessionModal — covers Start and Extend. Always targets a single
// fixedRoom — there is no room or category picker, since those are locked
// after room creation.
// ─────────────────────────────────────────────────────────────────────────
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
    } else {
      setHours('');
      setMinutes('');
      setSeconds('');
      setPaymentMethod('Cash');
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
      });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Could not save this room monitoring session.');
    } finally {
      setSubmitting(false);
    }
  }

  const fixedRoomLabel = modal?.fixedRoom ? `Room No. ${modal.fixedRoom.roomNumber} — ${modal.fixedRoom.name}` : '';
  const fixedRoomRate = modal?.fixedRoom ? `₱${modal.fixedRoom.price}/hr` : '';
  // FEATURE_REQUESTS.md Priority 4 — Extend is a quick time-only popup: no
  // rate, no payment method (it keeps the session's existing paymentMethod,
  // prefilled above), just the duration. Room context moves into the title
  // instead of a separate label line.
  const title = isExtend ? `Extend Session — ${modal?.fixedRoom?.name || ''}` : 'Start Session';

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
                    <div style={{ flex: 1 }}>
                      <input type="number" min="0" step="1" value={addHours} onChange={(e) => setAddHours(e.target.value)} placeholder="0" />
                      <div className="aw-unit-lbl">Hours</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <input type="number" min="0" step="1" value={addMinutes} onChange={(e) => setAddMinutes(e.target.value)} placeholder="0" />
                      <div className="aw-unit-lbl">Minutes</div>
                    </div>
                    <button type="button" className="aw-addtime-btn" onClick={handleAddTime}>Add</button>
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: isExtend ? '10px' : 0 }}>
              <div style={{ flex: 1 }}>
                <input type="number" min="0" step="1" value={hours} onChange={(e) => handleHmsChange('hours', e.target.value)} />
                <div className="aw-unit-lbl">Hours</div>
              </div>
              <div style={{ flex: 1 }}>
                <input type="number" min="0" step="1" value={minutes} onChange={(e) => handleHmsChange('minutes', e.target.value)} />
                <div className="aw-unit-lbl">Minutes</div>
              </div>
              <div style={{ flex: 1 }}>
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