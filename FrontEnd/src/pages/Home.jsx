import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Clock3, CalendarCheck, PartyPopper, Trophy,
  Zap, LayoutGrid, ShieldCheck,
  DoorOpen, CalendarDays, Grid2x2, RefreshCcw, Wallet, FileText, MessageCircle,
  HelpCircle, X,
} from 'lucide-react';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { dateKey, fetchReservedHours } from '../utils/rooms';
import BookingModal from '../components/BookingModal';
import { API_BASE_URL } from '../services/api';

import heroImg4 from '../assets/pictures/RiverView_4.jpg';
import heroImg5 from '../assets/pictures/RiverView_5.jpg';
import heroImg6 from '../assets/pictures/RiverView_6.jpg';
import heroImg7 from '../assets/pictures/RiverView_7.jpg';
import heroImg8 from '../assets/pictures/RiverView_8.jpg';
import billiardsImg from '../assets/images/billiards.png';
import courtImg from '../assets/images/court.png';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';
import heroBgImg from '../assets/images/main.png';

const HERO_CAROUSEL_INTERVAL_MS = 4000;

const HERO_SLIDES = [
  { src: heroImg4, alt: 'The Riverview' },
  { src: heroImg5, alt: 'Court' },
  { src: heroImg6, alt: 'VIP' },
  { src: heroImg7, alt: 'Billiards' },
  { src: heroImg8, alt: 'Court 2' },
];

// Shortest signed distance from `index` to `current` around the circular
// slide order, e.g. with 5 slides: -2, -1, 0, 1, 2. Powers the coverflow
// stack below — 0 is the big centered photo, ±1/±2 recede to the sides.
function getOffset(index, current, total) {
  let diff = index - current;
  if (diff > total / 2) diff -= total;
  if (diff < -total / 2) diff += total;
  return diff;
}

// "Why Book Online?" benefit cards.
const WHY_BOOK_CARDS = [
  { icon: CalendarCheck, title: 'Reserve in Advance', desc: "Lock in your preferred room before it's gone." },
  { icon: Zap, title: 'Faster Check-In', desc: 'Skip the wait — your room is ready when you arrive.' },
  { icon: LayoutGrid, title: 'See What\u2019s Available', desc: 'Browse room types and real-time availability first.' },
  { icon: ShieldCheck, title: 'Secure Booking', desc: 'Your reservation and payment details stay protected.' },
];

// "Helpful Information" cards — practical, optional notes, not warnings.
// Opening hours text intentionally mirrors the hero's hardcoded string
// (see PROJECT_PROGRESS.md) rather than adding a second, separately
// formatted source for the same fact.
const HELPFUL_INFO_CARDS = [
  { icon: DoorOpen, title: 'Walk-Ins Welcome', desc: 'Just show up — subject to availability.' },
  { icon: CalendarDays, title: 'Book Ahead on Weekends', desc: 'Reservations are recommended on weekends and holidays.' },
  { icon: Grid2x2, title: 'Choose Your Room Type', desc: 'Solo, Big, or Shared — pick what fits your group.' },
  { icon: RefreshCcw, title: 'Availability Updates Often', desc: 'Room status refreshes regularly so what you see is accurate.' },
  { icon: Wallet, title: 'Down Payment May Apply', desc: 'A small deposit may be required to confirm your reservation.' },
  { icon: FileText, title: 'Flexible Policies', desc: 'Cancellation and rescheduling options may apply — just ask.' },
  { icon: Clock3, title: 'Open Daily', desc: '7AM to midnight, every day of the week.' },
  { icon: MessageCircle, title: 'Need Help?', desc: 'Have questions? Reach out — we\u2019re happy to help.' },
];

