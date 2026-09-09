import { API_BASE_URL, apiRequest } from './api';

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
    return apiRequest(`${SESSIONS_BASE}/report?${query}`, { fallbackMessage: 'Failed to load the live monitor report.' });
  },

  async exportReport(from, to) {
    const query = new URLSearchParams({ from, to });
    const response = await fetch(`${API_BASE_URL}${SESSIONS_BASE}/report/export?${query}`, { credentials: 'include' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.message || 'Failed to generate the live monitor report.');
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = match?.[1] || `Riverview-Live-Monitor_${from}_to_${to}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  create: (payload) => apiRequest(SESSIONS_BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to start the session.' }),

  extend: (id, payload) => apiRequest(`${SESSIONS_BASE}/${id}/extend`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to extend this session.' }),

  end: (id, payment) => apiRequest(`${SESSIONS_BASE}/${id}/end`, { method: 'PUT', body: typeof payment === 'boolean' ? { paid: payment } : payment, fallbackMessage: 'Failed to end the session.' }),

  editFinished: (id, payload) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Failed to correct this session record.' }),

  remove: (id) => apiRequest(`${SESSIONS_BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete this session record.' }),
};
