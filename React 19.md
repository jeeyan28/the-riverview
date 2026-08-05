# React 19 + React Router v8 Upgrade Plan

## Why
`react-router-dom@7.18.2` has one remaining high-severity audit flag (RSC-mode CSRF, `GHSA-qwww-vcr4-c8h2`) that doesn't apply to this app (declarative mode, no RSC/actions) but will keep showing up in `npm audit`. The only real fix is React Router v8, which requires `react@19.2.7+` / `react-dom@19.2.7+` and `node@22.22+`. This plan covers that full chain.

## Current → Target

| Package | Current | Target |
|---|---|---|
| `react` / `react-dom` | 18.3.1 | 19.2.7+ |
| `react-router-dom` | 7.18.2 | remove — replaced by `react-router` 8.x |
| `node` (build/dev env) | unspecified | 22.22+ |
| `lucide-react` | 0.462.0 | latest (0.462 does not declare a React 19 peer range) |
| `@vitejs/plugin-react` | 6.0.3 | verify React 19 support, bump if needed |
| `vite` | 8.1.3 | fine — already ahead of the v7+ floor |
| `motion` | 13.0.0 | fine — already React 19-ready |
| `bootstrap`, `chart.js`, `axios` | — | not React-version-coupled, no action needed |

## Phased Plan

Do this in separate, individually-tested steps — not one big commit.

### Phase 1 — Prep on React 18
1. Run `npm install react@18.3 react-dom@18.3` (already close) to surface deprecation warnings.
2. Fix any `defaultProps` usage on function components (removed in 19) — replace with default parameter values.
3. Confirm the app already renders via `ReactDOM.createRoot` in `main.jsx` (required baseline; `ReactDOM.render` is removed in 19). ✅ Verified — already uses `createRoot` + `<React.StrictMode>`.
4. Resolve all console warnings before moving on.

### Phase 2 — React 19
1. `npm install react@19 react-dom@19`.
2. Bump `lucide-react` to a version with a React 19 peer range; re-check every icon import still renders (icon component API has had breaking changes across majors — spot-check `Navbar`, `Footer`, `Home`, admin pages).
3. Bump `@vitejs/plugin-react` if peer resolution complains.
4. Full manual pass: forms, modals (`Modal.jsx`, `BookingModal.jsx`, `ProfileModal.jsx`), the OTP/auth flow, and anything using refs or `useEffect` cleanup timing — React 19's stricter Strict Mode double-invoke can surface previously-silent bugs.
5. Ship and soak this on its own before touching routing.

### Phase 3 — React Router v8
1. `npm uninstall react-router-dom && npm install react-router@latest`.
2. Codemod/find-replace every `from 'react-router-dom'` → `from 'react-router'`. Known call sites from this project: `App.jsx`, `Navbar.jsx`, `Footer.jsx`, `Home.jsx`, `MainLayout.jsx`, `main.jsx` (`BrowserRouter`), plus any Admin pages not yet reviewed (`Bookings.jsx`, `Users.jsx`, etc. likely use `Link`/`useNavigate` too — need to check).
3. `BrowserRouter`, `Routes`, `Route`, `Link`, `Navigate`, `useNavigate`, `useLocation`, `useOutlet`, `useSearchParams` all move to `react-router` as-is in declarative mode — no API changes expected for this app's usage.
4. Run `npm audit` — should be clean.

## Testing Checklist
- [ ] Public site: Home section-scroll nav, Rooms facility filter, Contact page, page-transition animation still fires
- [ ] Auth: login, OTP, forgot password, Google auth
- [ ] Admin: all sidebar routes load, `RequirePermission` redirect still works
- [ ] Booking flow end to end, including PayMongo return handling in `Home.jsx`
- [ ] `npm run build` succeeds with no console errors in preview

## Rollback
Each phase is its own commit/branch. If Phase 2 or 3 breaks something non-trivial, `git revert` that phase's commits — Phase 1 alone is safe to keep regardless.

## Out of Scope
- Adopting React Router's data/framework mode (loaders, actions) — this app has a Node/Express backend already; no reason to move data-fetching into the router.
- Backend (`BackEnd/`) is untouched — this is a frontend-only dependency chain.