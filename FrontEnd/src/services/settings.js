
import { apiRequest } from './api';

const BASE = '/api/settings';

export const settingsService = {
  getAdmin: () => apiRequest(`${BASE}/admin`, { fallbackMessage: 'Failed to load settings.' }),

  /** @param {{openTime:string, closeTime:string, openDays:number[]}} payload */
  updateOperatingHours: (payload) =>
    apiRequest(`${BASE}/operating-hours`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to save.' }),

  /** @param {{name:string, date:string, fullDay:boolean}} payload */
  addHoliday: (payload) => apiRequest(`${BASE}/holidays`, { method: 'POST', body: payload, fallbackMessage: 'Failed to add holiday.' }),

  removeHoliday: (id) => apiRequest(`${BASE}/holidays/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to remove holiday.' }),

  /** @param {{title:string, message:string}} payload */
  addAnnouncement: (payload) =>
    apiRequest(`${BASE}/announcements`, { method: 'POST', body: payload, fallbackMessage: 'Failed to post announcement.' }),

  /** @param {string} id @param {{isActive:boolean}} payload */
  updateAnnouncement: (id, payload) =>
    apiRequest(`${BASE}/announcements/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to update.' }),

  removeAnnouncement: (id) => apiRequest(`${BASE}/announcements/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete.' }),

  /** @param {FormData} formData */
  addPaymentMethod: (formData) =>
    apiRequest(`${BASE}/payment-methods`, { method: 'POST', body: formData, fallbackMessage: 'Failed to save payment method.' }),

  /** @param {string} id @param {FormData} formData @param {string} [fallbackMessage] - see header note */
  updatePaymentMethod: (id, formData, fallbackMessage = 'Failed to save payment method.') =>
    apiRequest(`${BASE}/payment-methods/${id}`, { method: 'PUT', body: formData, fallbackMessage }),

  removePaymentMethod: (id) =>
    apiRequest(`${BASE}/payment-methods/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to remove payment method.' }),
};