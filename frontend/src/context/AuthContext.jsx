import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../services/auth';

const STORAGE_KEY = 'riverview_user';

const ROLE_LABELS = { user: 'User', staff: 'Staff', manager: 'Supervisor', super_admin: 'Owner' };
const ROLE_LEVEL = { user: 0, staff: 1, manager: 2, super_admin: 3 };
const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];
const SESSION_CHECK_TIMEOUT_MS = 8000;

function parseStoredUser(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStoredUser() {
  try {
    return parseStoredUser(sessionStorage) || parseStoredUser(localStorage);
  } catch {
    return null;
  }
}

function replaceStoredUser(user, storage) {
  clearStoredUser();
  if (user) storage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function writeStoredUser(user) {
  try {
    replaceStoredUser(user, localStorage);
  } catch {
    // Authentication still works when browser storage is unavailable.
  }
}

function clearStoredUser() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [initializing, setInitializing] = useState(true);

  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const sessionRequestRef = useRef(null);

  const commitUser = useCallback(freshUser => {
    setUser(freshUser);
    if (freshUser) writeStoredUser(freshUser);
    else clearStoredUser();
  }, []);

  const beginSessionChange = useCallback(() => {
    sessionRequestRef.current?.abort();
    sessionRequestRef.current = null;
    return ++revisionRef.current;
  }, []);

  const revalidate = useCallback(async () => {
    const revision = beginSessionChange();
    const controller = new AbortController();
    sessionRequestRef.current = controller;
    const isCurrent = () => mountedRef.current && revision === revisionRef.current;
    try {
      const freshUser = await authService.me({ signal: controller.signal, timeoutMs: SESSION_CHECK_TIMEOUT_MS });
      if (!isCurrent()) return null;
      commitUser(freshUser);
      return freshUser;
    } catch (error) {
      if (!isCurrent() || controller.signal.aborted) return null;
      const cachedUser = [401, 403].includes(error.status) ? null : readStoredUser();
      commitUser(cachedUser);
      return cachedUser;
    } finally {
      if (sessionRequestRef.current === controller) sessionRequestRef.current = null;
      if (isCurrent()) setInitializing(false);
    }
  }, [beginSessionChange, commitUser]);

  useEffect(() => {
    mountedRef.current = true;
    revalidate();
    function handlePageShow(event) {
      if (event.persisted) revalidate();
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      mountedRef.current = false;
      beginSessionChange();
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [revalidate, beginSessionChange]);

  const signIn = useCallback(async request => {
    const revision = beginSessionChange();
    try {
      const freshUser = await request();
      if (mountedRef.current && revision === revisionRef.current) commitUser(freshUser);
      return freshUser;
    } finally {
      if (mountedRef.current && revision === revisionRef.current) setInitializing(false);
    }
  }, [beginSessionChange, commitUser]);

  const login = useCallback((email, password) => signIn(() => authService.login(email, password)), [signIn]);
  const loginWithGoogle = useCallback(code => signIn(() => authService.loginWithGoogle(code)), [signIn]);
  const register = useCallback(authService.register, []);
  const verifyRegistrationOtp = useCallback(authService.verifyRegistrationOtp, []);
  const resendRegistrationOtp = useCallback(authService.resendRegistrationOtp, []);
  const resendAccountVerification = useCallback(authService.resendAccountVerification, []);
  const verifyAccountOtp = useCallback(authService.verifyAccountOtp, []);

  const invalidateSession = useCallback(() => {
    beginSessionChange();
    commitUser(null);
    setInitializing(false);
  }, [beginSessionChange, commitUser]);

  const logout = useCallback(async () => {
    const revision = beginSessionChange();
    await authService.logout();
    if (mountedRef.current && revision === revisionRef.current) {
      commitUser(null);
      setInitializing(false);
    }
  }, [beginSessionChange, commitUser]);

  const updateUser = useCallback((patch) => {
    beginSessionChange();
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      writeStoredUser(next);
      return next;
    });
  }, [beginSessionChange]);

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const hasPermission = useCallback(
    (permission) => !!user && Array.isArray(user.permissions) && user.permissions.includes(permission),
    [user]
  );

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
      invalidateSession,
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
      invalidateSession,
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
