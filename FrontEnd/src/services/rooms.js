import { apiRequest } from './api';

const BASE = '/api/rooms';

export const roomsService = {
  list: () => apiRequest(BASE, { fallbackMessage: 'Failed to load rooms' }),

  get: (id) => apiRequest(`${BASE}/${id}`, { fallbackMessage: 'Failed to load facility.' }),

  create: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to save facility.' }),

  update: (id, payload) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to save facility.' }),

  remove: (id) => apiRequest(`${BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete facility.' }),
};