import { Link, useNavigate, useLocation } from 'react-router-dom';

function Footer() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  function handleSectionLink(e, id) {
    e.preventDefault();
    if (isHome) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate(`/#${id}`);
    }
  }

  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <div className="logo-name">The Riverview</div>
            <p>The Best and favorite leisure destination. Come for the games, stay for the vibes.</p>
          </div>
          <div className="footer-col">
            <h4>Explore</h4>
            <a href="/#home" onClick={(e) => handleSectionLink(e, 'home')}>Home</a>
            <a href="/#rooms" onClick={(e) => handleSectionLink(e, 'rooms')}>Rooms</a>
            <a href="/#about" onClick={(e) => handleSectionLink(e, 'about')}>About</a>
            <Link to="/contact">Contact</Link>
            <a href="#">Book Now</a>
          </div>
          <div className="footer-col footer-map-col">
            <h4>Find Us</h4>
            <p>0355 Caingin, San Rafael, Philippines, 3008</p>
            <a
              href="https://maps.app.goo.gl/2VqEJXFJifUz2KF76"
              target="_blank"
              rel="noreferrer"
              className="footer-map-link"
            >
              View on Google Maps <i className="fa-solid fa-arrow-up-right-from-square"></i>
            </a>
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
              <a
                href="https://www.tiktok.com/@the.riverview?is_from_webapp=1&sender_device=pc"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Visit The Riverview on TikTok"
                title="Follow us on TikTok"
                class="social-link"
              >
                <i class="bi bi-tiktok"></i>
                <span class="visually-hidden">TikTok</span>
              </a>
            </div>
          </div>
            <div className="footer-col footer-newsletter">
            <form className="newsletter-form">
              <input type="email" placeholder="Your Email Address" required />
              <button type="submit">Subscribe</button>
            </form>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-left">
            <span><span className="teal-dot"></span>© 2026 The Riverview. All rights reserved.</span>
            <span>0355 Caingin, San Rafael, Philippines, 3008</span>
          </div>
          <div className="footer-legal-links">
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Privacy Policy</Link>
          </div>
          <a href="/#home" className="footer-back-top" onClick={(e) => handleSectionLink(e, 'home')}>
            Back to top <i className="fa-solid fa-arrow-up"></i>
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;