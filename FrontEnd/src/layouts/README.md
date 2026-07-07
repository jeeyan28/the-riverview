# layouts/

Wrapper components that provide shared "shell" UI (nav, sidebar, footer)
around a set of pages, using React Router's nested-route `<Outlet />`
pattern. Built in Phase 6.

Planned layouts:

- `PublicLayout.jsx` — wraps Home, Login, Register, ForgotPassword,
  ResetPassword. Renders the public Navbar + Footer once, with the current
  page's content in the middle via `<Outlet />`.
- `AdminLayout.jsx` — wraps every Admin/* page. Renders the admin sidebar
  (tab navigation, replacing admin.html's panel-switching buttons) once,
  with the current panel's content via `<Outlet />`. Phase 11 added the
  route guard here directly (redirects to /login if AuthContext's
  `isAdmin` is false, once `initializing` resolves) rather than as a
  separate `AdminRoute` wrapper component — one small `if` at the top of
  an already-small layout didn't justify a new file.

Why this matters: in the old admin.html, every panel lived inside one giant
866-line file with manual show/hide. Splitting into a layout + nested routes
means each panel becomes its own small, independently testable page file.
