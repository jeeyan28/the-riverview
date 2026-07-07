# MIGRATION_PROGRESS.md

## Project Overview
* Original Frontend: HTML, CSS, JavaScript
* New Frontend: React + Vite (JavaScript)
* Backend: Node.js + Express (untouched)
* Database: MongoDB
* Payment: PayMongo
* Uploads: Cloudinary

---

## Overall Migration Completion: ~97%
## Current Phase (Post-Audit Cleanup): In progress — 9 completed, 3 remaining (see Next Task)

---

## Completed & Verified Pages/Features
* App Routing, AdminLayout, MainLayout, Navbar, Footer, AuthLayout — audited.
* AdminSidebar.jsx, Home.jsx, Login.jsx, Register.jsx, ForgotPassword.jsx, ResetPassword.jsx, BookingModal.jsx, ProfileModal.jsx, Dashboard.jsx, Bookings.jsx, Monitor.jsx, Users.jsx, Reports.jsx, Settings.jsx, Analytics.jsx, Forecasting.jsx, Profile.jsx — all audited, admin audit phase 100% complete.
* **Auth pages header/footer alignment bug** — fixed. Scoped `login.css`/`register.css` header/logo/footer selectors to `.auth-*` classes to stop colliding with global `style.css`.
* **Dark-mode fallback bug** — fixed. Restored the missing inline theme-detection script to `frontend-react/index.html`'s `<head>`.
* **Shared confirm-dialog component** — built and wired into Bookings.jsx, Monitor.jsx, Users.jsx (6 call sites), replacing native `confirm()`/`window.confirm()`. Danger/default styling per site was inferred (irreversible deletions = danger) pending verification against original `admin.js`.
* **register.css cleanup** — removed the unused duplicate `.auth-header`/`.auth-logo`/`.auth-footer` block (dead code, zero visual impact).
* **POS service cleanup** — `frontend-react/src/services/pos.js` deleted. Verified orphaned: sole consumer was `Pos.jsx`, already removed in a prior task. Backend `/api/pos/*` routes untouched.
* **ProfileModal.jsx navbar-chip refresh bug** — fixed. Root cause: `ProfileModal.jsx` predates `AuthContext` (Phase 8 vs Phase 11) and only ever updated its own local state + storage on save, never the shared context `Navbar.jsx` reads from. Fix: after a successful details save, `ProfileModal.jsx` now also calls `AuthContext`'s existing `updateUser(patch)` (already built for exactly this purpose per its own header comment) with the server response, so the navbar chip updates immediately without a reload. No other ProfileModal auth logic (verifySession/local storage handling) was touched.
* **Users.jsx route-level permission redirect** — fixed. Root cause: `Users.jsx`'s `admin:manage` `guardPermission()` checks only ran after the page had already mounted, so direct URL entry without that permission showed a blank page (an alert fired, nothing loaded), not a redirect. Fix: added a small `RequirePermission` wrapper in `App.jsx` only (reuses `AuthContext`'s existing `hasPermission()`), wrapping just the `/admin/users` route; redirects to `/admin/dashboard` if the permission is missing. `Users.jsx`, `AdminLayout.jsx`, and every other route were left untouched — `admin:manage` is a finer-grained permission than `AdminLayout`'s existing `isAdmin` role gate, so it couldn't be folded into that shared check without affecting all `/admin/*` routes.
* **Bookings.jsx Manual Booking date-field default** — fixed, per your decision. Was empty on open (original hardcoded a stale demo date, not worth replicating). Now defaults to today's date via a small self-contained `todayDateStr()` helper (zero-padded `YYYY-MM-DD`, matching the native `<input type="date">`'s required format) rather than reusing `utils/rooms.js`'s `dateKey()`, since that helper's output format wasn't part of this task's verified files. No reset-on-reopen behavior was added — this matches the field's (and every other field's) existing convention of only resetting after a successful submit, not on every open.
* **Settings.jsx dead-code cleanup** — fixed, per your decision. Deleted `PricingTab`, `PromotionTab`, `PaymentMethodsTab` (plus supporting `PRICING_BASE_RATES`, `ACTIVE_PROMOTIONS`, `emptyPaymentMethodForm()`) — all had been unreferenced since a prior tab-scope trim matched `SETTINGS_TABS` to admin.html's actual 3-tab bar. Confirmed no other code in the file (or its imports) depended on them before deleting; all remaining imports (`ImageUploadPreview`, `resolveImageUrl`, `useCallback`, etc.) still have live usages elsewhere in the file. **Flagged before deleting, per your explicit confirmation:** unlike the purely decorative Pricing/Promotion tabs, `PaymentMethodsTab` was real, backend-wired functionality (Cloudinary QR uploads, full CRUD against `/api/settings/payment-methods`) whose tab button's disappearance from `admin.html` looks like an accidental regression upstream, not an intentional removal — you confirmed deleting it anyway. `services/settings.js`'s `addPaymentMethod`/`updatePaymentMethod`/`removePaymentMethod` functions were left untouched (out of scope for this task) in case that upstream regression is ever fixed and the tab needs rebuilding. Stale header comments describing the old "left defined, not deleted" state were also corrected to reflect the actual deletion.

