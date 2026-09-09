import { ArrowUp, ArrowUpRight, CalendarCheck, Clock3, Facebook, MapPin } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { operatingHoursSummary } from '../utils/operatingHours';

const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61550783505442';
const MAPS_URL = 'https://maps.app.goo.gl/2VqEJXFJifUz2KF76';

function Footer({ settings }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  function handleSectionLink(event, id) {
    event.preventDefault();
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
            <p>
              One clear schedule for billiards, KTV, and court time in Caingin, San Rafael.
            </p>
            <div className="footer-visit-facts">
              <span><Clock3 size={16} aria-hidden="true" />{operatingHoursSummary(settings)}</span>
              <span><MapPin size={16} aria-hidden="true" />Caingin, San Rafael, Bulacan</span>
            </div>
          </div>

          <div className="footer-col">
            <h4>Explore</h4>
            <a href="/#home" onClick={(event) => handleSectionLink(event, 'home')}>Home</a>
            <Link to="/rooms">Rooms &amp; facilities</Link>
            <a href="/#about" onClick={(event) => handleSectionLink(event, 'about')}>About</a>
            <Link to="/contact">Contact</Link>
          </div>

          <div className="footer-col footer-cta">
            <h4>Ready when you are</h4>
            <p>Choose a room type, see the hourly total, and secure the time with a down payment.</p>
            <Link className="footer-reserve-link" to="/rooms">
              <CalendarCheck size={16} aria-hidden="true" /> Reserve a space
            </Link>
            <a href={MAPS_URL} target="_blank" rel="noreferrer">
              <MapPin size={15} aria-hidden="true" /> Get directions <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a href={FACEBOOK_URL} target="_blank" rel="noreferrer">
              <Facebook size={15} aria-hidden="true" /> Facebook support <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-bottom-left">
            <span><span className="teal-dot" />© 2026 The Riverview</span>
            <span>0355 Caingin, San Rafael, Bulacan 3008</span>
          </div>
          <div className="footer-legal-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
          <a href="/#home" className="footer-back-top" onClick={(event) => handleSectionLink(event, 'home')}>
            Back to top <ArrowUp size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
