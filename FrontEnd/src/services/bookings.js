// ─────────────────────────────────────────────────────────────────────────
// services/bookings.js — Phase 14 (listActive/updateStatus/create for
// Monitor.jsx), expanded Phase 15 (list/update/approve/reject/remove for
// Bookings.jsx). Wraps /api/bookings/* endpoints. Mirrors Backend/routes
// (Bookings route group) 1:1 — see services/README.md.
//
//   listActive ← fetchMonitorBookings() in Monitor.jsx        (GET /api/bookings?status=Active)
//   updateStatus ← endWalkInSession()'s booking PUT in
//                  Monitor.jsx                                (PUT /api/bookings/:id, body: {status})
//   create     ← handleAssignSubmit() in Monitor.jsx          (POST /api/bookings — walk-in session)
//   list       ← fetchBookings() in Bookings.jsx               (GET /api/bookings?search=&status=&paymentStatus=&room=&date=)
//   update     ← updateBookingStatus()/EditBookingModal.
//                handleSave() in Bookings.jsx                  (PUT /api/bookings/:id)
//   approve    ← approveBooking() in Bookings.jsx               (PUT /api/bookings/:id/approve)
//   reject     ← rejectBooking() in Bookings.jsx                (PUT /api/bookings/:id/reject)
//   remove     ← deleteBooking() in Bookings.jsx                (DELETE /api/bookings/:id)
//
// `update` is one generic function for both of Bookings.jsx's two PUT
// /api/bookings/:id call sites, which differ only in payload shape
// (updateBookingStatus sends {status}; EditBookingModal sends
// {duration, paymentMethod, status}) — same endpoint, so one function
// taking whatever payload the caller has, rather than two near-identical
// wrappers. This mirrors updateStatus above (also a partial-payload PUT to
// the same route) without duplicating it, since updateStatus's fallback
// message ('Failed to end the session.') is Monitor-specific wording that
// doesn't fit Bookings.jsx's call sites.
// ─────────────────────────────────────────────────────────────────────────
import { apiRequest } from './api';

const BASE = '/api/bookings';

export const bookingsService = {
  listActive: () => apiRequest(`${BASE}?status=Active`, { fallbackMessage: 'Failed to load bookings for the room monitor.' }),

  /** @param {string} id @param {string} status - e.g. 'Done' */
  updateStatus: (id, status) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: { status }, fallbackMessage: 'Failed to end the session.' }),

  /** @param {{guestName:string, roomId:string, date:string, timeIn:string, duration:number, paymentMethod:string}} payload */
  create: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to start the session.' }),

  /** @param {{search?:string, status?:string, paymentStatus?:string, room?:string, date?:string}} [params] */
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    if (params.paymentStatus) qs.set('paymentStatus', params.paymentStatus);
    if (params.room) qs.set('room', params.room);
    if (params.date) qs.set('date', params.date);
    const s = qs.toString();
    return apiRequest(`${BASE}${s ? `?${s}` : ''}`, { fallbackMessage: 'Failed to load bookings.' });
  },

  /** @param {string} id @param {object} payload - any subset of {duration, paymentMethod, status} */
  update: (id, payload) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to update booking.' }),

  approve: (id) => apiRequest(`${BASE}/${id}/approve`, { method: 'PUT', fallbackMessage: 'Failed to approve booking.' }),

  reject: (id) => apiRequest(`${BASE}/${id}/reject`, { method: 'PUT', fallbackMessage: 'Failed to reject booking.' }),

  remove: (id) => apiRequest(`${BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete booking.' }),
};
