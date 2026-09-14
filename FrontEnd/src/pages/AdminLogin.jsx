import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Activity, BarChart3, CalendarCheck2, ShieldCheck } from 'lucide-react';
import AuthForm from '../components/AuthForm';
import AuthMorphOverlay from '../components/AuthMorphOverlay';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import RiverviewLoader from '../components/RiverviewLoader';
import { useAuth } from '../context/AuthContext';
import { useAuthMorph } from '../hooks/useAuthMorph';
import { isAdminReturnPath, safeReturnPath } from '../utils/auth';
import logo from '../assets/logo/logoo.png';
import '../styles/admin-auth.css';

function landingFor(user, requestedPath = '') {
  const safePath = safeReturnPath(requestedPath);
  if (isAdminReturnPath(safePath)) return safePath;
  return user?.role === 'staff' ? '/admin/monitor' : '/admin/dashboard';
}

function AdminLogin() {
  const { initializing, isAdmin, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { stage, beginMorph, retry } = useAuthMorph();
  const requestedPath = searchParams.get('returnTo') || '';
  const isMorphing = stage !== 'idle';

  if (initializing) {
    return <RiverviewLoader message="Checking your staff session…" />;
  }

  if (isAdmin) {
    return <Navigate to={landingFor(user, requestedPath)} replace />;
  }

  function handleAuthSuccess(authenticatedUser) {
    beginMorph(authenticatedUser, landingFor(authenticatedUser, requestedPath));
  }

  return (
    <main className="login-page admin-auth-page">
      <div className={`admin-auth-background${isMorphing ? ' is-dimmed' : ''}`} aria-hidden="true">
        <div className="admin-auth-glow" />
        <div className="admin-auth-grid" />
      </div>

      <header className="login-header admin-auth-header">
        <Link to="/" className="login-brand admin-auth-brand" aria-label="The Riverview home">
          <img src={logo} alt="" className="login-logo" />
          <span>
            <strong>The Riverview</strong>
            <small>Operations</small>
          </span>
        </Link>
        <span className="admin-auth-header-status"><ShieldCheck size={15} aria-hidden="true" /> Private staff access</span>
      </header>

      <section className="admin-auth-layout">
        <div className={`admin-auth-intro${isMorphing ? ' is-exiting' : ''}`}>
          <span className="admin-auth-kicker">STAFF PORTAL</span>
          <h1>Today’s floor, clearly in view.</h1>
          <p>Sign in with the account assigned to you. Your role opens the tools you need automatically.</p>

          <div className="admin-auth-role-list" aria-label="Workspace access by role">
            <div className="admin-auth-role-row">
              <span className="admin-auth-role-mark"><Activity size={19} aria-hidden="true" /></span>
              <div>
                <strong>Staff workspace</strong>
                <span>Live room monitoring and reservation operations.</span>
              </div>
              <CalendarCheck2 size={18} aria-hidden="true" />
            </div>
            <div className="admin-auth-role-row">
              <span className="admin-auth-role-mark"><BarChart3 size={19} aria-hidden="true" /></span>
              <div>
                <strong>Supervisor &amp; Owner</strong>
                <span>Business reports, facilities, settings, and team access.</span>
              </div>
              <ShieldCheck size={18} aria-hidden="true" />
            </div>
          </div>
        </div>

        <aside className={`login-card admin-auth-card${isMorphing ? ' is-morph-source' : ''}`}>
          <div className="auth-card-inner slide-to-login">
            <div className="admin-auth-card-heading">
              <span className="admin-auth-card-eyebrow">SECURE OPERATIONS ACCESS</span>
              <h2>Sign in to your workspace</h2>
              <p>Use your Staff, Supervisor, or Owner credentials.</p>
            </div>

            <div className="admin-auth-assignment-note">
              <ShieldCheck size={17} aria-hidden="true" />
              <span>Access is based on the role assigned by your supervisor or owner.</span>
            </div>

            <div className="auth-card-body">
              <AuthForm
                mode="login"
                portal="admin"
                onForgotPassword={() => setShowForgotPassword(true)}
                onAuthSuccess={handleAuthSuccess}
              />
            </div>

            <Link className="admin-auth-customer-link" to="/login">Customer account sign-in</Link>
          </div>
        </aside>
      </section>

      <AuthMorphOverlay stage={stage} onRetry={retry} />

      <ForgotPasswordModal
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onReturnToLogin={() => {
          setShowForgotPassword(false);
          requestAnimationFrame(() => document.getElementById('email')?.focus());
        }}
      />

      <div className="modal-portal-root" data-modal-portal />
    </main>
  );
}

export default AdminLogin;
