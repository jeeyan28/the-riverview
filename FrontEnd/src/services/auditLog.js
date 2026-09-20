import { apiRequest } from './api';

export const auditLogService = {
  list: (page = 1) => apiRequest(`/api/audit-logs?page=${page}`, { fallbackMessage: 'Failed to load audit log.' }),
};
