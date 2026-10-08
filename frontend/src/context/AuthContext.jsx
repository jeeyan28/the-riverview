import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authService } from '../services/auth';
import { clearReservationDraft, clearCheckoutState } from '../utils/reservationDraft';

const STORAGE_KEY = 'riverview_user';

const ROLE_LABELS = { user: 'User', staff: 'Staff', manager: 'Supervisor', super_admin: 'Owner' };
const ROLE_LEVEL = { user: 0, staff: 1, manager: 2, super_admin: 3 };
const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];
const SESSION_CHECK_TIMEOUT_MS = 8000;
const SESSION_ERROR_MESSAGE = 'We could not verify your session right now. Try again.';
const LOGOUT_ERROR_MESSAGE = 'We could not sign you out. Please try again.';

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
  const [sessionStatus, setSessionStatus] = useState('checking');
  const [sessionError, setSessionError] = useState(null);
  const [logoutError, setLogoutError] = useState(null);

  const mountedRef = useRef(true);
  const revisionRef = useRef(0);
  const sessionRequestRef = useRef(null);
  const userRef = useRef(user);
  const sessionStatusRef = useRef('checking');

  const commitUser = useCallback(freshUser => {
    userRef.current = freshUser;
    setUser(freshUser);
    if (freshUser) writeStoredUser(freshUser);
    else clearStoredUser();
  }, []);

  const commitSessionStatus = useCallback((status, error = null) => {
    sessionStatusRef.current = status;
    setSessionStatus(status);
    setSessionError(error);
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
    commitSessionStatus('checking');
    const isCurrent = () => mountedRef.current && revision === revisionRef.current;
    try {
      const freshUser = await authService.me({ signal: controller.signal, timeoutMs: SESSION_CHECK_TIMEOUT_MS });
      if (!isCurrent()) return null;
      commitUser(freshUser);
      commitSessionStatus('verified');
      return freshUser;
    } catch (error) {
      if (!isCurrent() || controller.signal.aborted) return null;
      if ([401, 403].includes(error.status)) {
        commitUser(null);
        commitSessionStatus('anonymous');
        setLogoutError(null);
        return null;
      }
      commitSessionStatus('unavailable', SESSION_ERROR_MESSAGE);
      return userRef.current;
    } finally {
      if (sessionRequestRef.current === controller) sessionRequestRef.current = null;
      if (isCurrent()) setInitializing(false);
    }
  }, [beginSessionChange, commitUser, commitSessionStatus]);

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
    commitSessionStatus('checking');
    try {
      const freshUser = await request();
      if (mountedRef.current && revision === revisionRef.current) {
        commitUser(freshUser);
        commitSessionStatus('verified');
        setLogoutError(null);
      }
      return freshUser;
    } catch (error) {
      if (mountedRef.current && revision === revisionRef.current) {
        const anonymous = !userRef.current && [401, 403].includes(error.status);
        commitSessionStatus(anonymous ? 'anonymous' : 'unavailable', anonymous ? null : SESSION_ERROR_MESSAGE);
      }
      throw error;
    } finally {
      if (mountedRef.current && revision === revisionRef.current) setInitializing(false);
    }
  }, [beginSessionChange, commitUser, commitSessionStatus]);

  const login = useCallback((email, password) => signIn(() => authService.login(email, password)), [signIn]);
  const loginWithGoogle = useCallback(code => signIn(() => authService.loginWithGoogle(code)), [signIn]);
  const register = useCallback((...args) => authService.register(...args), []);
  const verifyRegistrationOtp = useCallback((...args) => authService.verifyRegistrationOtp(...args), []);
  const resendRegistrationOtp = useCallback((...args) => authService.resendRegistrationOtp(...args), []);
  const resendAccountVerification = useCallback((...args) => authService.resendAccountVerification(...args), []);
  const verifyAccountOtp = useCallback((...args) => authService.verifyAccountOtp(...args), []);

  const invalidateSession = useCallback(() => {
    beginSessionChange();
    commitUser(null);
    commitSessionStatus('anonymous');
    setLogoutError(null);
    setInitializing(false);
  }, [beginSessionChange, commitUser, commitSessionStatus]);

  const logout = useCallback(async () => {
    const revision = beginSessionChange();
    setLogoutError(null);
    try {
      await authService.logout();
      if (mountedRef.current && revision === revisionRef.current) {
        clearReservationDraft();
        clearCheckoutState();
        commitUser(null);
        commitSessionStatus('anonymous');
      }
    } catch (error) {
      if (mountedRef.current && revision === revisionRef.current) {
        setLogoutError(LOGOUT_ERROR_MESSAGE);
        if (sessionStatusRef.current === 'checking') commitSessionStatus('unavailable', SESSION_ERROR_MESSAGE);
      }
      throw error;
    } finally {
      if (mountedRef.current && revision === revisionRef.current) setInitializing(false);
    }
  }, [beginSessionChange, commitUser, commitSessionStatus]);

  const updateUser = useCallback((patch) => {
    beginSessionChange();
    if (userRef.current) commitUser({ ...userRef.current, ...patch });
    if (sessionStatusRef.current === 'checking') commitSessionStatus('unavailable', SESSION_ERROR_MESSAGE);
    setInitializing(false);
  }, [beginSessionChange, commitUser, commitSessionStatus]);

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  const verifySession = useCallback(async () => { await revalidate(); return sessionStatusRef.current === 'verified'; }, [revalidate]);

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
      sessionStatus,
      sessionError,
      logoutError,
      sessionVerified: sessionStatus === 'verified',
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
      verifySession,
    }),
    [
      user,
      initializing,
      sessionStatus,
      sessionError,
      logoutError,
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
      verifySession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used within an <AuthProvider>.');
  return ctx;
}
