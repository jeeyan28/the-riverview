// ─────────────────────────────────────────────────────────────────────────
// services/monitoring.js — Room Monitoring's own independent data sources.
// Hits /api/monitor-rooms and /api/room-sessions, both entirely separate
// from services/rooms.js (which Facility Settings/Booking use) — creating,
// editing, or deleting a room/session here has no effect on the other, and
// vice versa. Mirrors Backend/routes/monitoringRoutes.js 1:1.
//
// Kept in one file since both only exist to serve pages/Admin/Monitor.jsx —
// previously split as services/monitorRooms.js + services/roomSessions.js.
// ─────────────────────────────────────────────────────────────────────────
import { apiRequest } from './api';

const ROOMS_BASE = '/api/monitor-rooms';
const SESSIONS_BASE = '/api/room-sessions';

export const monitorRoomsService = {
  list: () => apiRequest(ROOMS_BASE, { fallbackMessage: 'Failed to load rooms' }),

  /** @param {string} id @param {'Available'|'Occupied'|'Under Maintenance'|'Inactive'} status */
  updateStatus: (id, status) => apiRequest(`${ROOMS_BASE}/${id}`, { method: 'PUT', body: { status }, fallbackMessage: 'Failed to reset room status.' }),

  /** @param {{facilityName: string, roomName: string, roomNumber: string, price?: number}} payload */
  create: (payload) => apiRequest(ROOMS_BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to add room.' }),

  /** @param {string} id @param {{facilityName?: string, roomName?: string, roomNumber?: string, price?: number}} payload */
  update: (id, payload) => apiRequest(`${ROOMS_BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to update this room.' }),

  remove: (id) => apiRequest(`${ROOMS_BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete room.' }),
};

export const roomSessionsService = {
  /** All sessions (Active + Finished) — Monitor.jsx derives current occupancy
   *  and each room's last finished session from this single list. */
  list: () => apiRequest(SESSIONS_BASE, { fallbackMessage: 'Failed to load room monitoring sessions.' }),

  /** @param {{roomId:string, duration:number, paymentMethod:string}} payload */
  create: (payload) => apiRequest(SESSIONS_BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to start the session.' }),

  /** @param {string} id @param {object} payload - any subset of {duration, paymentMethod, startTime, status} */
  update: (id, payload) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to update this session.' }),

  /** Marks a session Finished — the record is kept, not deleted. */
  finish: (id) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'PUT', body: { status: 'Finished' }, fallbackMessage: 'Failed to end the session.' }),

  /** Permanently deletes a session record — irreversible. */
  remove: (id) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete this session record.' }),
};