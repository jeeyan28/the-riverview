import { useEffect, useRef, useState } from 'react';
import { monitorRoomsService, roomSessionsService } from '../services/monitoring';

export const MONITOR_WARNING_MS = 10 * 60 * 1000;
export const MONITOR_CRITICAL_MS = 60 * 1000;

const OVERDUE_ALERT_REPEAT_MS = 30 * 1000;
const LOBBY_POLL_MS = 2 * 1000;

const BASE_STATUS_CLASS = { Available: 'available', Occupied: 'occupied', 'Under Maintenance': 'overdue', Inactive: 'vacant' };

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
  } catch {}
}

export function normalizeRoom(r) {
  return {
    ...r,
    facilityName: r.facilityName || r.name || 'Unassigned',
    hasCustomName: !!(r.roomName && r.roomName.trim()),
    roomName: r.roomName || `Room ${r.roomNumber ?? ''}`.trim(),
  };
}

export function sessionStart(session) {
  return new Date(session.startTime);
}
export function sessionEnd(session) {
  return new Date(sessionStart(session).getTime() + session.duration * 60 * 60 * 1000);
}
export function formatStartTime(session) {
  return sessionStart(session).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function formatEndTime(session) {
  return sessionEnd(session).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function formatTimeRemaining(ms, isPastEnd) {
  if (isPastEnd) return '00:00:00';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function findRoomOccupancy(roomId, sessions) {
  const matches = sessions.filter((s) => s.status === 'Active' && String(s.room?._id || s.room) === String(roomId));
  if (!matches.length) return null;
  return matches.reduce((latest, s) => (!latest || sessionEnd(s) > sessionEnd(latest) ? s : latest), null);
}

export function buildRoomView(r, sessions) {
  const occupancy = findRoomOccupancy(r._id, sessions);
  const remaining = occupancy ? sessionEnd(occupancy).getTime() - Date.now() : null;

  const isPastEnd = occupancy && remaining <= 0;
  const isCritical = occupancy && !isPastEnd && remaining <= MONITOR_CRITICAL_MS;
  const isWarning = occupancy && !isPastEnd && !isCritical && remaining <= MONITOR_WARNING_MS;

  const stateClass = (isPastEnd || isCritical) ? 'expired' : isWarning ? 'warning' : occupancy ? 'safe' : (BASE_STATUS_CLASS[r.status] || 'vacant');
  const statusLabel = occupancy ? 'In Use' : r.status;
  const blinkClass = isPastEnd ? ' blink-expired' : '';

  return { occupancy, remaining, isPastEnd, isCritical, isWarning, stateClass, statusLabel, blinkClass };
}

export function useRoomMonitorData(namespace = 'admin') {
  const isLobby = namespace === 'lobby';
  const viewModeKey = isLobby ? 'lobbyMonitor.viewMode' : 'roomMonitor.viewMode';
  const soundMutedKey = isLobby ? 'lobbyMonitor.overdueSoundMuted' : 'roomMonitor.overdueSoundMuted';

  const [rooms, setRooms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [, forceTick] = useState(0);
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(viewModeKey) === 'table' ? 'table' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const [soundMuted, setSoundMuted] = useState(() => {
    try {
      return localStorage.getItem(soundMutedKey) === '1';
    } catch {
      return false;
    }
  });

  const overdueIdsRef = useRef([]);
  const previouslyOverdueRef = useRef(new Set());
  const lastAlertAtRef = useRef(0);
  const soundMutedRef = useRef(soundMuted);

  function changeViewMode(mode) {
    setViewMode(mode);
    try {
      localStorage.setItem(viewModeKey, mode);
    } catch {}
  }

  function toggleSoundMuted() {
    setSoundMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(soundMutedKey, next ? '1' : '0');
      } catch {}
      return next;
    });
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

    const pollHandle = isLobby ? setInterval(() => {
      fetchRooms();
      fetchMonitorSessions();
    }, LOBBY_POLL_MS) : null;

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
      if (pollHandle) clearInterval(pollHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  overdueIdsRef.current = rooms
    .filter((r) => {
      const v = buildRoomView(r, sessions);
      return v.occupancy && v.isPastEnd;
    })
    .map((r) => r._id);

  return {
    rooms,
    setRooms,
    sessions,
    loading,
    fetchRooms,
    fetchMonitorSessions,
    viewMode,
    changeViewMode,
    soundMuted,
    toggleSoundMuted,
  };
}