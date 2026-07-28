// services/users.js — wraps /api/users/* endpoints, used by Users.jsx and
// Settings.jsx's ProfileTab. ProfileModal.jsx still has its own raw fetch()
// calls to the same profile/password endpoints — not yet migrated.
import { apiRequest } from './api';

const BASE = '/api/users';

export const usersService = {
  /** @param {{search?: string, role?: string}} [params] */
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.role) qs.set('role', params.role);
    const s = qs.toString();
    return apiRequest(`${BASE}${s ? `?${s}` : ''}`, { fallbackMessage: 'Failed to load users.' });
  },

  create: (payload) => apiRequest(BASE, { method: 'POST', body: payload, fallbackMessage: 'Failed to create user.' }),

  updateRole: (id, role) => apiRequest(`${BASE}/${id}/role`, { method: 'PUT', body: { role }, fallbackMessage: 'Failed to change role.' }),

  updateStatus: (id, isActive) => apiRequest(`${BASE}/${id}/status`, { method: 'PUT', body: { isActive }, fallbackMessage: 'Failed to update status.' }),

  remove: (id) => apiRequest(`${BASE}/${id}`, { method: 'DELETE', fallbackMessage: 'Failed to delete user.' }),

  updateProfile: (id, payload) => apiRequest(`${BASE}/${id}`, { method: 'PUT', body: payload, fallbackMessage: 'Could not update your profile.' }),

  updatePassword: (id, payload) => apiRequest(`${BASE}/${id}/password`, { method: 'PUT', body: payload, fallbackMessage: 'Could not update your password.' }),
};