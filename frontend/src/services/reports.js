import { apiDownload, apiRequest } from './api';

const BASE = '/api/reports';

export const reportsService = {
  getConfirmedBookingTrend(interval) {
    return apiRequest(`${BASE}/confirmed-booking-trend?interval=${encodeURIComponent(interval)}`, { fallbackMessage: 'Could not load confirmed reservations.' });
  },
  getRange(from, to, source = 'all', options = {}) {
    const qs = new URLSearchParams({ from, to, source });
    return apiRequest(`${BASE}?${qs}`, { ...options, fallbackMessage: 'Could not load sales for this date range.' });
  },

  exportRange(from, to, source = 'all') {
    const qs = new URLSearchParams({ from, to, source });
    return apiDownload(`${BASE}/export?${qs}`, {
      filename: `Riverview-Report_${from}_to_${to}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fallbackMessage: 'Failed to generate report.',
    });
  },
};
