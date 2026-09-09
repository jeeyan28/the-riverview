import { useEffect, useState } from 'react';
import { reportsService } from '../services/reports';
import { businessDate } from '../utils/businessDate';

export { businessDate };

export function daysBefore(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function useRevenueReport(from, to, source) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    reportsService.getRange(from, to, source).then((result) => {
      if (!cancelled) setData(result);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [from, to, source, revision]);

  return { data, loading, error, reload: () => setRevision((value) => value + 1) };
}
