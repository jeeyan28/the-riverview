import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../services/api';

// ─────────────────────────────────────────────────────────────────────────
// ── DESIGN DECISION: source of truth on mount ──────────────────────────
// admin.js's guardAdminPage() always called GET /api/auth/me on every
// admin page load — it never trusted the cached localStorage/sessionStorage
// value alone. This context does the same, for two concrete reasons found
// by re-checking both ends before writing this file:
//
//   1. Backend/routes/auth.js's sanitizeUser() (what login/register/google
//      responses AND /api/auth/me all return) already includes `role`,
//      `roleLabel`, and — for admin roles — a real `permissions` array
//      straight from utils/permissions.js's getEffectivePermissions(). So
//      the object Login.jsx/Register.jsx already write to storage under
//      'riverview_user' is the *same shape* /api/auth/me returns — good,
//      no missing-fields problem either way.
//   2. But the stored copy is still just a display cache written once at
//      login time. It goes stale the moment a session is revoked
//      server-side (logout in another tab, an Owner deactivating the
//      account, the cookie expiring) or a Supervisor/Owner changes this
//      user's role from the Manage Users panel mid-session. admin.js's own
//      comment on ROLE_PERMISSIONS says the client copy "can never grant
//      real access" specifically because every route re-checks
//      server-side — trusting a possibly-stale cached role for UI gating
//      undermines that guarantee's whole point (someone could look like a
//      Supervisor in the sidebar for the rest of a long session after
//      being demoted to Staff).
//
// So: on mount, this context hydrates FAST from storage (so the UI has
// something to paint immediately, avoiding a blank flash) but immediately
// fires GET /api/auth/me in the background and replaces `user` with
// whatever comes back — including replacing it with null (logged out) if
// the call fails. That /api/auth/me response is what everything in the
// app should treat as authoritative; the storage read is a paint-time
// convenience only, exactly as admin.js's own comment already described
// the storage value ("a UX convenience only").
//
// ── DESIGN DECISION: route guarding ─────────────────────────────────────
// guardAdminPage() redirected with `window.location.href = 'login.html'`
// on any failure. No migrated page currently guards a route (this is new
// behavior for the React app). Implemented centrally, once, in
// AdminLayout.jsx (wrapping <Outlet/>) rather than per-page — see that
// file's header comment for the redirect itself. This context only
// exposes the pieces AdminLayout needs to decide: `user`, `initializing`,
// and `isAdmin`.
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'riverview_user';

const ROLE_LABELS = { user: 'User', staff: 'Staff', manager: 'Supervisor', super_admin: 'Owner' };
const ROLE_LEVEL = { user: 0, staff: 1, manager: 2, super_admin: 3 };
const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];

