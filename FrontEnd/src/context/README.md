# context/

React Context providers — for state that many unrelated components need
without passing props down manually through every level ("prop drilling").
Built in Phase 10 (this README), implemented in Phase 11.

- `AuthContext.jsx` — the single source of truth for "who is logged in."
  Replaces the independent `localStorage.getItem('riverview_user')` /
  `sessionStorage.getItem('riverview_user')` reads that used to live
  separately in admin.js and admin-profile.js (Profile.jsx was migrated
  onto this context in Phase 11; Login.jsx/Register.jsx still write to
  storage directly with their own fetch calls — not yet migrated onto
  this context's `login()`/`register()`, see Phase 11's resume prompt).
  Exposes:
    - `user` — the current sanitized user object (or null), revalidated
      against `GET /api/auth/me` once on app mount (see the file's own
      header comment for why /api/auth/me, not the cached storage value,
      is treated as the source of truth)
    - `initializing` — true until that first revalidation resolves
    - `isAdmin`, `roleLabel`, `roleLevel`
    - `hasPermission(permission)` / `guardPermission(permission, message)`
      — direct ports of admin.js's same-named functions, reading the
      real `user.permissions` array the backend already provides instead
      of a re-mirrored permissions table
    - `login(email, password, rememberMe)` / `loginWithGoogle(idToken, rememberMe)`
    - `logout()`
    - `register(formData)`
    - `updateUser(patch)` — merges into `user` and syncs storage without
      a network round-trip (used by Profile.jsx after a successful save)

Only one context is planned for this project — no global state library is
needed given the app's size.

Route guarding (redirect to /login for unauthenticated/non-admin access to
any /admin/* route) is implemented centrally in `src/layouts/AdminLayout.jsx`
using this context's `initializing`/`isAdmin`, not inside this file.

