import { apiRequest } from './api';

export const dashboardService = {
  getSummary() {
    return apiRequest('/api/dashboard/summary', { fallbackMessage: 'Failed to load dashboard summary.' });
  },
};