import { apiDownload, apiRequest } from './api';

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

  report(from, to) {
    const query = new URLSearchParams({ from, to });
    return apiRequest(`${SESSIONS_BASE}/report?${query}`, { fallbackMessage: 'Failed to load the room monitoring report.' });
  },

  exportReport(from, to) {
    const query = new URLSearchParams({ from, to });
    return apiDownload(`${SESSIONS_BASE}/report/export?${query}`, {
      filename: `Riverview_Monitor_Daily_${from}${from === to ? '' : `_to_${to}`}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fallbackMessage: 'Failed to generate the room monitoring report.',
    });
  },

  create: (payload) => apiRequest(SESSIONS_BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to start the session.' }),
  quoteStart: (roomId, duration) => apiRequest(`${SESSIONS_BASE}/start-availability?${new URLSearchParams({ roomId, duration })}`, { fallbackMessage: 'Could not check this session length.' }),

  quoteExtension: (id, addedHours) => apiRequest(`${SESSIONS_BASE}/${id}/extend?addedHours=${addedHours}`, { fallbackMessage: 'Could not calculate the extension charge.' }),

  extend: (id, payload) => apiRequest(`${SESSIONS_BASE}/${id}/extend`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to extend this session.' }),

  end: (id, payment) => apiRequest(`${SESSIONS_BASE}/${id}/end`, { method: 'PUT', body: typeof payment === 'boolean' ? { paid: payment } : payment, fallbackMessage: 'Failed to end the session.' }),

  editFinished: (id, payload) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to correct this session record.' }),

  remove: (id) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete this session record.' }),
};
