import { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/admin/lobby-monitor.css';
import { useTheme } from '../../hooks/useTheme';
import { useCountdownClock } from '../../hooks/useCountdownClock';
import { useLobbyPresentation, useLobbyPresentationReceiver } from '../../hooks/useLobbyPresentation';
import { isLobbyPresentationReceiver, lobbySnapshot, LOBBY_STALE_MS } from '../../utils/lobbyPresentation';
import {
  useRoomMonitorData,
  sessionEnd,
  formatTimeRemaining,
  findRoomOccupancy,
  buildRoomView,
} from '../../hooks/useRoomMonitorData';

const FACILITY_ICONS = { Billiards: 'bi-disc', Karaoke: 'bi-mic', 'Private Rooms': 'bi-door-open', 'Rental Court': 'bi-trophy' };
const FACILITY_ICON_DEFAULT = 'bi-building';

const STATUS_META = {
  available: { label: 'Available', hint: 'Ready to reserve' },
  occupied: { label: 'Occupied', hint: 'Currently in use' },
  'ending-soon': { label: 'Ending Soon', hint: 'Wrapping up' },
  expired: { label: 'Overdue', hint: 'Past reserved time' },
};
const STATUS_ORDER = ['available', 'occupied', 'ending-soon', 'expired'];

function lobbyStatus(r, sessions) {
  const { occupancy, isPastEnd, isCritical, isWarning } = buildRoomView(r, sessions);
  if (occupancy) {
    if (isPastEnd) return { key: 'expired', label: 'Overdue', critical: false };
    if (isCritical) return { key: 'ending-soon', label: 'Ending Soon', critical: true };
    if (isWarning) return { key: 'ending-soon', label: 'Ending Soon', critical: false };
    return { key: 'occupied', label: 'Occupied', critical: false };
  }
  if (r.status === 'Available') return { key: 'available', label: 'Available', critical: false };
  return { key: 'other', label: r.status, critical: false };
}

const STATUS_RANK = { expired: 0, 'ending-soon': 1, occupied: 2, available: 3, other: 4 };

function LobbyStatusLegend({ rooms, sessions, facilityName }) {
  const counts = { available: 0, occupied: 0, 'ending-soon': 0, expired: 0 };
  rooms.forEach((room) => {
    const key = lobbyStatus(room, sessions).key;
    if (key in counts) counts[key] += 1;
  });

  return (
    <div className={`lobby-legend${facilityName ? ' lobby-legend--facility' : ''}`} role="group" aria-label={`${facilityName || 'Selected rooms'} availability counts`}>
      {STATUS_ORDER.map((key) => (
        <div className={`lobby-legend-item lobby-legend-item--${key}`} key={key}>
          <span className="lobby-legend-dot" aria-hidden="true"></span>
          <span className="lobby-legend-val">{counts[key]}</span>
          <span className="lobby-legend-text">
            <span className="lobby-legend-label">{STATUS_META[key].label}</span>
            {!facilityName && <span className="lobby-legend-hint">{STATUS_META[key].hint}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

function LobbyMonitor() {
  return isLobbyPresentationReceiver() ? <LobbyReceiver /> : <LobbyController />;
}

function LobbyController() {
  const monitor = useRoomMonitorData('lobby');
  return <LobbyMonitorView monitor={monitor} />;
}

function LobbyReceiver() {
  const receiver = useLobbyPresentationReceiver();
  return <LobbyMonitorView monitor={receiver.snapshot || lobbySnapshot()} receiver={receiver} />;
}

function LobbyMonitorView({ monitor, receiver }) {
  const [localTheme, toggleTheme] = useTheme();
  const theme = receiver?.snapshot?.selection.theme || localTheme;
  const now = useCountdownClock(true);
  const clockDateObj = new Date(now);
  const [clockTime, clockAmPm] = clockDateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).split(' ');
  const clockDate = `${clockDateObj.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })} · ${clockDateObj.toLocaleDateString([], { weekday: 'long' })}`;

  const { sessions, loading, changeViewMode } = monitor;
  const viewMode = receiver?.snapshot?.selection.viewMode || monitor.viewMode || 'grid';
  const dataWarning = monitor.refreshError || (monitor.lastUpdatedAt && now - monitor.lastUpdatedAt > LOBBY_STALE_MS
    ? 'Live data is delayed. Check the laptop’s connection; these values may be out of date.' : '')
    || (receiver?.receivedAt && now - receiver.receivedAt > LOBBY_STALE_MS
      ? 'Updates from the laptop stopped. Check its connection and reconnect to the TV.' : '');
  const rooms = useMemo(() => dataWarning
    ? monitor.rooms.map((room) => room.status === 'Available' ? { ...room, status: 'Status unavailable' } : room)
    : monitor.rooms, [monitor.rooms, dataWarning]);

  const [localFacilityFilter, setFacilityFilter] = useState('All');
  const [localRoomTypeFilter, setRoomTypeFilter] = useState('All');
  const [localSortBy, setSortBy] = useState('default');
  const facilityFilter = receiver?.snapshot?.selection.facilityFilter ?? localFacilityFilter;
  const roomTypeFilter = receiver?.snapshot?.selection.roomTypeFilter ?? localRoomTypeFilter;
  const sortBy = receiver?.snapshot?.selection.sortBy ?? localSortBy;
  const [fullscreen, setIsFullscreen] = useState(false);
  const isFullscreen = fullscreen || Boolean(receiver);
  const [fullscreenError, setFullscreenError] = useState('');
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const snapshot = useMemo(() => lobbySnapshot({
    rooms, sessions, loading, refreshError: dataWarning, lastUpdatedAt: monitor.lastUpdatedAt,
    selection: { facilityFilter, roomTypeFilter, sortBy, viewMode, theme },
  }), [rooms, sessions, loading, dataWarning, monitor.lastUpdatedAt, facilityFilter, roomTypeFilter, sortBy, viewMode, theme]);
  const casting = useLobbyPresentation(snapshot, !receiver);
  const castBusy = ['selecting', 'connecting', 'stopping'].includes(casting.phase);
  const castLabel = { connected: 'Casting to TV', disconnected: 'Reconnect to TV', selecting: 'Choose a TV…', connecting: 'Connecting…', stopping: 'Stopping…' }[casting.phase] || 'View on TV';
  const showCastStatus = !casting.supported || (casting.phase !== 'idle' && casting.phase !== 'terminated');

  const scrollRef = useRef(null);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  function goLive() {
    setFullscreenError('');
    try {
      const result = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      result.catch(() => setFullscreenError('Fullscreen could not open. Use Chrome’s fullscreen control or press F11.'));
    } catch {
      setFullscreenError('Fullscreen is unavailable here. Use Chrome’s fullscreen control or press F11.');
    }
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const updateSize = () => {
      const { width, height } = el.getBoundingClientRect();
      setDisplaySize((current) => current.width === width && current.height === height ? current : { width, height });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    observer?.observe(el);
    return () => {
      window.removeEventListener('resize', updateSize);
      observer?.disconnect();
    };
  }, []);

  const facilities = useMemo(() => [...new Set(rooms.map((r) => r.facilityName))], [rooms]);
  const roomTypes = useMemo(() => [...new Set(rooms
    .filter((room) => facilityFilter === 'All' || room.facilityName === facilityFilter)
    .map((room) => room.roomName))], [rooms, facilityFilter]);

  function selectFacility(name) {
    setFacilityFilter(name);
    setRoomTypeFilter('All');
  }

  const visibleRooms = useMemo(() => {
    let list = rooms;
    if (facilityFilter !== 'All') list = list.filter((r) => r.facilityName === facilityFilter);
    if (roomTypeFilter !== 'All') list = list.filter((r) => r.roomName === roomTypeFilter);
    return list;
  }, [rooms, facilityFilter, roomTypeFilter]);

  function sortRooms(list) {
    if (sortBy === 'roomNumber') {
      return [...list].sort((a, b) => String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true, sensitivity: 'base' }));
    }
    if (sortBy === 'timeRemaining') {
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
    if (sortBy === 'status') {
      return [...list].sort((a, b) => STATUS_RANK[lobbyStatus(a, sessions).key] - STATUS_RANK[lobbyStatus(b, sessions).key]);
    }
    if (sortBy === 'price') {
      return [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    }
    return list;
  }

  const inventoryGroups = useMemo(() => {
    const byFacility = new Map();
    rooms.forEach((r) => {
      if (!byFacility.has(r.facilityName)) byFacility.set(r.facilityName, new Map());
      const byType = byFacility.get(r.facilityName);
      if (!byType.has(r.roomName)) byType.set(r.roomName, []);
      byType.get(r.roomName).push(r);
    });
    return [...byFacility.entries()].map(([facilityName, byType]) => ({
      facilityName,
      types: [...byType.entries()].map(([roomName, roomList]) => ({ roomName, rooms: sortRooms(roomList) })),
    }));
  }, [rooms, sortBy, sessions]);

  const groups = useMemo(() => inventoryGroups
    .filter((group) => facilityFilter === 'All' || group.facilityName === facilityFilter)
    .map((group) => ({ ...group, types: group.types.filter((type) => roomTypeFilter === 'All' || type.roomName === roomTypeFilter) }))
    .filter((group) => group.types.length > 0), [inventoryGroups, facilityFilter, roomTypeFilter]);

  const liveTight = (displaySize.height || 800) < 700;

  const liveLayout = useMemo(() => {
    const width = displaySize.width || 1920;
    const height = displaySize.height || 800;
    const gap = liveTight ? 6 : 8;
    const typeMin = height >= 860 ? 384 : height >= 700 ? 340 : 300;
    const cardMin = height >= 860 ? 194 : height >= 700 ? 164 : 124;
    const typePadX = (liveTight ? 10 : 12) * 2 + 2;
    const facilityBlock = liveTight ? 78 : 104;
    const typeBlock = liveTight ? 41 : 50;
    const perTypeRow = Math.max(1, Math.floor((width + gap) / (typeMin + gap)));
    let rows = 0;
    let overhead = 0;
    // Size against the complete inventory so a filter only removes facilities;
    // it must not stretch the remaining cards to fill the screen.
    inventoryGroups.forEach(({ types }) => {
      let facilityRows = 0;
      let chunks = 0;
      for (let i = 0; i < types.length; i += perTypeRow) {
        const chunk = types.slice(i, i + perTypeRow);
        const typeWidth = (width - (chunk.length - 1) * gap) / chunk.length;
        const cols = Math.max(1, Math.floor((typeWidth - typePadX + gap) / (cardMin + gap)));
        facilityRows += Math.max(...chunk.map((t) => Math.ceil(t.rooms.length / cols)));
        chunks += 1;
      }
      rows += facilityRows;
      overhead += facilityBlock + chunks * typeBlock + Math.max(0, facilityRows - 1) * gap;
    });
    return { width, height, gap, typeMin, cardMin, rows, overhead };
  }, [inventoryGroups, displaySize.width, displaySize.height, liveTight]);

  const liveCellH = useMemo(() => {
    const usable = liveLayout.height - liveLayout.overhead - 16;
    return Math.floor(Math.max(48, Math.min(176, (usable / Math.max(1, liveLayout.rows)) * 1.08)));
  }, [liveLayout]);

  const tableFont = Math.max(0.55, Math.min(0.84, (displaySize.height || 700) / Math.max(visibleRooms.length, 1) / 35));
  const tablePad = Math.max(1, Math.min(8, Math.floor(((displaySize.height || 700) / Math.max(visibleRooms.length, 1) - tableFont * 16 * 1.3) / 2)));

  return (
    <div className={`lobby-display${isFullscreen ? ' lobby-display--live' : ''}`} data-theme={theme}>
      <div className="lobby-topbar">
        <div className="lobby-brand">
          <div className="lobby-brand-mark"><i className="bi bi-building"></i></div>
          <h1>Room Availability</h1>
          {!isFullscreen && <span className="lobby-live"><span className="dot"></span>{dataWarning ? 'Updates paused' : loading ? 'Waiting' : 'Preview'}</span>}
        </div>
        <div className="lobby-topbar-right">
          {!receiver && !isFullscreen && <div className="lobby-view-toggle" role="group" aria-label="Switch view">
            <button type="button" className={`lobby-view-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => changeViewMode('grid')}>
              <i className="bi bi-grid" aria-hidden="true"></i>Grid
            </button>
            <button type="button" className={`lobby-view-btn${viewMode === 'table' ? ' active' : ''}`} onClick={() => changeViewMode('table')}>
              <i className="bi bi-list-ul" aria-hidden="true"></i>Table
            </button>
          </div>}
          {!receiver && <button type="button" className="lobby-theme-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            <i className={`bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} aria-hidden="true"></i>
          </button>}
          <div className="lobby-clock">
            <div className="lobby-clock-time">{clockTime} <span className="lobby-clock-ampm">{clockAmPm}</span></div>
            <div className="lobby-clock-date">{clockDate}</div>
          </div>
          {!receiver && (
            <div className="lobby-cast-actions">
              {isFullscreen ? (
                <button type="button" className="lobby-fallback-btn lobby-exit-btn" onClick={goLive}>
                  <i className="bi bi-fullscreen-exit" aria-hidden="true"></i>Exit fullscreen
                </button>
              ) : (
                <div className="lobby-cast-primary-actions">
                  <button type="button" className="lobby-golive-btn" onClick={casting.start} disabled={!casting.supported || castBusy} aria-describedby={showCastStatus ? 'lobby-cast-status' : undefined}>
                    <i className="bi bi-cast" aria-hidden="true"></i>{castLabel}
                  </button>
                  {!casting.canStop && <button type="button" className="lobby-fallback-btn" onClick={goLive}>
                    <i className="bi bi-fullscreen" aria-hidden="true"></i>Fullscreen
                  </button>}
                </div>
              )}
              {casting.canStop && <button type="button" className="lobby-fallback-btn" onClick={casting.stop} disabled={casting.phase === 'stopping'}>Stop casting</button>}
            </div>
          )}
        </div>
      </div>

      {!receiver && !isFullscreen && showCastStatus && <p id="lobby-cast-status" className="lobby-cast-status" role="status" aria-live="polite">{casting.message}</p>}
      {fullscreenError && <p className="lobby-cast-status" role="alert">{fullscreenError}</p>}

      {dataWarning && <p className="lobby-setup-note" role="status">{dataWarning}</p>}

      {!isFullscreen && (
        <>
          <div className="lobby-filters">
            <div className="lobby-filter-row">
              <span className="lobby-filter-label"><i className="bi bi-funnel"></i>Facilities</span>
              <div className="lobby-chip-row">
                <button type="button" className={`lobby-chip${facilityFilter === 'All' ? ' active' : ''}`} onClick={() => selectFacility('All')}>All</button>
                {facilities.map((name) => (
                  <button key={name} type="button" className={`lobby-chip${facilityFilter === name ? ' active' : ''}`} onClick={() => selectFacility(name)}>{name}</button>
                ))}
              </div>
            </div>
            <div className="lobby-filter-row">
              <span className="lobby-filter-label">Room Types</span>
              <div className="lobby-chip-row">
                <button type="button" className={`lobby-chip${roomTypeFilter === 'All' ? ' active' : ''}`} onClick={() => setRoomTypeFilter('All')}>All</button>
                {roomTypes.map((name) => (
                  <button key={name} type="button" className={`lobby-chip${roomTypeFilter === name ? ' active' : ''}`} onClick={() => setRoomTypeFilter(name)}>{name}</button>
                ))}
              </div>
            </div>
            <div className="lobby-sort">
              <i className="bi bi-sort-down"></i>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="default">Sort: Default</option>
                <option value="roomNumber">Sort: Table Number</option>
                <option value="timeRemaining">Sort: Time Remaining</option>
                <option value="status">Sort: Status</option>
                <option value="price">Sort: Price</option>
              </select>
            </div>
          </div>
        </>
      )}

      {!isFullscreen && <LobbyStatusLegend rooms={visibleRooms} sessions={sessions} />}

      <div className="lobby-scroll" ref={scrollRef}>
        {loading ? (
          <div className="lobby-empty" role="status">{receiver?.message || 'Loading rooms…'}</div>
        ) : rooms.length === 0 ? (
          <div className="lobby-empty">No rooms configured yet.</div>
        ) : visibleRooms.length === 0 ? (
          <div className="lobby-empty">No rooms match the current filters.</div>
        ) : isFullscreen ? (
          <div
            className="lobby-live-boards"
            data-tight={liveTight ? '' : undefined}
            style={{
              '--lobby-cell-h': `${liveCellH}px`,
              '--lobby-type-min': `${liveLayout.typeMin}px`,
              '--lobby-card-min': `${liveLayout.cardMin}px`,
            }}
          >
            {groups.map(({ facilityName, types }) => (
              <div className="lobby-facility" key={facilityName} data-facility={facilityName}>
                <LobbyStatusLegend facilityName={facilityName} rooms={types.flatMap((type) => type.rooms)} sessions={sessions} />
                <div className="lobby-facility-head">
                  <i className={`bi ${FACILITY_ICONS[facilityName] || FACILITY_ICON_DEFAULT}`}></i>
                  {facilityName}
                </div>
                <div className="lobby-types-row">
                  {types.map(({ roomName, rooms: typeRooms }) => (
                    <div className="lobby-type" key={`${facilityName}::${roomName}`}>
                      <div className="lobby-type-head">
                        {roomName} <span className="lobby-type-count">· {typeRooms.length}</span>
                      </div>
                      <div className="lobby-card-grid">
                        {typeRooms.map((r) => {
                          const { occupancy, remaining, isPastEnd } = buildRoomView(r, sessions);
                          const status = lobbyStatus(r, sessions);
                          const unit = r.facilityName === 'Billiards' ? 'Table' : r.facilityName === 'Court' ? 'Court' : 'Room';
                          return (
                            <div className={`lobby-card lobby-card--${status.key}${status.critical ? ' lobby-card--critical' : ''}`} key={r._id}>
                              <div className="lobby-live-card-inner">
                                <span className="lobby-live-card-num">{unit} {r.roomNumber}</span>
                                <span className={`lobby-badge lobby-badge--${status.key}${status.critical ? ' lobby-card--critical' : ''}`}><span className="dot"></span>{status.label}</span>
                                {occupancy && <div className="lobby-timer">{formatTimeRemaining(remaining, isPastEnd)}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          groups.map(({ facilityName, types }) => (
            <div className="lobby-facility" key={facilityName} data-facility={facilityName}>
              <div className="lobby-facility-head">
                <i className={`bi ${FACILITY_ICONS[facilityName] || FACILITY_ICON_DEFAULT}`}></i>
                {facilityName}
              </div>
              <div className="lobby-types-row">
                {types.map(({ roomName, rooms: typeRooms }) => {
                  const key = `${facilityName}::${roomName}`;
                  return (
                    <div className="lobby-type" key={key}>
                      <div className="lobby-type-head">
                        {roomName} <span className="lobby-type-count">· {typeRooms.length}</span>
                      </div>
                      <div className="lobby-card-grid">
                        {typeRooms.map((r) => {
                          const { occupancy, remaining, isPastEnd } = buildRoomView(r, sessions);
                          const status = lobbyStatus(r, sessions);
                          return (
                            <div className={`lobby-card lobby-card--${status.key}${status.critical ? ' lobby-card--critical' : ''}`} key={r._id}>
                              <div className="lobby-card-top">
                                <span className="lobby-room-num">Table No.{r.roomNumber}</span>
                                <span className={`lobby-badge lobby-badge--${status.key}${status.critical ? ' lobby-badge--critical' : ''}`}><span className="dot"></span>{status.label}</span>
                              </div>
                              {occupancy && <div className="lobby-timer">{formatTimeRemaining(remaining, isPastEnd)}</div>}
                              <div className="lobby-card-foot">
                                <span className="lobby-price">₱{r.price}/hr</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="lobby-table-wrap" tabIndex={isFullscreen ? undefined : 0} role="region" aria-label="Room availability table" style={{ '--lobby-table-font': `${tableFont}rem`, '--lobby-table-row-pad': `${tablePad}px` }}>
            <table className="lobby-table lobby-board-table" data-compact={visibleRooms.length > 16}>
              <thead>
                <tr>
                  <th>Rate</th>
                  <th>Table #</th>
                  <th>Time-in</th>
                  <th>Time-out</th>
                  <th>Status / Guest</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {sortRooms(visibleRooms).map((r) => {
                  const { occupancy, remaining, isPastEnd, isCritical, isWarning } = buildRoomView(r, sessions);
                  const status = lobbyStatus(r, sessions);
                  const end = occupancy ? sessionEnd(occupancy) : null;
                  const amount = Number(occupancy?.amount) || 0;
                  const paid = Math.max(Number(occupancy?.paidAmount) || 0, occupancy?.paymentStatus === 'Paid' ? amount : 0);
                  const balance = Math.max(0, amount - paid + (Number(occupancy?.refundedAmount) || 0));
                  const unit = r.facilityName === 'Billiards' ? 'Table' : r.facilityName === 'Court' ? 'Court' : 'Room';
                  return (
                    <tr key={r._id} data-status={status.key} data-critical={status.critical || undefined}>
                      <td><strong>₱{Number(occupancy?.rate || r.price || 0).toLocaleString()}</strong><small>per hour</small></td>
                      <td><strong>{unit} {r.roomNumber}</strong><small>{r.facilityName} · {r.roomName}</small></td>
                      <td>{occupancy ? new Date(occupancy.startTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                      <td>{end ? <><strong>{end.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</strong><small className={isPastEnd || isCritical ? 'is-urgent' : isWarning ? 'is-warning' : ''}>{isPastEnd ? `Overdue ${formatTimeRemaining(remaining, true)}` : `${formatTimeRemaining(remaining, false)} left`}</small></> : '—'}</td>
                      <td><span className={`lobby-badge lobby-badge--${status.key}${status.critical ? ' lobby-badge--critical' : ''}`}><span className="dot"></span>{status.label}</span>{occupancy && <small>{occupancy.guestName || 'Walk-in guest'}</small>}</td>
                      <td>{occupancy ? <><strong className={balance > 0 ? 'is-warning' : 'is-paid'}>{balance > 0 ? `₱${balance.toLocaleString()} due` : 'Paid in full'}</strong><small>{balance > 0 ? `₱${Math.max(0, paid - (Number(occupancy.refundedAmount) || 0)).toLocaleString()} paid` : `₱${paid.toLocaleString()} collected`}</small></> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default LobbyMonitor;
