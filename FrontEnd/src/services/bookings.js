import { apiRequest } from './api';
import { BOOKING_STATUS } from '../utils/bookingStatus';

const BASE = '/api/bookings';

export const bookingsService = {
  listActive: () => apiRequest(`${BASE}?status=${BOOKING_STATUS.ACTIVE}`, { fallbackMessage: 'Failed to load bookings for the room monitor.' }),

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

  /** Bookings for the current logged-in user — used by ProfileModal's booking history. */
  mine: () => apiRequest(`${BASE}/mine`, { fallbackMessage: 'Failed to load your booking history.' }),

  /** @param {{roomId:string, variantLabel?:string, date:string, timeIn:string, duration:number}} payload */
  lockSlot: (payload) => apiRequest(`${BASE}/lock`, { method: 'POST', body: payload, fallbackMessage: 'Failed to hold this time slot.' }),

  /** @param {string} id */
  releaseLock: (id) => apiRequest(`${BASE}/lock/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to release the time slot hold.' }),
};