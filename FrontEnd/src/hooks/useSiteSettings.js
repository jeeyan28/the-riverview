import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../services/api';

const DEFAULT_SETTINGS = {
  operatingHours: null,
  holidays: [],
  announcements: [],
  paymentMethods: [],
};

const SiteSettingsContext = createContext(null);

function parseHour(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const hour = Number.parseInt(value.split(':')[0], 10);
  return Number.isFinite(hour) ? hour : fallback;
}

export function SiteSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [openHour, setOpenHour] = useState(7);
  const [closeHour, setCloseHour] = useState(24);
  const [fewSlotsThreshold, setFewSlotsThreshold] = useState(2);
  const [minDuration, setMinDuration] = useState(1);
  const [maxDuration, setMaxDuration] = useState(5);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (request = { cancelled: false }) => {
    try {
      const data = await apiRequest('/api/settings');
      if (request.cancelled) return;

      setSettings(data);
      const hours = data.operatingHours;
      if (hours) {
        const open = parseHour(hours.openTime, 7);
        let close = parseHour(hours.closeTime, 24);
        if (close <= open) close += 24;
        setOpenHour(open);
        setCloseHour(close);

        const threshold = Number(hours.fewSlotsThreshold);
        const minimum = Number(hours.minOnlineDurationHours);
        const maximum = Number(hours.maxOnlineDurationHours);
        if (Number.isFinite(threshold)) setFewSlotsThreshold(threshold);
        if (Number.isFinite(minimum)) setMinDuration(minimum);
        if (Number.isFinite(maximum)) setMaxDuration(maximum);
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (!request.cancelled) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const request = { cancelled: false };
    load(request);
    return () => { request.cancelled = true; };
  }, [load]);

  const refetch = useCallback(() => load({ cancelled: false }), [load]);
  const value = useMemo(() => ({
    settings,
    openHour,
    closeHour,
    fewSlotsThreshold,
    minDuration,
    maxDuration,
    loaded,
    refetch,
  }), [settings, openHour, closeHour, fewSlotsThreshold, minDuration, maxDuration, loaded, refetch]);

  return createElement(SiteSettingsContext.Provider, { value }, children);
}

export function useSiteSettings() {
  const value = useContext(SiteSettingsContext);
  if (!value) throw new Error('useSiteSettings must be used within SiteSettingsProvider.');
  return value;
}
