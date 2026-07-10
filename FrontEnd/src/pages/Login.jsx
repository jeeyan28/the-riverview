import { useState, useRef, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm';
import ForgotPasswordModal from '../components/ForgotPasswordModal';
import logo from "../assets/logo/logoo.png";
import heroIllustration from '../assets/pictures/login-hero.png';


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
      <div className="login-background" aria-hidden="true">
        <div
          className="login-background-image"
          style={{ backgroundImage: `url(${heroIllustration})` }}
        />
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
                  <h2>Welcome back</h2>
                  <p>Sign in to continue.</p>
                </>
              ) : (
                <>
                  <h2>Create your free account</h2>
                  <p>Takes less than a minute. No credit card needed.</p>
                </>
              )}
            </div>

            <div className="auth-card-body">
              {isLogin ? (
                <LoginForm
                  onSwitchToRegister={() => setIsLogin(false)}
                  onForgotPassword={() => setShowForgotPassword(true)}
                />
              ) : (
                <RegisterForm onSwitchToLogin={() => setIsLogin(true)} />
              )}
            </div>
          </div>
        </aside>

      </section>

      <ForgotPasswordModal
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        onReturnToLogin={() => {
          setShowForgotPassword(false);
          // LoginForm's email input keeps id="email" and stays mounted
          // behind the modal (only rendered while isLogin, which is the
          // only state Forgot Password is reachable from), so it's safe
          // to focus directly rather than threading a ref through.
          requestAnimationFrame(() => document.getElementById('email')?.focus());
        }}
      />
    </main>
  );
}

export default Login;