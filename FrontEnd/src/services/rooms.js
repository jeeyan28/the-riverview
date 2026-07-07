// ─────────────────────────────────────────────────────────────────────────
// services/rooms.js — Phase 14 (list/updateStatus), expanded Phase 15
// (create/update/remove). Wraps /api/rooms/* endpoints. Mirrors
// Backend/routes (Rooms/Facilities route group) 1:1 — see
// services/README.md.
//
//   list          ← fetchRooms() in Monitor.jsx and Bookings.jsx        (GET /api/rooms)
//   updateStatus  ← autoExpireRoom()/endWalkInSession()/
//                   handleAssignSubmit()'s room PUT calls in Monitor.jsx (PUT /api/rooms/:id, body: {status})
//   create        ← FacilitiesTab.handleSave() (add mode) and .duplicate()
//                   in Settings.jsx                                     (POST /api/rooms)
//   update        ← FacilitiesTab.handleSave() (edit mode) in Settings.jsx (PUT /api/rooms/:id)
//   remove        ← FacilitiesTab.handleRemove()/.quickDelete() in
//                   Settings.jsx                                        (DELETE /api/rooms/:id)
//
// create/update both accept either a FormData (the normal case — an image
// file may or may not be attached) or a plain object (duplicate() sends
// plain JSON, no image) — apiRequest() already branches on this, so one
// function covers both body shapes, matching how the original
// saveFacility() and duplicate() both just called fetch() with whatever
// body they had.
//
// One deliberately-preserved quirk: the original duplicate() never read a
// server error message (`throw new Error('Failed to duplicate facility.')`,
// no res.json() call at all), while saveFacility() does
// (`err.message || 'Failed to save facility.'`). Both now go through this
// same create() function, which — like every apiRequest() call — attaches
// the server's message when present. This is invisible in practice: both
// call sites' catch blocks show a fixed alert() string
// ('Could not duplicate this facility.' / a caught err.message that
// happens to equal the same fallback saveFacility already used), never
// display anything from console.error(err), so no user-visible behavior
// changes — see each call site in Settings.jsx for its own note.
// ─────────────────────────────────────────────────────────────────────────
import { apiRequest } from './api';

const BASE = '/api/rooms';

export const roomsService = {
  list: () => apiRequest(BASE, { fallbackMessage: 'Failed to load rooms' }),

  /** @param {string} id @param {'Available'|'Occupied'|'Under Maintenance'|'Inactive'} status */
  updateStatus: (id, status) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: { status }, fallbackMessage: 'Failed to reset room status.' }),

  /** @param {FormData|object} payload */
  create: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to save facility.' }),

  /** @param {string} id @param {FormData|object} payload */
  update: (id, payload) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to save facility.' }),

  remove: (id) => apiRequest(`${BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete facility.' }),
};
