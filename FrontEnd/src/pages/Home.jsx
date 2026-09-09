import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import {
  Clock3, CalendarCheck, PartyPopper, Trophy,
  Zap, LayoutGrid, ShieldCheck,
  DoorOpen, CalendarDays, Wallet, FileText, MessageCircle,
  Timer, Hourglass, CheckCircle2,
  HelpCircle, X,
} from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useToast } from '../hooks/useToast';
import { dateKey, fetchReservedHours } from '../utils/rooms';
import { operatingHoursSummary } from '../utils/operatingHours';
import BookingModal from '../components/BookingModal';
import FacilityBookingCard from '../components/FacilityBookingCard';
import FacilityCardSkeleton from '../components/FacilityCardSkeleton';
import FacilityMotionVisual from '../components/FacilityMotionVisual';
import RoomDetailsModal from '../components/RoomDetailsModal';
import Toast from '../components/Toast';
import { API_BASE_URL } from '../services/api';

import heroImg4 from '../assets/pictures/RiverView_4.jpg';
import heroImg5 from '../assets/pictures/RiverView_5.jpg';
import heroImg6 from '../assets/pictures/RiverView_6.jpg';
import heroImg7 from '../assets/pictures/RiverView_7.jpg';
import heroImg8 from '../assets/pictures/RiverView_8.jpg';
import heroBgImg from '../assets/images/main.png';

const HERO_CAROUSEL_INTERVAL_MS = 4000;

const HERO_SLIDES = [
  { src: heroImg4, alt: 'The Riverview' },
  { src: heroImg5, alt: 'Court' },
  { src: heroImg6, alt: 'VIP' },
  { src: heroImg7, alt: 'Billiards' },
  { src: heroImg8, alt: 'Court 2' },
];

function getOffset(index, current, total) {
  let diff = index - current;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;
  return diff;
}

const WHY_BOOK_CARDS = [
  { icon: CalendarCheck, title: 'Reserve in Advance', desc: "Lock in your preferred room before it's gone." },
  { icon: Zap, title: 'Faster Check-In', desc: 'Skip the wait — your room is ready when you arrive.' },
  { icon: LayoutGrid, title: 'See What\u2019s Available', desc: 'Browse room types and real-time availability first.' },
  { icon: ShieldCheck, title: 'Secure Reservation', desc: 'Your reservation and payment details stay protected.' },
];

const BOOKING_STEPS = [
  {
    icon: CalendarDays,
    title: 'Choose a facility and time',
    desc: 'Select a live facility, room type, date, and whole-hour time slot from the booking calendar.',
  },
  {
    icon: Wallet,
    title: 'Complete the down payment',
    desc: 'Secure the reservation through the available PayMongo checkout options before the temporary hold expires.',
  },
  {
    icon: CheckCircle2,
    title: 'Receive confirmation',
    desc: 'A successful payment confirms the reservation automatically and saves it to your account history.',
  },
];

const HELPFUL_INFO_CARDS = [
  { icon: Wallet, title: 'Down Payment Required', desc: "Online reservations require a down payment. A successful payment confirms the slot automatically." },
  { icon: Timer, title: '20-Minute Payment Window', desc: 'Complete your online payment within 20 minutes, or the slot is released to other customers.' },
  { icon: Hourglass, title: '1–5 Hour Reservations', desc: 'Online reservations use whole-hour increments, with a one-hour minimum and five-hour maximum.' },
  { icon: DoorOpen, title: 'Arrive On Time', desc: 'A confirmed reservation that passes its scheduled end without completion is recorded as a no-show.' },
  { icon: FileText, title: 'Cancellation Review', desc: 'Cancellation requests require admin approval. Any approved refund is processed manually; no-show down payments are forfeited.' },
  { icon: Clock3, title: 'Open Daily', desc: '7AM to midnight, every day of the week.' },
  { icon: MessageCircle, title: 'Need Help?', desc: 'Questions or issues? Message our official Facebook page "The Riverview" we\u2019re happy to help.' },
];

