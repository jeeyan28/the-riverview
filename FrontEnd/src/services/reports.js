import { API_BASE_URL } from './api';

const BASE = '/api/reports';

export const reportsService = {
  async exportRange(from, to, source = 'all') {
    const qs = new URLSearchParams({ from, to, source });
    const res = await fetch(`${API_BASE_URL}${BASE}/export?${qs.toString()}`, { credentials: 'include' });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || 'Failed to generate report.');
      err.status = res.status;
      throw err;
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `Riverview-Report_${from}_to_${to}.xlsx`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};