## Removed Features (by product decision)
* POS (Point of Sale) — removed from React frontend (page + service). Backend `/api/pos/*` untouched.
* Settings: Pricing / Promotion / Payment Methods tabs — code deleted outright (see Completed section above for details); UI was already unreachable before this cleanup.

---

## Known Issues (Unresolved)
* **Dashboard.jsx** — four metric cards hardcoded, matching original (not a regression). "Login Logs" links to permanent `TempPage`.
* **Reports.jsx / Analytics.jsx** — non-functional/mock by design, not bugs.
* **Forecasting.jsx** — `forecasting:view` permission gating deferred client-side; server-side `requirePermission` still enforces Owner-only access.
* **Profile.jsx** — `profile-role` permanently static text; Email field editable but never sent on save. Both match original's real (if odd) behavior.
* **ConfirmDialog danger/default styling** — assigned by inference, not verified against original `admin.js`. Low-risk, visual-only if wrong.

---

## Files Modified (cumulative)
* frontend-react/src/App.jsx
* frontend-react/src/context/AuthContext.jsx
* frontend-react/src/layouts/MainLayout.jsx
* frontend-react/src/layouts/AuthLayout.jsx
* frontend-react/src/components/AdminSidebar.jsx
* frontend-react/src/components/Navbar.jsx
* frontend-react/src/components/BookingModal.jsx
* frontend-react/src/components/ProfileModal.jsx
* frontend-react/src/pages/Admin/Bookings.jsx
* frontend-react/src/pages/Admin/Monitor.jsx
* frontend-react/src/pages/Admin/Users.jsx
* frontend-react/src/pages/Admin/Settings.jsx
* frontend-react/src/pages/Admin/Forecasting.jsx
* frontend-react/src/pages/Admin/Profile.jsx
* frontend-react/src/styles/login.css
* frontend-react/src/styles/register.css
* frontend-react/index.html

## Files Created (cumulative)
* frontend-react/src/components/ConfirmDialog.jsx
* frontend-react/src/hooks/useConfirm.js
* frontend-react/src/styles/confirm-dialog.css

## Files Deleted (cumulative)
* frontend-react/src/pages/Admin/Pos.jsx
* frontend-react/src/services/pos.js

---

## Next Task
Remaining follow-ups — all need either a decision from you or files not yet provided:
1. **Backend POS cleanup** (`/api/pos/*`) — needs your explicit go-ahead (backend change)
2. **Final smoke-test / production build check** — needs full project access
3. **Verify ConfirmDialog danger/default assignments** — needs original `admin.js` if available

---

## Rules
* Never modify Backend (unless explicitly requested).
* Never change API endpoints.
* Never redesign UI.
* Fix only confirmed bugs.
* Request only the minimum files required.
* Work in small resumable tasks.
* Stop after every completed task.