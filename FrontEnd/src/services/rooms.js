import { apiRequest } from './api';

const BASE = '/api/rooms';

export const roomsService = {
  list: () => apiRequest(BASE, { fallbackMessage: 'Failed to load rooms' }),

  /** @param {FormData|object} payload */
  create: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to save facility.' }),

  /** @param {string} id @param {FormData|object} payload */
  update: (id, payload) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to save facility.' }),

  remove: (id) => apiRequest(`${BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete facility.' }),
};