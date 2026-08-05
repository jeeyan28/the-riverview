import '../../styles/admin/monitor.css';
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuth } from '../../context/AuthContext';
import { monitorRoomsService, roomSessionsService } from '../../services/monitoring';
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

function Monitor() {
  const { hasPermission, guardPermission } = useAuth();
  const canManage = hasPermission('room:manage');
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

  function selectFacilityFilter(name) {
    setFacilityFilter(name);
    setRoomNameFilter('All');
  }

  async function endSession(sessionId, roomId) {
    if (!guardPermission('room:manage')) return;
    if (!(await confirm('End this session now? The room will be marked Available.', { confirmText: 'End Session' }))) return;
    try {
      await roomSessionsService.finish(sessionId);

      try {
        const updatedRoom = await monitorRoomsService.updateStatus(roomId, 'Available');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? normalizeRoom({ ...r, ...updatedRoom }) : r)));
      } catch {}

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
      await roomSessionsService.update(sessionId, {
        startTime: new Date().toISOString(),
        duration: totalHours,
        paymentMethod,
        paymentStatus,
      });
    } else {
      await roomSessionsService.create({ roomId, duration: totalHours, paymentMethod, paymentStatus });

      try {
        const updatedRoom = await monitorRoomsService.updateStatus(roomId, 'Occupied');
        setRooms((prev) => prev.map((r) => (r._id === roomId ? normalizeRoom({ ...r, ...updatedRoom }) : r)));
      } catch {}
    }

    setModal(null);
    await fetchMonitorSessions();
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
                        <i className="bi bi-person"></i>{occupancy.paymentStatus || 'Unpaid'}
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
                          <i className="bi bi-exclamation-triangle-fill rm-timer-warn-ico"></i>
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
                              <button className="rm-btn" onClick={() => openExtendModal(occupancy, r)}><i className="bi bi-pencil-square"></i>Extend</button>
                              <button className="rm-btn danger" onClick={() => endSession(occupancy._id, r._id)}><i className="bi bi-trash"></i>End</button>
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
                  <button className="rm-btn" onClick={onExtend}><i className="bi bi-pencil-square"></i>Extend</button>
                  <button className="rm-btn danger" onClick={onEndSession}><i className="bi bi-trash"></i>End Session</button>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [submitting, setSubmitting] = useState(false);
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [addHours, setAddHours] = useState('');
  const [addMinutes, setAddMinutes] = useState('');

  const isExtend = modal?.mode === 'extend';

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

  function handleHmsChange(field, rawValue) {
    const current = { hours: Number(hours) || 0, minutes: Number(minutes) || 0, seconds: Number(seconds) || 0 };
    current[field] = Math.max(0, Number(rawValue) || 0);
    const totalSeconds = Math.max(0, Math.min(24 * 3600, current.hours * 3600 + current.minutes * 60 + current.seconds));
    setHours(String(Math.floor(totalSeconds / 3600)));
    setMinutes(String(Math.floor((totalSeconds % 3600) / 60)));
    setSeconds(String(totalSeconds % 60));
  }

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