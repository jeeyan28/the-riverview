import { useState, useRef, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import AuthForm from '../components/AuthForm';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import AuthMorphOverlay from '../components/AuthMorphOverlay';
import { useAuthMorph } from '../hooks/useAuthMorph';
import logo from "../assets/logo/logoo.png";
import loginIllustration from "../assets/images/login-illustration.jpg";

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const cardRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(null);
  const { stage, rect, progress, beginMorph, retry } = useAuthMorph();
  const isMorphing = stage !== 'idle';

  useLayoutEffect(() => {
    if (isLogin && cardHeight === null && cardRef.current) {
      setCardHeight(cardRef.current.getBoundingClientRect().height);
    }
  }, [isLogin, cardHeight]);

  function handleAuthSuccess(user) {
    beginMorph(user, cardRef.current?.getBoundingClientRect());
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
          <span className="login-badge">PREMIUM RECREATION</span>
          <h1>
            <span>Reserve.</span>
            <span>Play.</span>
            <span>Unwind.</span>
          </h1>
          <p>
            Reserve billiards and recreation spaces with
            real-time availability in one seamless experience.
          </p>
        </div>

        <aside
          className={`login-card${isMorphing ? ' is-morph-source' : ''}`}
          ref={cardRef}
          style={cardHeight ? { height: cardHeight } : undefined}
        >
          <div
            className={`auth-card-inner ${isLogin ? 'slide-to-login' : 'slide-to-register'}`}
            key={isLogin ? 'login' : 'register'}
          >
            <div className="login-card-header">
              {isLogin ? (
                <>
                  <div className="login-avatar"><User size={18} /></div>
                  <h2>Welcome back </h2>
                  <p>Continue where you left off.</p>
                </>
              ) : (
                <>
                  <h2>Create your free account</h2>
                  <p>Takes less than a minute. No credit card needed.</p>
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

      <AuthMorphOverlay stage={stage} rect={rect} progress={progress} onRetry={retry} />

      <ForgotPasswordModal
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onReturnToLogin={() => {
          setShowForgotPassword(false);
          requestAnimationFrame(() => document.getElementById('email')?.focus());
        }}
      />
    </main>
  );
}

export default Login;
