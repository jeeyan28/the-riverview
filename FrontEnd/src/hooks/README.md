# hooks/

Custom React hooks — reusable pieces of *stateful* logic that a plain
utils/ function can't express (because they use useState/useEffect/context
internally). Built as needed starting Phase 7+.

Likely candidates as migration proceeds:

- `useAuth.js` — thin convenience hook wrapping `useContext(AuthContext)`,
  so pages/components write `const { user, logout } = useAuth();` instead
  of importing useContext + AuthContext everywhere.
- `useToast.js` — imperative toast trigger (`showToast(msg, type)`) backed
  by the `<Toast />` component's internal state.
- Possibly `useAvailability.js` if the booking calendar's availability-
  fetching logic (currently ~150 lines in index.js) benefits from being
  extracted out of the Home/Booking page component.

## Status

Built Phase 7:

- `useToast.js` — manages toast message/type/visibility plus the 3200ms
  auto-hide timer, replacing the copy-pasted `showToast()` function that
  used to live separately in login.js, register.js, and reset-password.js.
  Pairs with `components/Toast.jsx` (presentational).

Built Phase 8 (Home page):

- `useSiteSettings.js` — fetches GET /api/settings once (operating hours,
  holidays, announcements), migrated from the SITE_SETTINGS global +
  loadSiteSettings()/applyOperatingHours() in js/index.js. Currently only
  Home.jsx's live "Fully Booked" room-status check consumes
  { openHour, closeHour }; the raw `settings` (holidays/announcements) is
  exposed and ready for the Booking Modal phase (calendar holiday
  blocking) and a later small phase wiring live announcement text into
  <Navbar/> (still Phase 6's static banner text).

Still not created (avoid speculative abstraction ahead of need):

- `useAuth.js` — thin wrapper around AuthContext, for Phase 10.

Resolved (Phase 8, part 2 — Booking Modal): the calendar's month-level
availability caching didn't need a `useAvailability.js` hook after all —
`loadMonthAvailability()` was added to `utils/rooms.js` (plain
fetch+cache, no React state of its own) and `BookingModal.jsx` just calls
it from a `useEffect` keyed on `[step, room, viewDate]`, storing the
result in local component state. No new hook was needed.
