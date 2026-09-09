import { ArrowUpRight, CalendarCheck, Clock3, MapPin, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { operatingHoursSummary } from '../utils/operatingHours';
import '../styles/contact-page.css';

const FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61550783505442';
const MAPS_URL = 'https://maps.app.goo.gl/2VqEJXFJifUz2KF76';

function ContactCard({ icon: Icon, title, children, action }) {
  return (
    <article className="contact-card">
      <div className="contact-card-head">
        <div className="contact-card-icon"><Icon size={18} aria-hidden="true" /></div>
        <h4>{title}</h4>
      </div>
      <p>{children}</p>
      <div className="contact-card-actions">{action}</div>
    </article>
  );
}

function Contact() {
  const { settings } = useSiteSettings();
  const hoursLabel = operatingHoursSummary(settings);

  return (
    <section id="contact" className="contact-page" aria-labelledby="contact-title">
      <div className="contact-inner">
        <div className="contact-header">
          <span className="section-label">Visit The Riverview</span>
          <h2 id="contact-title">Plan your visit or ask us directly.</h2>
          <p>
            Reserve online for a confirmed time slot. For event questions or help with an
            existing reservation, message the official Facebook page.
          </p>
        </div>

        <div className="contact-grid">
          <div className="contact-cards">
            <ContactCard
              icon={MapPin}
              title="Location"
              action={(
                <a className="contact-card-btn" href={MAPS_URL} target="_blank" rel="noreferrer">
                  Open in Google Maps <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            >
              0355 Caingin, San Rafael, Bulacan, Philippines 3008
            </ContactCard>

            <ContactCard
              icon={Clock3}
              title="Operating hours"
              action={<Link className="contact-card-btn" to="/rooms">Check facilities</Link>}
            >
              {hoursLabel}. Admin-posted closures appear in the reservation calendar.
            </ContactCard>

            <ContactCard
              icon={MessageCircle}
              title="Reservation support"
              action={(
                <a className="contact-card-btn" href={FACEBOOK_URL} target="_blank" rel="noreferrer">
                  Message on Facebook <ArrowUpRight size={14} aria-hidden="true" />
                </a>
              )}
            >
              Send the team your reservation code when asking about a booking, cancellation request, or event.
            </ContactCard>

            <ContactCard
              icon={CalendarCheck}
              title="Ready to reserve?"
              action={<Link className="contact-card-btn" to="/rooms">Browse available spaces</Link>}
            >
              Select a room, date, and whole-hour time slot. Online reservations are confirmed after the required down payment succeeds.
            </ContactCard>
          </div>

          <div className="map-embed">
            <iframe
              title="The Riverview location"
              src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d15417.522698847652!2d120.9408877!3d14.971559!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397015ce1b15087%3A0x8e4a9bdcffdcf31f!2sThe%20Riverview%20-%20San%20Rafael%20Bulacan!5e0!3m2!1sen!2sph!4v1785970545015!5m2!1sen!2sph"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export default Contact;
