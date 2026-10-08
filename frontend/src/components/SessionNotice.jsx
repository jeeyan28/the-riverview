import { useAuth } from '../context/AuthContext';
export default function SessionNotice() {
  const { user, sessionStatus, sessionError, logoutError, revalidate, logout } = useAuth();
  if (!user || (!sessionError && !logoutError)) return null;
  return <div className="session-notice" role="status" aria-live="polite"><span>{logoutError || sessionError}</span><button type="button" disabled={sessionStatus === 'checking'} onClick={() => (logoutError ? logout() : revalidate()).catch(() => {})}>{logoutError ? 'Retry sign out' : 'Retry session check'}</button></div>;
}
