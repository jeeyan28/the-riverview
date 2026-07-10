// ─────────────────────────────────────────────────────────────────────────
// services/roomSessions.js — wraps /api/room-sessions/*, Room Monitoring's
// own independent data source. Mirrors Backend/routes/roomSessionRoutes.js
// 1:1 — see services/README.md.
//
//   list    ← fetchMonitorSessions() in Monitor.jsx         (GET /api/room-sessions)
//   create  ← handleModalSubmit() 'start' path               (POST /api/room-sessions)
//   update  ← handleModalSubmit() 'extend'/'editLast' paths  (PUT /api/room-sessions/:id)
//   finish  ← endSession()                                   (PUT /api/room-sessions/:id — status: 'Finished')
//   remove  ← deleteSessionRecord()                           (DELETE /api/room-sessions/:id)
// ─────────────────────────────────────────────────────────────────────────
import { apiRequest } from './api';

const BASE = '/api/room-sessions';

export const roomSessionsService = {
  /** All sessions (Active + Finished) — Monitor.jsx derives current occupancy
   *  and each room's last finished session from this single list. */
  list: () => apiRequest(BASE, { fallbackMessage: 'Failed to load room monitoring sessions.' }),

  /** @param {{roomId:string, duration:number, paymentMethod:string}} payload */
  create: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to start the session.' }),

  /** @param {string} id @param {object} payload - any subset of {duration, paymentMethod, startTime, status} */
  update: (id, payload) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to update this session.' }),

  /** Marks a session Finished — the record is kept, not deleted. */
  finish: (id) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: { status: 'Finished' }, fallbackMessage: 'Failed to end the session.' }),

  /** Permanently deletes a session record — irreversible. */
  remove: (id) => apiRequest(`${BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete this session record.' }),
};