import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api';

// useSiteSettings — migrated from the SITE_SETTINGS global + loadSiteSettings()
// + applyOperatingHours() in the old js/index.js ("LIVE SITE SETTINGS" section).
//
// GET /api/settings is public (no login required) and returns operating
// hours, holidays, and admin-managed announcements. The original code kept
// this in one global object that several unrelated features read from
// (the room-status "fully booked" check, the booking calendar's holiday
// blocking, and the announcement banner text). Extracted into a hook here
// — instead of copy-pasted fetches — so every page/component that needs any
// of this data shares one request and one in-memory copy.
//
// THIS PHASE (Home page) only consumes { openHour, closeHour } for the
// live "Fully Booked" room-status check. `settings` (raw holidays/
// announcements) is exposed now so it's ready for:
//   - the Booking modal phase (calendar holiday blocking), and
//   - a later small phase wiring live announcement text into <Navbar/>
//     (currently still the static banner text from Phase 6/7).
// Falls back to the same defaults as the original (7am–12am, no holidays,
// no announcements) if the request fails, so the homepage never breaks
// because this endpoint is briefly unreachable.
const DEFAULT_SETTINGS = { operatingHours: null, holidays: [], announcements: [], paymentMethods: [] };

function parseHourFromTimeStr(str, fallback) {
  if (!str || typeof str !== 'string') return fallback;
  const h = parseInt(str.split(':')[0], 10);
  return Number.isFinite(h) ? h : fallback;
}

export function useSiteSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [openHour, setOpenHour] = useState(7);
  const [closeHour, setCloseHour] = useState(24);
  const [fewSlotsThreshold, setFewSlotsThreshold] = useState(2);
  const [minDuration, setMinDuration] = useState(1);
  const [maxDuration, setMaxDuration] = useState(5);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = { cancelled: false };
    loadSiteSettings(controller);
    return () => {
      controller.cancelled = true;
    };
  }, []);

  // Shared by the mount-time load and refetch() below so both apply the
  // same parsing/fallback logic and there's one place that writes state.
  async function loadSiteSettings(controller) {
    try {
      const data = await apiRequest('/api/settings');
      if (controller.cancelled) return;

      setSettings(data);

      const oh = data.operatingHours;
      if (oh) {
        const open = parseHourFromTimeStr(oh.openTime, 7);
        let close = parseHourFromTimeStr(oh.closeTime, 24);
        // "00:00" closing means midnight — treat as end-of-day (24) so
        // hour-range loops (`for (h = open; h < close; h++)`) still work.
        if (close <= open) close += 24;
        setOpenHour(open);
        setCloseHour(close);
        if (Number.isFinite(Number(oh.fewSlotsThreshold))) {
          setFewSlotsThreshold(Number(oh.fewSlotsThreshold));
        }
        if (Number.isFinite(Number(oh.minOnlineDurationHours))) {
          setMinDuration(Number(oh.minOnlineDurationHours));
        }
        if (Number.isFinite(Number(oh.maxOnlineDurationHours))) {
          setMaxDuration(Number(oh.maxOnlineDurationHours));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!controller.cancelled) setLoaded(true);
    }
  }

  // Re-fetches on demand — mirrors the room-by-id refetch in Home.jsx's
  // handleSelectRoom. The mount-time fetch alone goes stale if an admin
  // changes operating hours/threshold while the page is already open;
  // callers that gate a booking action (e.g. opening the booking modal)
  // should call this first so the flow starts on current data.
  function refetch() {
    return loadSiteSettings({ cancelled: false });
  }

  return { settings, openHour, closeHour, fewSlotsThreshold, minDuration, maxDuration, loaded, refetch };
}