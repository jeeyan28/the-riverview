import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL } from '../services/api';


const STORAGE_KEY = 'riverview_user';

const ROLE_LABELS = { user: 'User', staff: 'Staff', manager: 'Supervisor', super_admin: 'Owner' };
const ROLE_LEVEL = { user: 0, staff: 1, manager: 2, super_admin: 3 };
const ADMIN_ROLES = ['staff', 'manager', 'super_admin'];
const SESSION_CHECK_TIMEOUT_MS = 8000;

function parseStoredUser(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readStoredUser() {
  // A tab-scoped login is the newest explicit choice for this tab. Older
  // versions could leave a guest in localStorage and an account in
  // sessionStorage, so reading localStorage first incorrectly restored Guest.
  return parseStoredUser(sessionStorage) || parseStoredUser(localStorage);
}

function replaceStoredUser(user, storage) {
  clearStoredUser();
  if (user) storage.setItem(STORAGE_KEY, JSON.stringify(user));
}

function writeStoredUser(user) {
  const storage = sessionStorage.getItem(STORAGE_KEY)
    ? sessionStorage
    : localStorage.getItem(STORAGE_KEY)
      ? localStorage
      : sessionStorage;
  replaceStoredUser(user, storage);
}

function clearStoredUser() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readStoredUser());
  const [initializing, setInitializing] = useState(true);

  const revalidate = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), SESSION_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) {
        setUser(null);
        clearStoredUser();
        return null;
      }
      if (!res.ok) throw new Error('session check unavailable');
      const { user: freshUser } = await res.json();
      setUser(freshUser);
      writeStoredUser(freshUser);
      return freshUser;
    } catch {
      const cachedUser = readStoredUser();
      setUser(cachedUser);
      return cachedUser;
    } finally {
      window.clearTimeout(timeoutId);
      setInitializing(false);
    }
  }, []);

  useEffect(() => {
    revalidate();

    function handlePageShow(event) {
      if (event.persisted) {
        revalidate();
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
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
      err.status = res.status;
      err.unverified = !!data.unverified;
      throw err;
    }
    setUser(data.user);
    const storage = rememberMe ? localStorage : sessionStorage;
    replaceStoredUser(data.user, storage);
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(async (code, rememberMe) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Google sign-in failed.');
    setUser(data.user);
    const storage = rememberMe ? localStorage : sessionStorage;
    replaceStoredUser(data.user, storage);
    return data.user;
  }, []);

  const continueAsGuest = useCallback(async ({ firstName, lastName }) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/guest`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Could not start a guest session.');
      err.status = res.status;
      throw err;
    }
    setUser(data.user);
    replaceStoredUser(data.user, sessionStorage);
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
      const err = new Error(data.message || 'Registration failed.');
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

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

  const claimGuestByEmailStart = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/guest/claim/email/start`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Could not send a verification code.');
      err.status = res.status;
      err.field = data.field;
      throw err;
    }
    return data;
  }, []);

  const claimGuestByEmailResendOtp = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/auth/guest/claim/email/resend-otp`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Could not resend the code.');
      err.status = res.status;
      throw err;
    }
    return data;
  }, []);

  const claimGuestByEmailVerifyOtp = useCallback(async (otp) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/guest/claim/email/verify-otp`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Verification failed.');
      err.status = res.status;
      throw err;
    }
    setUser(data.user);
    writeStoredUser(data.user);
    return data.user;
  }, []);

  const claimGuestByGoogle = useCallback(async (code) => {
    const res = await fetch(`${API_BASE_URL}/api/auth/guest/claim/google`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || 'Google sign-in failed.');
      err.status = res.status;
      throw err;
    }
    setUser(data.user);
    writeStoredUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } finally {
      clearStoredUser();
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      writeStoredUser(next);
      return next;
    });
  }, []);

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
      continueAsGuest,
      register,
      verifyRegistrationOtp,
      resendRegistrationOtp,
      resendAccountVerification,
      verifyAccountOtp,
      claimGuestByEmailStart,
      claimGuestByEmailResendOtp,
      claimGuestByEmailVerifyOtp,
      claimGuestByGoogle,
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
      continueAsGuest,
      register,
      verifyRegistrationOtp,
      resendRegistrationOtp,
      resendAccountVerification,
      verifyAccountOtp,
      claimGuestByEmailStart,
      claimGuestByEmailResendOtp,
      claimGuestByEmailVerifyOtp,
      claimGuestByGoogle,
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
