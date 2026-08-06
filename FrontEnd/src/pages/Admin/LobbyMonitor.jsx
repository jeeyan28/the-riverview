import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import '../../styles/admin/lobby-monitor.css';
import { useAuth } from '../../context/AuthContext';
import { useCountdownClock } from '../../hooks/useCountdownClock';
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
  available: { label: 'Available', hint: 'Ready to book' },
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

function LobbyMonitor() {
  const { initializing, isAdmin } = useAuth();
  const now = useCountdownClock(true);
  const clockDateObj = new Date(now);
  const [clockTime, clockAmPm] = clockDateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).split(' ');
  const clockDate = `${clockDateObj.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })} · ${clockDateObj.toLocaleDateString([], { weekday: 'long' })}`;

  const { rooms, sessions, loading, viewMode, changeViewMode } = useRoomMonitorData('lobby');

  const [facilityFilter, setFacilityFilter] = useState('All');
  const [roomTypeFilter, setRoomTypeFilter] = useState('All');
  const [sortBy, setSortBy] = useState('default');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const scrollRef = useRef(null);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  function goLive() {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let raf;
    let direction = 1;
    let pauseUntil = performance.now() + 2000;

    function step(ts) {
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll > 40) {
        if (ts >= pauseUntil) {
          el.scrollTop += direction * 0.55;
          if (el.scrollTop >= maxScroll - 1) {
            direction = -1;
            pauseUntil = ts + 3500;
          } else if (el.scrollTop <= 0) {
            direction = 1;
            pauseUntil = ts + 3500;
          }
        }
      }
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isFullscreen, rooms.length, facilityFilter, roomTypeFilter]);

  const facilities = useMemo(() => [...new Set(rooms.map((r) => r.facilityName))], [rooms]);
  const roomTypes = useMemo(() => [...new Set(rooms.map((r) => r.roomName))], [rooms]);

  const statusCounts = useMemo(() => {
    const counts = { available: 0, occupied: 0, 'ending-soon': 0, expired: 0 };
    rooms.forEach((r) => {
      const key = lobbyStatus(r, sessions).key;
      if (key in counts) counts[key] += 1;
    });
    return counts;
  }, [rooms, sessions]);

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

  const groups = useMemo(() => {
    const byFacility = new Map();
    visibleRooms.forEach((r) => {
      if (!byFacility.has(r.facilityName)) byFacility.set(r.facilityName, new Map());
      const byType = byFacility.get(r.facilityName);
      if (!byType.has(r.roomName)) byType.set(r.roomName, []);
      byType.get(r.roomName).push(r);
    });
    return [...byFacility.entries()].map(([facilityName, byType]) => ({
      facilityName,
      types: [...byType.entries()].map(([roomName, roomList]) => ({ roomName, rooms: sortRooms(roomList) })),
    }));
  }, [visibleRooms, sortBy, sessions]);

  if (initializing) {
    return (
      <div style={{ padding: '3rem', fontFamily: 'sans-serif', color: '#94A3B8' }}>
        Checking your session…
      </div>
    );
  }
  if (!isAdmin) {
    return <Navigate to="/login" replace />;
  }

  const effectiveViewMode = viewMode;

  return (
    <div className={`lobby-display${isFullscreen ? ' lobby-display--live' : ''}`}>
      <div className="lobby-topbar">
        <div className="lobby-brand">
          <div className="lobby-brand-mark"><i className="bi bi-building"></i></div>
          <h1>Room Availability</h1>
          <span className="lobby-live"><span className="dot"></span>{isFullscreen ? 'Live' : 'Preview'}</span>
        </div>
        <div className="lobby-topbar-right">
          <div className="lobby-clock">
            <div className="lobby-clock-time">{clockTime} <span className="lobby-clock-ampm">{clockAmPm}</span></div>
            <div className="lobby-clock-date">{clockDate}</div>
          </div>
          {!isFullscreen && (
            <>
              <div className="lobby-view-toggle" role="group" aria-label="Switch view">
                <button type="button" className={`lobby-view-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => changeViewMode('grid')}>
                  <i className="bi bi-grid"></i>Grid
                </button>
                <button type="button" className={`lobby-view-btn${viewMode === 'table' ? ' active' : ''}`} onClick={() => changeViewMode('table')}>
                  <i className="bi bi-list-ul"></i>Table
                </button>
              </div>
              <button type="button" className="lobby-golive-btn" onClick={goLive}>
                <i className="bi bi-tv"></i>Display on TV
              </button>
            </>
          )}
        </div>
      </div>

      {!isFullscreen && (
        <>
          <p className="lobby-setup-note">
            <i className="bi bi-info-circle"></i>
            This is a setup preview. Pick what this screen should show below, then select <strong>Display on TV</strong> — filters and sorting hide automatically for guests, and the list will gently auto-scroll if it doesn't fit the screen.
          </p>
          <div className="lobby-filters">
            <div className="lobby-filter-row">
              <span className="lobby-filter-label"><i className="bi bi-funnel"></i>Facilities</span>
              <div className="lobby-chip-row">
                <button type="button" className={`lobby-chip${facilityFilter === 'All' ? ' active' : ''}`} onClick={() => setFacilityFilter('All')}>All</button>
                {facilities.map((name) => (
                  <button key={name} type="button" className={`lobby-chip${facilityFilter === name ? ' active' : ''}`} onClick={() => setFacilityFilter(name)}>{name}</button>
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
                <option value="roomNumber">Sort: Room Number</option>
                <option value="timeRemaining">Sort: Time Remaining</option>
                <option value="status">Sort: Status</option>
                <option value="price">Sort: Price</option>
              </select>
            </div>
          </div>
        </>
      )}

      <div className="lobby-legend">
        {STATUS_ORDER.map((key) => (
          <div className={`lobby-legend-item lobby-legend-item--${key}`} key={key}>
            <span className="lobby-legend-dot"></span>
            <span className="lobby-legend-val">{statusCounts[key]}</span>
            <span className="lobby-legend-text">
              <span className="lobby-legend-label">{STATUS_META[key].label}</span>
              <span className="lobby-legend-hint">{STATUS_META[key].hint}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="lobby-scroll" ref={scrollRef}>
        {loading ? (
          <div className="lobby-empty">Loading rooms…</div>
        ) : rooms.length === 0 ? (
          <div className="lobby-empty">No rooms configured yet.</div>
        ) : visibleRooms.length === 0 ? (
          <div className="lobby-empty">No rooms match the current filters.</div>
        ) : effectiveViewMode === 'grid' ? (
          groups.map(({ facilityName, types }) => (
            <div className="lobby-facility" key={facilityName}>
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
                                <span className="lobby-room-num">Room No.{r.roomNumber}</span>
                                <span className={`lobby-badge lobby-badge--${status.key}${status.critical ? ' lobby-badge--critical' : ''}`}><span className="dot"></span>{status.label}</span>
                              </div>
                              <div className="lobby-timer">
                                {occupancy ? formatTimeRemaining(remaining, isPastEnd) : '—'}
                              </div>
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
          <div className="lobby-table-wrap">
            <table className="lobby-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Facility</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Remaining</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {sortRooms(visibleRooms).map((r) => {
                  const { occupancy, remaining, isPastEnd } = buildRoomView(r, sessions);
                  const status = lobbyStatus(r, sessions);
                  return (
                    <tr key={r._id} data-status={status.key} data-critical={status.critical || undefined}>
                      <td>{r.roomNumber}</td>
                      <td>{r.facilityName}</td>
                      <td>{r.roomName}</td>
                      <td><span className={`lobby-badge lobby-badge--${status.key}${status.critical ? ' lobby-badge--critical' : ''}`}><span className="dot"></span>{status.label}</span></td>
                      <td>{occupancy ? formatTimeRemaining(remaining, isPastEnd) : '—'}</td>
                      <td>₱{r.price}/hr</td>
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