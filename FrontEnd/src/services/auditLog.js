import { apiRequest } from './api';

export const auditLogService = {
  list: (page = 1, filter = 'all') => apiRequest(`/api/audit-logs?page=${page}&filter=${encodeURIComponent(filter)}`, { fallbackMessage: 'Failed to load audit log.' }),
};
