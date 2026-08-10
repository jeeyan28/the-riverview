import { apiRequest } from './api';

const BASE = '/api/users';

export const usersService = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.role) qs.set('role', params.role);
    if (params.isGuest !== undefined) qs.set('isGuest', String(params.isGuest));
    if (params.deleted !== undefined) qs.set('deleted', String(params.deleted));
    const s = qs.toString();
    return apiRequest(`${BASE}${s ? `?${s}` : ''}`, { fallbackMessage: 'Failed to load users.' });
  },

  create: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to create user.' }),

  updateRole: (id, role) => apiRequest(`${BASE}/${id}/role`, { method: 'PUT', body: { role }, fallbackMessage: 'Failed to change role.' }),

  updateStatus: (id, isActive) => apiRequest(`${BASE}/${id}/status`, { method: 'PUT', body: { isActive }, fallbackMessage: 'Failed to update status.' }),

  remove: (id) => apiRequest(`${BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete user.' }),

  recover: (id) => apiRequest(`${BASE}/${id}/recover`, { method: 'POST', fallbackMessage: 'Failed to generate recovery credentials.' }),

  cleanupGuestsNow: () => apiRequest(`${BASE}/guests/cleanup-now`, { method: 'POST', fallbackMessage: 'Failed to run guest cleanup.' }),

  updateProfile: (id, payload) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Could not update your profile.' }),

  updatePassword: (id, payload) => apiRequest(`${BASE}/${id}/password`, { method: 'PUT', body: payload, fallbackMessage: 'Could not update your password.' }),
};