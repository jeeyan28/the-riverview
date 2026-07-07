import { useState } from 'react';
import { Link } from 'react-router-dom';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';

// ─────────────────────────────────────────────────────────────────────────
// ForgotPassword — migrated from forgot-password.html + js/forgot-password.js
// (Phase 8).
//
// Behavior preserved 1:1 from the original:
//   - two-state form: "request" view (email input) -> "sent" view
//     (confirmation copy + "send it again" button), swapped instead of
//     navigating to a different page — matches the original's
//     request-view/sent-view div toggle
//   - POST /api/auth/forgot-password with the email; the response message
//     itself is shown in the sent-view copy (the backend intentionally
//     returns the same generic message whether or not the account exists,
//     to avoid leaking which emails are registered — this component does
//     not change that behavior, just displays whatever message comes back)
//   - "Send it again" re-calls the same endpoint with the remembered email,
//     and reports the result via a toast rather than replacing the copy
//     again — same as the original's dataset.email + showToast() pairing
//
// API_BASE_URL is still hardcoded here, matching the original file — Phase
// 9 will move this into src/services/auth.js.
// ─────────────────────────────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000';
const DEFAULT_SENT_COPY =
  "If an account exists for that email, a reset link has been sent. It'll expire in 1 hour.";

async function requestReset(email) {
  const res = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  return data.message || DEFAULT_SENT_COPY;
}

function ForgotPassword() {
  const { toast, showToast } = useToast();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentCopy, setSentCopy] = useState(DEFAULT_SENT_COPY);
  const [sentEmail, setSentEmail] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmed = email.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    setEmailError(emailOk ? '' : 'Enter a valid email address.');
    if (!emailOk) return;

    setLoading(true);
    try {
      const message = await requestReset(trimmed);
      setSentCopy(message);
      setSentEmail(trimmed);
      setSent(true);
    } catch (err) {
      showToast('Could not reach the server. Is it running?', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!sentEmail) return;
    try {
      const message = await requestReset(sentEmail);
      showToast(message, 'success');
    } catch (err) {
      showToast('Could not reach the server. Is it running?', 'error');
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
            Forgot your
            <br />
            <em>password?</em>
          </h2>
          <p>
            No worries — enter the email on your account and we'll send you a link to set a new
            one.
          </p>
        </div>
      </div>

      <div className="right-panel">
        <div className="form-card">
          {!sent ? (
            <div id="request-view">
              <div className="form-card-header">
                <div className="section-label">Reset password</div>
                <h1>
                  Reset your
                  <br />
                  password
                </h1>
                <p>Enter your email address and we'll send a reset link.</p>
              </div>

              <form className="login-form" onSubmit={handleSubmit} noValidate>
                <div className={`field${emailError ? ' has-error' : ''}`} id="field-email">
                  <label htmlFor="email">Email address</label>
                  <div className="input-wrap">
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="you@email.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError('');
                      }}
                    />
                    <span className="input-icon">✉</span>
                  </div>
                  <span className="field-error" style={{ display: emailError ? 'block' : 'none' }}>
                    {emailError || 'Enter a valid email address.'}
                  </span>
                </div>

                <button type="submit" className={`btn-submit${loading ? ' loading' : ''}`}>
                  <span className="btn-text">Send reset link</span>
                  <span className="btn-spinner">
                    <span className="spinner-ring"></span>
                  </span>
                </button>

                <div className="signup-row">
                  <Link to="/login">Back to log in</Link>
                </div>
              </form>
            </div>
          ) : (
            <div id="sent-view">
              <div className="form-card-header">
                <div className="section-label">Check your inbox</div>
                <h1>
                  Email on
                  <br />
                  its way
                </h1>
                <p id="sent-copy">{sentCopy}</p>
              </div>

              <div className="login-form">
                <button type="button" className="btn-social" onClick={handleResend}>
                  Send it again
                </button>
                <div className="signup-row">
                  <Link to="/login">Back to log in</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Toast {...toast} />
    </div>
  );
}

export default ForgotPassword;