// Keyword-based icon lookup for each facility feature tag — visual only,
// falls back to a generic check icon for anything unrecognized.
function getFeatureIcon(feature = '') {
  const f = feature.toLowerCase();
  if (f.includes('air') || f.includes('aircon')) return 'fa-snowflake';
  if (f.includes('drink') || f.includes('bar')) return 'fa-martini-glass-citrus';
  if (f.includes('wifi')) return 'fa-wifi';
  if (f.includes('sound') || f.includes('music') || f.includes('speaker')) return 'fa-volume-high';
  if (f.includes('tv') || f.includes('screen') || f.includes('projector')) return 'fa-tv';
  if (f.includes('parking')) return 'fa-square-parking';
  return 'fa-circle-check';
}

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(index) {
    setCurrent((index + HERO_SLIDES.length) % HERO_SLIDES.length);
    start(); // restart the interval, same as restart() in the original
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

function RoomCard({ room, liveStatus, onSelect }) {
  const cardImage = room.image ? resolveImageUrl(room.image) : fallbackRoomImg;
  const hasVariants = room.variants && room.variants.length > 0;
  const startingPrice = hasVariants
    ? Math.min(...room.variants.map((v) => v.price || 0))
    : room.price || 0;
  const roomTypeCount = hasVariants ? room.variants.length : 0;

  // Status badge: starts on the admin-set status, and is upgraded to
  // "Fully Booked" once refreshLiveRoomStatuses() (in the parent) resolves
  // — see the `liveStatus` prop, which mirrors the original's async badge
  // swap without touching the DOM directly.
  const initiallyAvailable = room.status === 'Available';
  const statusLabel = liveStatus || (initiallyAvailable ? 'Available' : 'Unavailable');
  const statusClass =
    statusLabel === 'Fully Booked'
      ? 'room-status-fullybooked'
      : initiallyAvailable
      ? 'room-status-available'
      : 'room-status-unavailable';

  return (
    <div className="room-card" data-room-id={room._id}>
      <div className="room-card-img">
        <img src={cardImage} alt={room.name} />
      </div>
      <div className="room-card-body">
        <h3>{room.name}</h3>
        <span className="price-amt">Starting at ₱{startingPrice}/hr</span>

        {(roomTypeCount > 0 || (room.features && room.features.length > 0)) && (
          <div className="room-card-tags">
            {roomTypeCount > 0 && (
              <span className="room-tag">
                <i className="fa-solid fa-layer-group"></i>
                {roomTypeCount} Room Type{roomTypeCount > 1 ? 's' : ''}
              </span>
            )}
            {room.features && room.features.map((f, i) => (
              <span className="room-tag" key={i}><i className={`fa-solid ${getFeatureIcon(f)}`}></i>{f}</span>
            ))}
          </div>
        )}

        <p className="room-card-desc">{room.description || ''}</p>

        <a href="#" className="btn-select" onClick={(e) => { e.preventDefault(); onSelect(room); }}>
          <i className="fa-solid fa-calendar-check"></i> Book Now
        </a>
      </div>
    </div>
  );
}

function Home() {
  const { settings, openHour, closeHour, loaded: settingsLoaded, refetch: refetchSettings } = useSiteSettings();
  const [rooms, setRooms] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [liveStatuses, setLiveStatuses] = useState({}); // { [roomId]: 'Fully Booked' }

  const [bookingRoom, setBookingRoom] = useState(null); // room object, or null when closed
  const [paymongoReturn, setPaymongoReturn] = useState(null); // { result, paymentIntentId }, or null
  const [searchParams, setSearchParams] = useSearchParams();
  const [helpOpen, setHelpOpen] = useState(false); // "?" floating Helpful Information panel

  // handlePaymongoReturn (URL-reading half) — migrated 1:1 from js/index.js.
  // Runs once on mount, exactly like the original's unconditional
  // `handlePaymongoReturn();` call at the bottom of index.js. Cleans the
  // URL immediately so refreshing/sharing it doesn't re-trigger this.
  // Reads `paymentIntentId` (not `bookingId`) — no Booking exists until
  // payment actually succeeds, so the PayMongo return URL can't carry one.
  useEffect(() => {
    const result = searchParams.get('paymongo');
    const paymentIntentId = searchParams.get('paymentIntentId');
    if (!result || !paymentIntentId) return;

    setPaymongoReturn({ result, paymentIntentId });
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // loadRooms — migrated 1:1 from js/index.js.
  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/rooms`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load rooms');
        const data = (await res.json()).filter((r) => r.status !== 'Inactive');
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

  // refreshLiveRoomStatuses — migrated 1:1 from js/index.js. Upgrades any
  // "Available" badge to "Fully Booked" if every remaining operating hour
  // today is already reserved for that specific room. Waits for site
  // settings to load first so OPEN_HOUR/CLOSE_HOUR reflect the admin's
  // actual Operating Schedule instead of the 7–24 defaults.
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
          .filter((r) => r.status === 'Available')
          .map(async (room) => {
            try {
              // No variantLabel here: this badge is a room-wide "nothing left
              // to book today" summary, so it counts against the room's
              // total units across every variant (falls back to 1 for rooms
              // without variants) rather than any single variant's pool.
              const totalUnits = room.variants && room.variants.length
                ? room.variants.reduce((sum, v) => sum + (Number(v.roomCount) || 1), 0)
                : 1;
              const reserved = await fetchReservedHours(room._id, todayStr);
              let fullyBooked = currentHour < closeHour; // only meaningful if time remains today
              for (let h = currentHour; h < closeHour && fullyBooked; h++) {
                if (Number(reserved?.[h] || 0) < totalUnits) fullyBooked = false;
              }
              if (fullyBooked) updates[room._id] = 'Fully Booked';
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

  // Opens immediately with the (possibly stale) room from the page-load
  // list so the modal isn't blank while loading, then swaps in a fresh
  // fetch by id. Room data (roomCount, status, price) can change in admin
  // any time after this page loaded, and the booking flow's availability
  // math depends on that being current — otherwise the modal can show
  // capacity that no longer matches what the backend will actually check.
  // Settings (operating hours, fewSlotsThreshold) are refetched the same
  // way — useSiteSettings only fetches once on mount, so without this an
  // admin's hour/threshold change wouldn't show until a page reload.
  async function handleSelectRoom(room) {
    setBookingRoom(room);
    refetchSettings();
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${room._id}`, { credentials: 'include' });
      if (res.ok) setBookingRoom(await res.json());
    } catch (err) {
      console.error(err);
      // keep the already-open stale room rather than blocking the flow
    }
  }

  // Scroll-reveal — toggles `.is-visible` on `.reveal`/`.reveal-stagger`
  // elements as they enter the viewport. This is the JS half of the
  // `.reveal` system already defined in enhancements.css (that file's own
  // comment says "classes toggled by enhancements.js" — that script never
  // made it into the React migration, so the classes below were inert
  // until now). Runs once on mount; each element animates in once, then
  // is unobserved.
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

  // Closes the modal regardless of which flow opened it — mirrors
  // closeBooking() in the original (a single close path for both the
  // room-booking flow and the PayMongo-return flow).
  function handleCloseBooking() {
    setBookingRoom(null);
    setPaymongoReturn(null);
  }

  return (
    <>
      {/* HERO */}
      <section className="hero" id="home">
        <div className="hero-bg" style={{ '--hero-bg-image': `url(${heroBgImg})` }}></div>

        <div className="hero-inner">
          <div className="hero-content">
            <p className="hero-eyebrow">San Rafael Caingin · Open Daily 7AM–12AM</p>
            <h1>Where Family<br />Fun <em>Begins.</em></h1>
            <p className="hero-sub">
              Billiards, basketball, KTV, and more — all under one roof. Book a room in minutes, have fun all night.
            </p>
            <div className="hero-actions">
              <a href="#" className="btn-primary-hero" onClick={(e) => e.preventDefault()}>Book a Space</a>
              <a href="#rooms" className="btn-ghost-hero">See Rooms</a>
            </div>
          </div>

          <HeroCarousel />
        </div>
      </section>

      {/* ROOMS */}
      <section id="rooms">
        <div className="rooms-header reveal">
          <div>
            <div className="section-label">Book Your Space</div>
            <h2>Choose Your Room</h2>
          </div>
          <div className="rooms-header-right">
            <p>Walk-ins welcome.<br />Reservations recommended on weekends.</p>
            <Link to="/rooms" className="btn-view-all">
              View All Rooms <i className="fa-solid fa-chevron-right"></i>
            </Link>
          </div>
        </div>

        <div className="rooms-grid reveal-stagger" id="room-grid">
          {rooms === null && !loadError && (
            <div className="text-center text-muted py-4 w-100">
              Loading rooms…
            </div>
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
              <RoomCard
                key={room._id}
                room={room}
                liveStatus={liveStatuses[room._id]}
                onSelect={handleSelectRoom}
              />
            ))}
        </div>
      </section>

      {/* WHY BOOK ONLINE */}
      <section className="why-book">
        <div className="why-book-inner reveal">
          <div className="section-label">Why Book Online?</div>
          <h2>A few reasons to reserve ahead.</h2>
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

      {/* SPACES SHOWCASE */}
      <section className="spaces-showcase" style={{ background: 'var(--surface-alt)' }}>
        <div className="spaces">
          <div className="spaces-header reveal">
            <div className="section-label">Our Spaces</div>
            <h2>Designed for play,<br />built to last.</h2>
            <p>Every space at The Riverview is kept clean, well-lit, and ready to go — whether it's your first visit or your fiftieth.</p>
          </div>

          <div className="spaces-rows reveal-stagger">
            <div className="space-row">
              <div className="space-text">
                <h3>Billiards Room</h3>
                <p>Multiple tables, great lighting, and a chill atmosphere. Perfect for a quick session or a long evening with friends.</p>
              </div>
              <div className="space-img">
                <img src={billiardsImg} alt="Billiards" />
              </div>
            </div>

            <div className="space-row space-row-reverse">
              <div className="space-text">
                <h3>Basketball Court</h3>
                <p>Full-size court with proper flooring. Includes scoreboard, timer, and sound system for official games.</p>
              </div>
              <div className="space-img">
                <img src={courtImg} alt="Basketball Court" />
              </div>
            </div>

            <div className="space-row">
              <div className="space-text">
                <h3>KTV Room</h3>
                <p>Private rooms with updated song libraries. Bring your barkada, bring your voice. No judgment here.</p>
              </div>
              <div className="space-img">
                <img src={billiardsImg} alt="KTV Room" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about">
        <div className="about-inner">
          <div className="about-left reveal-left">
            <div className="section-label">About Us</div>
            <h2>Fun comes first.<br />Always.</h2>
            <p>At The Riverview, we believe the best nights are the ones you didn't plan. Play billiards, shoot hoops, belt out your favorite songs — we've got every kind of good time covered. A cozy, vibrant atmosphere with great vibes and even better company. Come as you are.</p>
          </div>

          <div className="about-right reveal-stagger">
            <div className="about-card">
              <div className="about-card-icon"><Clock3 size={20} color="var(--teal)" /></div>
              <h4>Open Daily</h4>
              <p>7AM to midnight, every day of the week. We keep the lights on so you can play longer.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon"><CalendarCheck size={20} color="var(--teal)" /></div>
              <h4>Easy Booking</h4>
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

      {/* HELPFUL INFORMATION — floating "?" widget, optional/informational
          only, not a warning or required notice. */}
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
    </>
  );
}

export default Home;