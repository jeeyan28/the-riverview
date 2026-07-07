// Footer — the public site footer, extracted out of MainLayout.jsx
// (Phase 6) into its own component. Purely static/presentational (no
// props needed yet), pulled out mainly for consistency with Navbar/
// AdminSidebar and to keep MainLayout.jsx short and focused on state.
function Footer() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div
              className="logo-name"
              style={{
                fontFamily: "'Playfair Display',serif",
                fontSize: '1.3rem',
                fontWeight: 600,
                color: '#fff',
                marginBottom: '.75rem',
              }}
            >
              The Riverview
            </div>
            <p>The Best and favorite leisure destination. Come for the games, stay for the vibes.</p>
          </div>
          <div className="footer-col">
            <h4>Explore</h4>
            <a href="#home">Home</a>
            <a href="#rooms">Rooms</a>
            <a href="#about">About</a>
            <a href="#">Book Now</a>
          </div>
          <div className="footer-col footer-newsletter">
            <form className="newsletter-form">
              <input type="email" placeholder="Your Email Address" required />
              <button type="submit">Subscribe</button>
            </form>
            <div className="social-icons">
              <a href="#" aria-label="Instagram"><i className="fa-brands fa-instagram"></i></a>
              <a
                href="https://www.facebook.com/profile.php?id=61550783505442"
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
              >
                <i className="fa-brands fa-facebook-f"></i>
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-left">
            <span><span className="teal-dot"></span>© 2026 The Riverview. All rights reserved.</span>
            <span>0355 Caingin, San Rafael, Philippines, 3008</span>
          </div>
          <a href="#home" className="footer-back-top">
            Back to top <i className="fa-solid fa-arrow-up"></i>
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;