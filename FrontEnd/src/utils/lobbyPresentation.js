export const LOBBY_PRESENTATION_CHANNEL = 'riverview.lobby.v1';
export const LOBBY_STALE_MS = 15000;

export function isLobbyPresentationReceiver(navigator = globalThis.navigator) {
  return Boolean(navigator?.presentation?.receiver);
}

export function lobbyPresentationSupport(environment = globalThis.window) {
  if (!environment?.isSecureContext) {
    return { supported: false, message: 'Casting needs HTTPS or localhost. Open this dashboard at a secure address, or use the fullscreen fallback.' };
  }
  if (typeof environment.PresentationRequest !== 'function' || !environment.navigator?.presentation) {
    return { supported: false, message: 'Casting is unavailable in this browser. Open this page in desktop Google Chrome, or use the fullscreen fallback.' };
  }
  return { supported: true, message: 'Ready to cast. View on TV opens Chrome’s device picker.' };
}

export function lobbyPresentationUrl(origin) {
  const url = new URL('/lobby-monitor', origin);
  url.searchParams.set('presentation', '1');
  return url.href;
}

export function presentationErrorMessage(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'AbortError':
      return 'Casting was cancelled or permission was denied. Click View on TV to choose a device again.';
    case 'NotFoundError':
      return 'TV not found. Check Chromecast, then try again.';
    case 'NotSupportedError':
      return 'This browser or device cannot stream this page. Try desktop Chrome with Chromecast, or use the fullscreen fallback.';
    case 'SecurityError':
      return 'Casting was blocked. Use HTTPS or localhost and open the dashboard directly in a Chrome tab.';
    case 'InvalidAccessError':
      return 'Chrome needs a direct click to open the picker. Click View on TV again.';
    case 'OperationError':
      return 'Chrome could not start casting. Close any open device picker, then try View on TV again.';
    default:
      return 'Could not connect to the TV. Check the Chromecast and Wi-Fi, then try again or use the fullscreen fallback.';
  }
}

const ROOM_FIELDS = ['_id', 'facilityName', 'roomName', 'roomNumber', 'status', 'price'];
const SESSION_FIELDS = ['_id', 'status', 'startTime', 'scheduledEndTime', 'duration', 'rate', 'guestName', 'amount', 'paidAmount', 'paymentStatus', 'refundedAmount'];
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));

export function lobbySnapshot({ rooms = [], sessions = [], loading = true, refreshError = '', lastUpdatedAt = null, selection = {} } = {}) {
  return {
    rooms: rooms.map((room) => pick(room, ROOM_FIELDS)),
    sessions: sessions.filter((session) => session.status === 'Active').map((session) => ({
      ...pick(session, SESSION_FIELDS), room: session.room?._id || session.room,
    })),
    loading: Boolean(loading),
    refreshError: typeof refreshError === 'string' ? refreshError : '',
    lastUpdatedAt: Number.isFinite(lastUpdatedAt) ? lastUpdatedAt : null,
    selection: {
      facilityFilter: typeof selection.facilityFilter === 'string' ? selection.facilityFilter : 'All',
      roomTypeFilter: typeof selection.roomTypeFilter === 'string' ? selection.roomTypeFilter : 'All',
      sortBy: ['default', 'roomNumber', 'timeRemaining', 'status', 'price'].includes(selection.sortBy) ? selection.sortBy : 'default',
      viewMode: selection.viewMode === 'table' ? 'table' : 'grid',
      theme: selection.theme === 'light' ? 'light' : 'dark',
    },
  };
}

export function presentationMessage(type, snapshot) {
  return JSON.stringify({ channel: LOBBY_PRESENTATION_CHANNEL, type, ...(snapshot ? { snapshot } : {}) });
}

export function readPresentationMessage(data) {
  if (typeof data !== 'string') return null;
  try {
    const message = JSON.parse(data);
    if (message?.channel !== LOBBY_PRESENTATION_CHANNEL) return null;
    if (message.type === 'ready' || message.type === 'ack') return message;
    const snapshot = message.snapshot;
    const isRecord = (item) => item && typeof item === 'object' && !Array.isArray(item);
    if (message.type !== 'snapshot' || !isRecord(snapshot) || !isRecord(snapshot.selection)
      || !Array.isArray(snapshot.rooms) || !snapshot.rooms.every(isRecord)
      || !Array.isArray(snapshot.sessions) || !snapshot.sessions.every(isRecord)) return null;
    return { ...message, snapshot: lobbySnapshot(snapshot) };
  } catch {
    return null;
  }
}