function HeroCarousel() {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);

  function start() {
    stop();
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % HERO_SLIDES.length);
    }, HERO_CAROUSEL_INTERVAL_MS);
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => {
    start();
    return stop;
  }, []);

  function goTo(index) {
    setCurrent((index + HERO_SLIDES.length) % HERO_SLIDES.length);
    start();
  }

  return (
    <div className="hero-carousel" id="heroCarousel" onMouseEnter={stop} onMouseLeave={start}>
      <button
        type="button"
        className="hero-carousel-arrow hero-carousel-arrow-prev"
        aria-label="Previous slide"
        onClick={() => goTo(current - 1)}
      >
        <i className="fa-solid fa-chevron-left"></i>
      </button>

      <div className="hero-carousel-stage" id="heroCarouselTrack">
        {HERO_SLIDES.map((slide, i) => {
          const offset = getOffset(i, current, HERO_SLIDES.length);
          const abs = Math.abs(offset);
          const isActive = offset === 0;
          const cardStyle = {
            transform: `translateX(${offset * 42}%) scale(${1 - abs * 0.16})`,
            opacity: 1 - abs * 0.3,
            zIndex: 10 - abs,
          };

          return (
            <button
              type="button"
              key={slide.src}
              className={`hero-carousel-card${isActive ? ' is-active' : ''}`}
              style={cardStyle}
              aria-label={isActive ? undefined : `Go to ${slide.alt}`}
              aria-current={isActive ? 'true' : undefined}
              tabIndex={isActive ? -1 : 0}
              onClick={() => goTo(i)}
            >
              <span className="hero-carousel-frame">
                <img src={slide.src} alt={slide.alt} />
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="hero-carousel-arrow hero-carousel-arrow-next"
        aria-label="Next slide"
        onClick={() => goTo(current + 1)}
      >
        <i className="fa-solid fa-chevron-right"></i>
      </button>
    </div>
  );
}

function Home() {
  const { settings, openHour, closeHour, loaded: settingsLoaded, refetch: refetchSettings } = useSiteSettings();
  const { toast, showToast } = useToast();
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [liveStatuses, setLiveStatuses] = useState({});

  const [bookingRoom, setBookingRoom] = useState(null);
  const [detailRoom, setDetailRoom] = useState(null);
  const [paymongoReturn, setPaymongoReturn] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const hoursLabel = operatingHoursSummary(settings);

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash]);

  useEffect(() => {
    const result = searchParams.get('paymongo');
    const paymentIntentId = searchParams.get('paymentIntentId');
    if (!result || !paymentIntentId) return;

    setPaymongoReturn({ result, paymentIntentId });
    setSearchParams({}, { replace: true });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/rooms`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load rooms');
        const data = await res.json();
        if (!cancelled) setRooms(data);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError(true);
      }
    }

    loadRooms();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rooms || !rooms.length || !settingsLoaded) return;
    let cancelled = false;

    async function refresh() {
      const now = new Date();
      const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
      const currentHour = Math.max(openHour, now.getHours());

      const updates = {};
      await Promise.all(
        rooms
          .map(async (room) => {
            try {
              const totalUnits = room.variants && room.variants.length
                ? room.variants.reduce((sum, v) => sum + (Number(v.roomCount) || 1), 0)
                : 1;
              const reserved = await fetchReservedHours(room._id, todayStr);
              let fullyBooked = currentHour < closeHour;
              for (let h = currentHour; h < closeHour && fullyBooked; h++) {
                if (Number(reserved?.[h] || 0) < totalUnits) fullyBooked = false;
              }
              if (fullyBooked) updates[room._id] = 'Fully Reserved';
            } catch (err) {
              console.error(err);
            }
          })
      );
      if (!cancelled && Object.keys(updates).length) {
        setLiveStatuses((prev) => ({ ...prev, ...updates }));
      }
    }

    refresh();
    return () => {
      cancelled = true;
    };
  }, [rooms, settingsLoaded, openHour, closeHour]);

  async function handleSelectRoom(room) {
    setBookingRoom(room);
    refetchSettings();
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${room._id}`, { credentials: 'include' });
      if (res.ok) {
        setBookingRoom(await res.json());
      } else if (res.status === 404) {
        setBookingRoom(null);
        setRooms((prev) => (prev ? prev.filter((r) => r._id !== room._id) : prev));
        showToast('This facility is no longer available.', 'error');
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    const els = document.querySelectorAll('.reveal, .reveal-stagger');
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  function handleCloseBooking() {
    setBookingRoom(null);
    setPaymongoReturn(null);
  }

  return (
    <>
      <section className="hero" id="home">
        <div className="hero-bg" style={{ '--hero-bg-image': `url(${heroBgImg})` }}></div>

        <div className="hero-inner">
          <div className="hero-content">
            <p className="hero-eyebrow">Caingin, San Rafael · {hoursLabel}</p>
            <h1>Your next game<br />starts <em>here.</em></h1>
            <p className="hero-sub">
              Reserve billiards, KTV, or the court from one live schedule. Choose your time,
              complete the down payment, and receive confirmation automatically.
            </p>
            <div className="hero-actions">
              <Link to="/rooms" className="btn-primary-hero">Reserve a space</Link>
              <a href="#rooms" className="btn-ghost-hero">View facilities</a>
            </div>
          </div>

          <HeroCarousel />
        </div>
      </section>

      <section className="how-it-works">
        <div className="how-it-works-inner reveal">
          <div className="section-label">3 Easy Steps</div>
          <h2>A clear path from available slot to confirmed booking.</h2>
        </div>
        <div className="steps-grid reveal-stagger">
          {BOOKING_STEPS.map((s, i) => (
            <div className="step-card" key={s.title}>
              <div className="step-num">{i + 1}</div>
              <div className="step-card-icon"><s.icon size={18} color="var(--teal)" /></div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="rooms">
        <div className="rooms-header reveal">
          <div>
            <div className="section-label">Reserve Your Space</div>
            <h2>Choose your facility</h2>
          </div>
          <div className="rooms-header-right">
            <p>Live, admin-managed inventory.<br />Walk-ins can still be recorded by staff.</p>
            <Link to="/rooms" className="btn-view-all">
              Browse all facilities <i className="fa-solid fa-chevron-right"></i>
            </Link>
          </div>
        </div>

        <div className="rooms-grid reveal-stagger" id="room-grid">
          {rooms === null && !loadError && (
            <>
              <FacilityCardSkeleton />
              <FacilityCardSkeleton />
              <FacilityCardSkeleton />
            </>
          )}
          {loadError && (
            <div className="text-center text-muted py-4 w-100">
              Could not load rooms right now. Please try again later.
            </div>
          )}
          {rooms !== null && !loadError && rooms.length === 0 && (
            <div className="text-center text-muted py-4 w-100">
              No rooms available yet — check back soon.
            </div>
          )}
          {rooms !== null &&
            rooms.map((room) => (
              <FacilityBookingCard
                key={room._id}
                room={room}
                liveStatus={liveStatuses[room._id]}
                onSelect={handleSelectRoom}
                onDetails={setDetailRoom}
              />
            ))}
        </div>
      </section>

      <section className="why-book">
        <div className="why-book-inner reveal">
          <div className="section-label">Why Reserve Online?</div>
          <h2>Plan ahead without waiting for a reply.</h2>
        </div>
        <div className="why-book-grid reveal-stagger">
          {WHY_BOOK_CARDS.map((c) => (
            <div className="why-book-card" key={c.title}>
              <div className="why-book-card-icon"><c.icon size={18} color="var(--teal)" /></div>
              <h4>{c.title}</h4>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="spaces-showcase" style={{ background: 'var(--surface-alt)' }}>
        <div className="spaces">
          <div className="spaces-header reveal">
            <div className="section-label">Our Spaces</div>
            <h2>Three ways to spend your time.</h2>
            <p>Bookable services stay focused on the spaces the venue manages: billiards, the basketball court, and KTV.</p>
          </div>

          <div className="spaces-rows reveal-stagger">
            <div className="space-row">
              <div className="space-text">
                <h3>Billiards Room</h3>
                <p>Multiple tables, great lighting, and a chill atmosphere. Perfect for a quick session or a long evening with friends.</p>
              </div>
              <FacilityMotionVisual type="billiards" label="Billiards" />
            </div>

            <div className="space-row space-row-reverse">
              <div className="space-text">
                <h3>Basketball Court</h3>
                <p>Full-size court with proper flooring. Includes scoreboard, timer, and sound system for official games.</p>
              </div>
              <FacilityMotionVisual type="court" label="Court" />
            </div>

            <div className="space-row">
              <div className="space-text">
                <h3>KTV Room</h3>
                <p>Private rooms with updated song libraries. Bring your barkada, bring your voice. No judgment here.</p>
              </div>
              <FacilityMotionVisual type="ktv" label="KTV" />
            </div>
          </div>
        </div>
      </section>

      <section id="about">
        <div className="about-inner">
          <div className="about-left reveal-left">
            <div className="section-label">About Us</div>
            <h2>Made for easy visits and better nights.</h2>
            <p>The Riverview brings billiards, court rental, and KTV together in Caingin, San Rafael. The reservation system keeps schedules clear while the team stays available for walk-ins, events, and on-site support.</p>
          </div>

          <div className="about-right reveal-stagger">
            <div className="about-card">
              <div className="about-card-icon"><Clock3 size={20} color="var(--teal)" /></div>
              <h4>Open Daily</h4>
              <p>{hoursLabel}. Current closures are reflected in the reservation calendar.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon"><CalendarCheck size={20} color="var(--teal)" /></div>
              <h4>Easy Reservation</h4>
              <p>Reserve your room online in seconds. Walk-ins always welcome, reservations always smoother.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon"><PartyPopper size={20} color="var(--teal)" /></div>
              <h4>Events & Parties</h4>
              <p>Celebrating something? We'll help set it up. Birthdays, team events, reunions — we handle it.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon"><Trophy size={20} color="var(--teal)" /></div>
              <h4>Official Games</h4>
              <p>Full scoreboard, timer, and sound system for serious basketball matchups. Play like it counts.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="help-widget">
        {helpOpen && (
          <div className="help-panel" role="dialog" aria-label="Helpful Information">
            <div className="help-panel-header">
              <div>
                <div className="section-label">Good to Know</div>
                <h4>Helpful Information</h4>
              </div>
              <button
                type="button"
                className="help-panel-close"
                aria-label="Close"
                onClick={() => setHelpOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="help-panel-list">
              {HELPFUL_INFO_CARDS.map((c) => (
                <div className="info-card" key={c.title}>
                  <div className="info-card-icon"><c.icon size={16} color="var(--teal)" /></div>
                  <div>
                    <h4>{c.title}</h4>
                    <p>{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          className={`help-fab${helpOpen ? ' is-open' : ''}`}
          aria-expanded={helpOpen}
          aria-label={helpOpen ? 'Close helpful information' : 'Open helpful information'}
          onClick={() => setHelpOpen((v) => !v)}
        >
          {helpOpen ? <X size={20} /> : <HelpCircle size={20} />}
        </button>
      </div>

      <BookingModal
        room={bookingRoom}
        returnInfo={paymongoReturn}
        onClose={handleCloseBooking}
        openHour={openHour}
        closeHour={closeHour}
        settings={settings}
      />

      <RoomDetailsModal room={detailRoom} onClose={() => setDetailRoom(null)} onReserve={(room) => { setDetailRoom(null); handleSelectRoom(room); }} />

      <Toast {...toast} />
    </>
  );
}

export default Home;
