import { useState, useRef, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import AuthForm from '../components/AuthForm';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import logo from "../assets/logo/logoo.png";

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const cardRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(null);

  useLayoutEffect(() => {
    if (isLogin && cardHeight === null && cardRef.current) {
      setCardHeight(cardRef.current.getBoundingClientRect().height);
    }
  }, [isLogin, cardHeight]);

  return (
    <main className="login-page">

      <div className="login-background">
        <div className="login-background-image" />
        <div className="login-background-overlay" />
      </div>

      <header className="login-header">
        <Link to="/" className="login-brand">
          <img src={logo} alt="The Riverview" className="login-logo" />
          <span className="login-brand-title">The Riverview</span>
        </Link>
      </header>

      <section className="login-layout">

        <div className="login-copy">
          <span className="login-badge">PREMIUM RECREATION</span>
          <h1>
            Reserve.
            <br />
            Play.
            <br />
            Unwind.
          </h1>
          <p>
            Book billiards and recreation spaces with
            real-time availability in one seamless experience.
          </p>
        </div>

        <aside
          className="login-card"
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
              />
            </div>
          </div>
        </aside>

      </section>

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