function readStoredUser() {
  const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Writes back to whichever storage already held the value (localStorage if
// "remember me" was checked at login, sessionStorage otherwise) — same
// convention Profile.jsx's saveStoredAdmin() used pre-context.
function writeStoredUser(user) {
  const area = localStorage.getItem(STORAGE_KEY) ? localStorage : sessionStorage;
  if (user) area.setItem(STORAGE_KEY, JSON.stringify(user));
}

function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  // True only until the first /api/auth/me revalidation resolves (success
  // or failure). AdminLayout's route guard waits on this before deciding
  // to redirect, so a logged-in admin doing a hard refresh never gets
  // bounced to /login just because the network call hasn't returned yet.
  const [initializing, setInitializing] = useState(true);

  const revalidate = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
      if (!res.ok) throw new Error('not authenticated');
      const { user: freshUser } = await res.json();
      setUser(freshUser);
      writeStoredUser(freshUser);
      return freshUser;
    } catch {
      // Matches guardAdminPage()'s behavior: any failure means "treat as
      // logged out." Clear the stale cache too, so a future fast-paint
      // read doesn't resurrect a dead session.
      setUser(null);
      clearStoredUser();
      return null;
    } finally {
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    revalidate();
    // Intentionally run once on mount only — this matches guardAdminPage(),
    // which ran once per admin page load. Login()/logout() below update
    // `user` directly instead of re-triggering this effect.
  }, [revalidate]);

  const login = useCallback(async (email, password, rememberMe) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Login failed.');
      err.status = res.status; // preserves the 423 account-locked check Login.jsx makes
      // Part 8: lets LoginForm branch to its "resend verification" state
      // instead of just showing the message as a dead-end toast.
      err.unverified = !!data.unverified;
      throw err;
    }
    setUser(data.user);
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(STORAGE_KEY, JSON.stringify(data.user));
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(async (idToken, rememberMe) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Google sign-in failed.');
    setUser(data.user);
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(STORAGE_KEY, JSON.stringify(data.user));
    return data.user;
  }, []);

  const register = useCallback(async (formData) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Mirrors login()'s err.status attachment (Phase 13) — lets a caller
      // reliably tell "server responded with an error" (has a numeric
      // status) apart from a genuine network failure (fetch itself threw,
      // so this line never runs), rather than duck-typing on
      // `instanceof TypeError`.
      const err = new Error(data.message || 'Registration failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

  // Part 5: confirms a PendingRegistration's OTP and (per routes/auth.js)
  // creates the real, verified User in the same call. Mirrors register()'s
  // err.status attachment so RegisterForm.jsx can branch on it the same way.
  const verifyRegistrationOtp = useCallback(async (email, otp) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register/verify-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Verification failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

  // Part 6: requests a fresh OTP for a PendingRegistration (server enforces
  // the 60s cooldown and the 5/hour per-email cap either way — this is just
  // the call, not the throttling itself).
  const resendRegistrationOtp = useCallback(async (email) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/register/resend-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Could not resend the code.');
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

  // Part 8: resend a verification code for an existing-but-unverified
  // account (shown from LoginForm's "Please verify your email" state).
  // Distinct from resendRegistrationOtp above, which targets a
  // PendingRegistration that no longer exists once an account is created.
  const resendAccountVerification = useCallback(async (email) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Could not resend the code.');
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

  // Part 8 counterpart to verifyRegistrationOtp: confirms the code sent by
  // resendAccountVerification and flips the account to isVerified. Does
  // not log the user in — LoginForm re-submits the login form afterward.
  const verifyAccountOtp = useCallback(async (email, otp) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/verify-account-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Verification failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      // Same order as admin.js's #admin-logout-btn handler: clear storage
      // even if the network call fails, so the UI doesn't strand someone
      // in a "looks logged in" state.
      clearStoredUser();
      setUser(null);
    }
  }, []);

  // Lets a page (Profile.jsx, after a successful save) update the shared
  // user object without a full /api/auth/me round-trip, while keeping
  // storage in sync. Does NOT hit the network itself.
  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      writeStoredUser(next);
      return next;
    });
  }, []);

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  // Direct port of admin.js's hasAdminPermission(), reading the real
  // server-provided permissions array instead of a re-mirrored table —
  // see the file-header note on ROLE_LABELS/ROLE_LEVEL above for why.
  const hasPermission = useCallback(
    (permission) => !!user && Array.isArray(user.permissions) && user.permissions.includes(permission),
    [user]
  );

  // Direct port of admin.js's guardPermission(): same "show an alert and
  // return false" UX for click-handlers that need to bail out early,
  // preserved so every DEFERRED call site ported in Phase 12 can drop in
  // unchanged.
  const guardPermission = useCallback(
    (permission, message) => {
      if (hasPermission(permission)) return true;
      alert(message || "You don't have permission to do that.");
      return false;
    },
    [hasPermission]
  );

  const value = useMemo(
    () => ({
      user,
      initializing,
      isAdmin,
      roleLabel: user ? user.roleLabel || ROLE_LABELS[user.role] || user.role : null,
      roleLevel: user ? ROLE_LEVEL[user.role] ?? -1 : -1,
      hasPermission,
      guardPermission,
      login,
      loginWithGoogle,
      register,
      verifyRegistrationOtp,
      resendRegistrationOtp,
      resendAccountVerification,
      verifyAccountOtp,
      logout,
      updateUser,
      revalidate,
    }),
    [
      user,
      initializing,
      isAdmin,
      hasPermission,
      guardPermission,
      login,
      loginWithGoogle,
      register,
      verifyRegistrationOtp,
      resendRegistrationOtp,
      resendAccountVerification,
      verifyAccountOtp,
      logout,
      updateUser,
      revalidate,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within an <AuthProvider>.');
  return ctx;
}