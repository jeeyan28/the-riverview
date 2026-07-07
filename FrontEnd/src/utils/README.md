# utils/

Small, stateless helper functions with no React and no side effects —
pure input-in, output-out logic. Built alongside whichever phase first
needs them.

Built:

- `resolveImageUrl.js` — BUILT (Phase 8, Home page). Replaces the duplicated
  resolveImageUrl() found in index.js, admin.js, and admin-profile.js.
  Takes an image value from the API and returns either the value unchanged
  (already a full Cloudinary/http(s)/data URL) or prefixes it with
  SERVER_ORIGIN (relative path case). Preserves this exact branching.

- `rooms.js` — BUILT (Phase 8, parts 1–2, Home page). `dateKey()` and
  `getRoomCapacity()` migrated 1:1 from js/index.js. `fetchReservedHours()`
  migrated from loadAvailability(), used by both the Home page's "Fully
  Booked" live-status check and BookingModal's slots step. Part 2 (Booking
  Modal) added: `loadMonthAvailability()`/`clearMonthAvailability()`
  (from loadMonthAvailability()), `clearReservedHours()` (from the
  `delete RESERVED[key]` in payOnlineAutomatically()), `isDayFullyBooked()`,
  `isHolidayDate()`, `isOperatingDay()` (all from the "LIVE SITE SETTINGS"
  section, now taking settings/openHour/closeHour as params instead of
  reading globals), and `computeDownPayment()`.

Still planned:

- `permissions.js` — client-side mirror of Backend/utils/permissions.js
  (PERMISSIONS map, ROLE_PERMISSIONS, hasPermission-style check). This is
  a UX convenience only, for hiding buttons a role can't use — the server
  is always the real authority and re-checks every request regardless.

- `storage.js` — small helper wrapping the "use localStorage if previously
  used, else sessionStorage" pattern seen throughout the old JS
  (riverview_user key), used internally by AuthContext.
