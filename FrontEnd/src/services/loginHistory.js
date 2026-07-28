// services/loginHistory.js — wraps /api/login-history, used by Admin/LoginHistory.jsx
import { apiRequest } from './api';

const BASE = '/api/login-history';

export const loginHistoryService = {
  /** @param {{tab?: 'users'|'admin', search?: string, status?: string, page?: number}} [params] */
  list: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.tab) qs.set('tab', params.tab);
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    if (params.page) qs.set('page', params.page);
    const s = qs.toString();
    return apiRequest(`${BASE}${s ? `?${s}` : ''}`, { fallbackMessage: 'Failed to load login history.' });
  },
};