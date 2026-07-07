# components/

Small, reusable pieces of UI used across multiple pages — never a full page
itself. Built in Phase 7.

## Status: built this phase

- `Navbar.jsx` — public site header (extracted from MainLayout.jsx, Phase 6)
- `Footer.jsx` — public site footer (extracted from MainLayout.jsx, bonus
  extraction alongside Navbar for consistency)
- `AdminSidebar.jsx` — admin tab navigation (extracted from AdminLayout.jsx,
  Phase 6). Phase 11: now reads real identity (name/avatar/role) and filters
  the three permission-gated nav items (POS, Forecasting, Manage Users) from
  AuthContext, replacing the placeholder "Rivera Admin" text and always-
  visible item list.
- `ThemeToggle.jsx` — dark/light mode toggle button (used by both the
  desktop and mobile copies inside Navbar.jsx)
- `Toast.jsx` — presentational toast (pairs with `hooks/useToast.js`)
- `PasswordInput.jsx` — show/hide toggle input, matches login.css's
  `.input-wrap`/`.toggle-pw` markup
- `Modal.jsx` — generic wrapper for admin.html's `.modal-bg`/`.modal`
  pattern (Manual Booking, Edit Booking, Facility, User, Role modals).
  Does NOT cover the public site's booking modal (`.bk-overlay`/`.bk-modal`)
  or profile modal (`.pf-modal`) — those are page-specific, single-use, and
  will be built directly in their own page components in Phase 8.
- `DataTable.jsx` — generic table matching admin.html's `.tbl` markup,
  columns defined as `{ key, label, render? }`

- `BookingModal.jsx` — built Phase 8, part 2/3 (Home page's booking flow:
  price → calendar → slots → payment → PayMongo return). Matches
  index.html's `.bk-overlay`/`.bk-modal` markup 1:1; controlled by
  Home.jsx via `room`/`returnInfo` props. Uses `utils/rooms.js` for the
  calendar/availability helpers (see that file's own notes) and keeps its
  own small `getStoredUser`/`verifySession` copies rather than a shared
  auth hook, per the "no speculative abstraction ahead of need" note in
  hooks/README.md. AuthContext/useAuth now exists (built Phase 11, for the
  admin panel), but BookingModal.jsx/ProfileModal.jsx haven't been migrated
  onto it yet — that consolidation is still open, not done in Phase 11
  (which scoped to admin-panel auth only; see that phase's resume prompt).

- `ProfileModal.jsx` — built Phase 8, part 3/3 (profile details + change
  password). Matches index.html's `.pf-overlay`/`.pf-modal` markup 1:1.
  Controlled by `MainLayout.jsx` (not Home.jsx — see the component's own
  header comment for why), via `open`/`onClose` props, and opened from
  `Navbar.jsx`'s user-chip "My Profile" button (`onOpenProfile` prop).
  Also keeps its own local `getStoredUser`/`verifySession`/`logoutUser`
  copies, same reasoning as BookingModal.jsx above. One intentional
  deviation from the original: the details-save handler now trusts the
  server's response body (`shapeUser(target)`) instead of optimistically
  echoing back the locally typed values — see the component's header
  comment for details.

## Status: still to build (as needed during Phase 8 page migration)

- `ImageUploadPreview.jsx` — ✅ actually also built this phase (generic
  click-to-upload box matching `.upload-box`, covers both facility images
  and payment QR code images)

Every component built so far is a plain function returning JSX, styled
using only the existing CSS classes already copied into `src/styles/` —
no new CSS framework or new class names were introduced.
