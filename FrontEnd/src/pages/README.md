# pages/

One file (or folder) per route — the top-level screen a URL renders. Built
across Phases 6, 8.

Planned pages (mapped 1:1 from the old .html files):

- `Home.jsx`             ← index.html      (route: /)  — BUILT (Phase 8,
    parts 1–2/3): hero carousel, live room grid, Spaces, About (part 1),
    plus the booking modal — price → calendar → slots → payment → PayMongo
    return (part 2), built as `components/BookingModal.jsx` and rendered
    from Home.jsx. `handleSelectRoom()` now opens it for real. Still
    missing from the old index.html and deferred to its own phase: the
    profile modal (details + change password) — likely
    `components/ProfileModal.jsx`, opened from the user-chip menu in
    `<Navbar/>` (Phase 8, part 3/3).
- `Login.jsx`            ← login.html      (route: /login)
- `Register.jsx`         ← register.html   (route: /register)
- `ForgotPassword.jsx`   ← forgot-password.html (route: /forgot-password)
- `ResetPassword.jsx`    ← reset-password.html  (route: /reset-password/:token)
- `Admin/` (folder)      ← admin.html panels, one file per panel:
  - `Dashboard.jsx`   ← panel-dashboard — BUILT (Phase 8, admin part 1). Live
      Recent Bookings + Room Status; the 4 metric cards stay as the
      hardcoded placeholders they always were in admin.html (no live
      endpoint for them yet, esp. Today's Revenue — needs POS data).
      Quick Actions navigate via react-router instead of switchPanel().
  - `Bookings.jsx`    ← panel-bookings — BUILT (Phase 8, admin part 1).
      Full filter set (search/status/paymentStatus/room/date), the 4
      modals (Manual Booking / Edit Booking / Booking Details / Payment
      Screenshot), and the booking calendar. Fixed 2 real bugs along the
      way: the room filter dropdown never had options wired in, and the
      whole booking calendar had matching CSS/markup but no JS anywhere in
      admin.js — see the file's own header comment for details.
  - `Monitor.jsx`     ← panel-monitor — BUILT (Phase 8, admin part 2). Live
      1s countdown ticker per occupied room, auto-reset to Available on
      expiry, Assign Walk-in / End Session actions. The original built its
      Assign Walk-in modal by injecting raw DOM into document.body on
      first use (no admin.html markup for it existed) — here it's just
      ordinary JSX using the shared <Modal/>, same end result.
  - `Pos.jsx`         ← panel-pos
  - `Analytics.jsx`   ← panel-analytics — BUILT (Phase 8, admin part 7).
      Mock-data charts (Chart.js), ported as-is — see the file's own header
      comment for why this is intentionally not wired to a real endpoint.
  - `Reports.jsx`     ← panel-reports — BUILT (Phase 8, admin part 9). Fully
      static/decorative in the original — no report/export endpoint exists
      anywhere in the backend, and admin.js has zero wiring for any of the
      six "Export" buttons or "Generate Report" (no onclick, no handler
      function, nothing). Ported as an honest 1:1 static port: same
      hardcoded card labels/dates/date-range defaults, buttons present but
      intentionally non-functional, matching what was actually there. See
      the file's own header comment. Real reporting is a future feature,
      not something this phase invented.
  - `Forecasting.jsx` ← panel-forecasting
  - `Users.jsx`       ← panel-users — BUILT (Phase 8, admin part 8). Search/
      role filter, Add User + Change Role modals, activate/deactivate,
      delete. One deliberate improvement over the original: row-level
      "can I manage this account" now reads `canManage` straight off the
      GET /api/users response (the server already computed this and the
      legacy frontend just never used it) instead of re-deriving it
      client-side from a global session-admin object — see the file's own
      header comment for details. `panel-logs` (Login History) is *not*
      built as its own page — the original panel is itself just a static
      "not tracked yet" notice pointing at this page's Last Login column,
      so there's no real content to port; `/admin/logs` keeps its
      TempPage placeholder in App.jsx.
  - `Logs.jsx`        ← panel-logs (not planned as a separate file — see
      Users.jsx note above; revisit only if a real login-audit feature
      gets built)
  - `Settings.jsx`    ← panel-settings — IN PROGRESS (Phase 8, part 10a of
      several — this panel has 6 sub-tabs and is being built in slices):
        - Part 10a (BUILT): tab-switching shell (all 6 tabs render/click)
          + Facilities tab, full CRUD via GET/POST/PUT/DELETE /api/rooms,
          including pricing tiers, feature chips, and image upload (reuses
          components/ImageUploadPreview.jsx).
        - Part 10b (planned): Operating Schedule + Holiday & Closure Dates
          — these live inside the Facilities subpanel below the grid in
          the original markup, not their own tab.
        - Part 10c (planned): Announcements tab.
        - Part 10d (planned): Payment Methods tab (QR upload).
        - Part 10e (planned): Pricing / Promotion / Audit Log tabs — all
          three are entirely static/decorative in the original (no
          backend support), same situation as Reports.jsx.
      See the file's own header comment for full details.
  - `Profile.jsx`     ← panel-profile

Pages compose components from `src/components/` and fetch data via
`src/services/`. Pages should contain page-specific logic only — anything
reused across two or more pages belongs in `components/` or `hooks/` instead.
