// services/activeSessions.js — wraps /api/active-sessions, used by Admin/ActiveSessions.jsx
import { apiRequest } from './api';

const BASE = '/api/active-sessions';

export const activeSessionsService = {
  list: () => apiRequest(BASE, { fallbackMessage: 'Failed to load active sessions.' }),
};
