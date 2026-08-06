import { apiRequest } from './api';

const ROOMS_BASE = '/api/monitor-rooms';
const SESSIONS_BASE = '/api/room-sessions';

export const monitorRoomsService = {
  list: () => apiRequest(ROOMS_BASE, { fallbackMessage: 'Failed to load rooms' }),

  updateStatus: (id, status) => apiRequest(`${ROOMS_BASE}/${id}`, { method: 'PUT', body: { status }, fallbackMessage: 'Failed to reset room status.' }),

  create: (payload) => apiRequest(ROOMS_BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to add room.' }),

  update: (id, payload) => apiRequest(`${ROOMS_BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to update this room.' }),

  remove: (id) => apiRequest(`${ROOMS_BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete room.' }),
};

export const roomSessionsService = {
  list: () => apiRequest(SESSIONS_BASE, { fallbackMessage: 'Failed to load room monitoring sessions.' }),

  create: (payload) => apiRequest(SESSIONS_BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to start the session.' }),

  extend: (id, payload) => apiRequest(`${SESSIONS_BASE}/${id}/extend`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to extend this session.' }),

  end: (id, paid) => apiRequest(`${SESSIONS_BASE}/${id}/end`, { method: 'PUT', body: { paid }, fallbackMessage: 'Failed to end the session.' }),

  editFinished: (id, payload) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to correct this session record.' }),

  remove: (id) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete this session record.' }),
};