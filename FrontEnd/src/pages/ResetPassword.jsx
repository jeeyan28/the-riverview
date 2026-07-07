import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PasswordInput from '../components/PasswordInput';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

// ─────────────────────────────────────────────────────────────────────────
// ResetPassword — migrated from reset-password.html + js/reset-password.js
// (Phase 8).
//
// ROUTING FIX (Phase 8): the original page read its token from the URL
// QUERY STRING (`new URLSearchParams(window.location.search).get('token')`)
// — e.g. reset-password.html?token=abc123 — because that's the exact link
// format the backend emails (see Backend/routes/auth.js's
// `resetUrl = .../reset-password.html?token=${rawToken}`). Phase 6 had
// wired this page's route as a path param instead (`/reset-password/:token`),
// which doesn't match a real emailed link and would 404. This component
// uses react-router's useSearchParams to read ?token= instead, and the
// route itself is corrected to plain "/reset-password" in App.jsx. The
// backend's separate POST /api/auth/reset-password/:token endpoint (an API
// route, not a page route) is untouched — this component still sends the
// token as a path segment in that fetch call, exactly like the original.
//
// Other behavior preserved 1:1:
//   - missing-token error toast on load
//   - password >= 8 chars, confirm-password match validation
//   - POST /api/auth/reset-password/:token, redirect to /login on success
//
// API_BASE_URL is still hardcoded here, matching the original file — Phase
// 9 will move this into src/services/auth.js.
// ─────────────────────────────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { toast, showToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);

  // Mirrors the original's bare top-of-file check that ran once on load.
  useEffect(() => {
    if (!token) {
      showToast('This reset link is missing its token. Request a new one from the login page.', 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!token) return;

    const passOk = password.length >= 8;
    const confirmOk = password === confirm;

    setPasswordError(passOk ? '' : 'Password must be at least 8 characters.');
    setConfirmError(confirmOk ? '' : 'Passwords do not match.');
    if (!passOk || !confirmOk) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/reset-password/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (res.ok) {
        showToast('Password updated! Redirecting to login…', 'success');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1800);
      } else {
        showToast(data.message || 'Could not reset password.', 'error');
      }
    } catch (err) {
      showToast('Could not reach the server. Is it running?', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-body">
      <div className="left-panel">
        <div className="left-bg"></div>
        <div className="left-overlay"></div>
        <div className="left-content">
          <div className="left-eyebrow">Account Recovery</div>
          <h2>
            Set a new
            <br />
            <em>password.</em>
          </h2>
          <p>Choose a strong password you haven't used before.</p>
        </div>
      </div>

      <div className="right-panel">
        <div className="form-card">
          <div className="form-card-header">
            <div className="section-label">Reset password</div>
            <h1>
              Create a new
              <br />
              password
            </h1>
            <p>Must be at least 8 characters.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className={`field${passwordError ? ' has-error' : ''}`} id="field-password">
              <label htmlFor="password">New password</label>
              <PasswordInput
                id="password"
                name="password"
                placeholder="Enter new password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                error={passwordError}
              />
            </div>

            <div className={`field${confirmError ? ' has-error' : ''}`} id="field-confirm">
              <label htmlFor="confirm">Confirm password</label>
              <PasswordInput
                id="confirm"
                name="confirm"
                placeholder="Re-enter new password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setConfirmError('');
                }}
                error={confirmError}
              />
            </div>

            <button type="submit" className={`btn-submit${loading ? ' loading' : ''}`}>
              <span className="btn-text">Update password</span>
              <span className="btn-spinner">
                <span className="spinner-ring"></span>
              </span>
            </button>

            <div className="signup-row">
              <Link to="/login">Back to log in</Link>
            </div>
          </form>
        </div>
      </div>

      <Toast {...toast} />
    </div>
  );
}

export default ResetPassword;
