import { Link } from 'react-router-dom';
import '../styles/contact-page.css';

function Contact() {
  return (
    <section id="contact" className="contact-page">
      <div className="contact-inner">
        <div className="contact-header">
          <span className="section-label">Get In Touch</span>
          <h2>Contact Us</h2>
          <p>Have a question about a booking or an event? Reach out and we'll get back to you.</p>
        </div>

        <div className="contact-grid">
          <div className="contact-cards">
            <div className="contact-card">
              <div className="contact-card-head">
                <div className="contact-card-icon"><i className="fa-solid fa-location-dot"></i></div>
                <h4>Address</h4>
              </div>
              <p>0355 Caingin, San Rafael, Philippines, 3008</p>
              <div className="contact-card-actions">
                <a
                  className="contact-card-btn"
                  href="https://maps.app.goo.gl/2VqEJXFJifUz2KF76"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Maps <i className="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-card-head">
                <div className="contact-card-icon"><i className="fa-solid fa-envelope"></i></div>
                <h4>Email</h4>
              </div>
              <p>Add your contact email here. We'll get back to you via email.</p>
              <div className="contact-card-actions">
                <a className="contact-card-btn" href="mailto:">
                  Send an Email <i className="fa-solid fa-paper-plane"></i>
                </a>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-card-head">
                <div className="contact-card-icon"><i className="fa-solid fa-phone"></i></div>
                <h4>Phone</h4>
              </div>
              <p>Add your contact number here.</p>
              <div className="contact-card-actions">
                <a className="contact-card-btn" href="tel:">
                  Call Now <i className="fa-solid fa-phone"></i>
                </a>
              </div>
            </div>

            <div className="contact-card">
              <div className="contact-card-head">
                <div className="contact-card-icon"><i className="fa-solid fa-clock"></i></div>
                <h4>Hours</h4>
              </div>
              <p>Add your operating hours here.</p>
              <div className="contact-card-actions">
                <Link className="contact-card-btn" to="/rooms">
                  View Schedule <i className="fa-solid fa-calendar-days"></i>
                </Link>
              </div>
            </div>
          </div>

          <div className="map-embed">
            <iframe
              title="The Riverview location"
              src="https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d15417.522698847652!2d120.9408877!3d14.971559!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397015ce1b15087%3A0x8e4a9bdcffdcf31f!2sThe%20Riverview%20-%20San%20Rafael%20Bulacan!5e0!3m2!1sen!2sph!4v1785970545015!5m2!1sen!2sph"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            ></iframe>
          </div>
        </div>

        <div className="social-icons contact-socials">
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
    </section>
  );
}

export default Contact;