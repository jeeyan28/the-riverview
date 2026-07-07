// ─────────────────────────────────────────────────────────────────────────
// services/users.js — Phase 14. Wraps the 5 /api/users/* endpoints
// Users.jsx calls directly today. Mirrors Backend/routes (Users route
// group) 1:1 — see services/README.md.
//
//   list          ← fetchUsers()                (GET /api/users?search=&role=)
//   create        ← AddUserModal.handleSubmit()  (POST /api/users)
//   updateRole    ← RoleChangeModal.handleSave()  (PUT /api/users/:id/role)
//   updateStatus  ← toggleUserStatus()            (PUT /api/users/:id/status)
//   remove        ← deleteUser()                  (DELETE /api/users/:id)
//
// NOT included yet: Profile.jsx's own /api/users/:id (general profile PUT)
// and /api/users/:id/password calls, and components/ProfileModal.jsx's
// near-duplicate of the same two — deferred to the phase that migrates
// those files (see this phase's resume prompt), so this module doesn't
// grow ahead of what's actually wired up.
// ─────────────────────────────────────────────────────────────────────────
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
};
