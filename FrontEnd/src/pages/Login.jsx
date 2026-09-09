import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, User } from 'lucide-react';
import AuthForm from '../components/AuthForm';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import AuthMorphOverlay from '../components/AuthMorphOverlay';
import { useAuthMorph } from '../hooks/useAuthMorph';
import logo from "../assets/logo/logoo.png";
import loginIllustration from "../assets/images/login-illustration.jpg";

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const { stage, beginMorph, retry } = useAuthMorph();
  const isMorphing = stage !== 'idle';

  function handleAuthSuccess(user) {
    beginMorph(user);
  }

  return (
    <main className="login-page">

      <div className={`login-background${isMorphing ? ' is-dimmed' : ''}`}>
        <div
          className="login-background-image"
          style={{ backgroundImage: `url(${loginIllustration})` }}
        />
        <div className="login-background-tint" />
        <div className="login-background-overlay" />
      </div>

      <header className="login-header">
        <Link to="/" className="login-brand">
          <img src={logo} alt="The Riverview" className="login-logo" />
          <span className="login-brand-title">The Riverview</span>
        </Link>
      </header>

      <section className="login-layout">

        <div className={`login-copy${isMorphing ? ' is-exiting' : ''}`}>
          <span className="login-badge">THE RIVERVIEW RESERVATIONS</span>
          <h1>
            <span>Book your time.</span>
            <span>Enjoy the rest.</span>
          </h1>
          <p>
            One account for billiards, KTV, and court reservations — with secure
            payment, automatic confirmation, and your booking history in one place.
          </p>
          <div className="login-proof" aria-label="Account benefits">
            <span><CheckCircle2 size={16} aria-hidden="true" /> Live availability</span>
            <span><CheckCircle2 size={16} aria-hidden="true" /> Secure checkout</span>
            <span><CheckCircle2 size={16} aria-hidden="true" /> Reservation history</span>
          </div>
        </div>

        <aside className={`login-card${isMorphing ? ' is-morph-source' : ''}`}>
          <div
            className={`auth-card-inner ${isLogin ? 'slide-to-login' : 'slide-to-register'}`}
            key={isLogin ? 'login' : 'register'}
          >
            <div className="login-card-header">
              {isLogin ? (
                <>
                  <div className="login-avatar"><User size={18} /></div>
                  <h2>Welcome back</h2>
                  <p>Sign in to continue to your reservations.</p>
                </>
              ) : (
                <>
                  <h2>Create your account</h2>
                  <p>Save reservations, receipts, and schedule changes in one place.</p>
                </>
              )}
            </div>

            <div className="auth-card-body">
              <AuthForm
                mode={isLogin ? 'login' : 'register'}
                onSwitchMode={() => setIsLogin((v) => !v)}
                onForgotPassword={() => setShowForgotPassword(true)}
                onAuthSuccess={handleAuthSuccess}
              />
            </div>
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

export default Login;
