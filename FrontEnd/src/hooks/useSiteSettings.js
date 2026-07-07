import { useEffect, useState } from 'react';

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
const API_BASE_URL = 'http://localhost:3000';

function parseHourFromTimeStr(str, fallback) {
  if (!str || typeof str !== 'string') return fallback;
  const h = parseInt(str.split(':')[0], 10);
  return Number.isFinite(h) ? h : fallback;
}

export function useSiteSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [openHour, setOpenHour] = useState(7);
  const [closeHour, setCloseHour] = useState(24);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSiteSettings() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/settings`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

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
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    loadSiteSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, openHour, closeHour, loaded };
}
