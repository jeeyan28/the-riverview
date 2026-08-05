import { apiRequest } from './api';

export const auditLogService = {
  list: (limit = 50) => apiRequest(`/api/audit-logs?limit=${limit}`, { fallbackMessage: 'Failed to load audit log.' }),
};