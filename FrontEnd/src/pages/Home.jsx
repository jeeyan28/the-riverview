import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { getRoomCapacity, dateKey, fetchReservedHours } from '../utils/rooms';
import BookingModal from '../components/BookingModal';

import heroImg4 from '../assets/pictures/RiverView_4.jpg';
import heroImg5 from '../assets/pictures/RiverView_5.jpg';
import heroImg6 from '../assets/pictures/RiverView_6.jpg';
import heroImg7 from '../assets/pictures/RiverView_7.jpg';
import heroImg8 from '../assets/pictures/RiverView_8.jpg';
import billiardsImg from '../assets/images/billiards.png';
import courtImg from '../assets/images/court.png';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';

// ─────────────────────────────────────────────────────────────────────────
// Home — migrated from index.html + js/index.js (Phase 8, parts 1 & 2 of 3).
//
// Part 1 covered the STATIC/PUBLIC parts of the old single-page index.html:
// the hero image carousel, the live room grid (GET /api/rooms + the
// "Fully Booked" live-status upgrade), the Spaces showcase, and the About
// section. The header/footer/promo-banner/mobile-nav were already
// extracted into <Navbar/>/<Footer/> during Phases 6–7 and live in
// MainLayout, not here.
//
// Part 2 (this update) wires up the booking modal (steps: price →
// calendar → slots → payment → PayMongo return), built as
// <BookingModal/> in components/. Two things drive it from here:
//   - `bookingRoom` — set by handleSelectRoom() (was a documented no-op,
//     now opens the modal for real). The hero's "Book a Space" button
//     intentionally still does nothing on click — that matches the
//     ORIGINAL's behavior too (it's a bare `<a href="#">` in index.html
//     with no click handler in js/index.js beyond a decorative ripple
//     effect; only each room card's "Select Room" ever opened the modal).
//   - `paymongoReturn` — read once on mount from the URL's
//     ?paymongo=success|cancel&bookingId=... query params (useSearchParams),
//     mirroring handlePaymongoReturn()'s unconditional run on every
//     index.html page load. The URL is cleared immediately after reading,
//     same as the original's `window.history.replaceState(...)`.
//
// Part 3 (profile modal — details + change password) is now built as
// <ProfileModal/>, but it does NOT live here: it's rendered from
// MainLayout.jsx and opened via Navbar.jsx's user-chip "My Profile" button,
// since that header (and the modal it opens) is shared by every page
// MainLayout wraps, not just Home. See components/ProfileModal.jsx's
// header comment for the full reasoning.
//
// Still NOT part of this phase:
//   - Wiring live announcement-banner text (from useSiteSettings' `settings`)
//     into <Navbar/> — it still shows Phase 6's static banner text.
//   - Real logged-in/logged-out header state (the user-chip is still
//     `display:none` in Navbar.jsx) — Phase 10 (AuthContext).
//
// API_BASE_URL is still hardcoded, matching every other page pre-Phase 9.
// ─────────────────────────────────────────────────────────────────────────

const API_BASE_URL = 'http://localhost:3000';
const HERO_CAROUSEL_INTERVAL_MS = 4000;

const HERO_SLIDES = [
  { src: heroImg4, alt: 'The Riverview' },
  { src: heroImg5, alt: 'Court' },
  { src: heroImg6, alt: 'VIP' },
  { src: heroImg7, alt: 'Billiards' },
  { src: heroImg8, alt: 'Court 2' },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(index) {
    setCurrent((index + HERO_SLIDES.length) % HERO_SLIDES.length);
    start(); // restart the interval, same as restart() in the original
  }

  return (
    <div className="hero-carousel" id="heroCarousel" onMouseEnter={stop} onMouseLeave={start}>
      <div className="hero-carousel-track" id="heroCarouselTrack">
        {HERO_SLIDES.map((slide, i) => (
          <div key={slide.src} className={`hero-carousel-slide${i === current ? ' is-active' : ''}`}>
            <img src={slide.src} alt={slide.alt} />
          </div>
        ))}
      </div>

      <button
        type="button"
        className="hero-carousel-arrow hero-carousel-arrow-prev"
        aria-label="Previous slide"
        onClick={() => goTo(current - 1)}
      >
        <i className="fa-solid fa-chevron-left"></i>
      </button>
      <button
        type="button"
        className="hero-carousel-arrow hero-carousel-arrow-next"
        aria-label="Next slide"
        onClick={() => goTo(current + 1)}
      >
        <i className="fa-solid fa-chevron-right"></i>
      </button>

      <div className="hero-carousel-dots" id="heroCarouselDots">
        {HERO_SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            className={`hero-carousel-dot${i === current ? ' is-active' : ''}`}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </div>
  );
}

function RoomCard({ room, liveStatus, onSelect }) {
  const hasVariants = room.variants && room.variants.length > 0;
  const cardImage = room.image ? resolveImageUrl(room.image) : fallbackRoomImg;
  const capacity = getRoomCapacity(room);

  const priceItems = hasVariants
    ? room.variants
    : [{ label: 'Standard', price: room.price || 0, pax: '' }];

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
        {capacity && (
          <p className="room-card-capacity">
            <i className="fa-solid fa-users"></i> Up to {capacity} guests
          </p>
        )}
        <ul className="price-list">
          {priceItems.map((v, i) => (
            <li key={i}>
              <span className="price-name">
                {v.label}
                {v.pax && <span className="price-pax"> · {v.pax}</span>}
              </span>
              <span className="price-amt">₱{v.price}/hr</span>
            </li>
          ))}
        </ul>
        <p className="room-card-desc">{room.description || ''}</p>
        {room.features && room.features.length > 0 && (
          <div className="room-card-features">
            {room.features.map((f, i) => (
              <span className="room-feature-chip" key={i}>{f}</span>
            ))}
          </div>
        )}
        <span className={`room-card-status ${statusClass}`}>{statusLabel}</span>
        <a href="#" className="btn-select" onClick={(e) => { e.preventDefault(); onSelect(room); }}>
          Select Room
        </a>
      </div>
    </div>
  );
}

function Home() {
  const { settings, openHour, closeHour, loaded: settingsLoaded } = useSiteSettings();
  const [rooms, setRooms] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(false);
  const [liveStatuses, setLiveStatuses] = useState({}); // { [roomId]: 'Fully Booked' }

  const [bookingRoom, setBookingRoom] = useState(null); // room object, or null when closed
  const [paymongoReturn, setPaymongoReturn] = useState(null); // { result, bookingId }, or null
  const [searchParams, setSearchParams] = useSearchParams();

  // handlePaymongoReturn (URL-reading half) — migrated 1:1 from js/index.js.
  // Runs once on mount, exactly like the original's unconditional
  // `handlePaymongoReturn();` call at the bottom of index.js. Cleans the
  // URL immediately so refreshing/sharing it doesn't re-trigger this.
  useEffect(() => {
    const result = searchParams.get('paymongo');
    const bookingId = searchParams.get('bookingId');
    if (!result || !bookingId) return;

    setPaymongoReturn({ result, bookingId });
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
              const reserved = await fetchReservedHours(room._id, todayStr);
              let fullyBooked = currentHour < closeHour; // only meaningful if time remains today
              for (let h = currentHour; h < closeHour && fullyBooked; h++) {
                if (!reserved.includes(h)) fullyBooked = false;
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

  function handleSelectRoom(room) {
    setBookingRoom(room);
  }

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
        <div className="hero-bg"></div>

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
        <div className="rooms-header">
          <div>
            <div className="section-label" style={{ color: 'var(--teal)' }}>Book a Space</div>
            <h2>Choose Your Room</h2>
          </div>
          <p>All rooms available. Walk-ins welcome — reservations recommended on weekends.</p>
        </div>

        <div className="room-grid" id="room-grid">
          {rooms === null && !loadError && (
            <div style={{ textAlign: 'center', color: '#888', padding: '32px 0', width: '100%' }}>
              Loading rooms…
            </div>
          )}
          {loadError && (
            <div style={{ textAlign: 'center', color: '#888', padding: '32px 0', width: '100%' }}>
              Could not load rooms right now. Please try again later.
            </div>
          )}
          {rooms !== null && !loadError && rooms.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', padding: '32px 0', width: '100%' }}>
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

      {/* SPACES SHOWCASE */}
      <section style={{ background: 'var(--surface-alt)' }}>
        <div className="spaces">
          <div className="spaces-header">
            <div className="section-label">Our Spaces</div>
            <h2>Designed for play,<br />built to last.</h2>
            <p>Every space at The Riverview is kept clean, well-lit, and ready to go — whether it's your first visit or your fiftieth.</p>
          </div>

          <div className="spaces-list">
            <div className="space-row">
              <div className="space-img">
                <img src={billiardsImg} alt="Billiards" />
              </div>
              <div className="space-text">
                <div className="space-num">01</div>
                <div className="space-info">
                  <h3>Billiards Room</h3>
                  <p>Multiple tables, great lighting, and a chill atmosphere. Perfect for a quick session or a long evening with friends.</p>
                </div>
              </div>
            </div>
            <div className="space-row">
              <div className="space-img">
                <img src={courtImg} alt="Basketball Court" />
              </div>
              <div className="space-text">
                <div className="space-num">02</div>
                <div className="space-info">
                  <h3>Basketball Court</h3>
                  <p>Full-size court with proper flooring. Includes scoreboard, timer, and sound system for official games.</p>
                </div>
              </div>
            </div>
            <div className="space-row">
              <div className="space-img">
                <img src={billiardsImg} alt="KTV Room" />
              </div>
              <div className="space-text">
                <div className="space-num">03</div>
                <div className="space-info">
                  <h3>KTV Room</h3>
                  <p>Private rooms with updated song libraries. Bring your barkada, bring your voice. No judgment here.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about">
        <div className="about-inner">
          <div className="about-left">
            <div className="section-label">About Us</div>
            <h2>Fun comes first.<br />Always.</h2>
            <p>At The Riverview, we believe the best nights are the ones you didn't plan. Play billiards, shoot hoops, belt out your favorite songs — we've got every kind of good time covered. A cozy, vibrant atmosphere with great vibes and even better company. Come as you are.</p>
          </div>

          <div className="about-right">
            <div className="about-card">
              <div className="about-card-icon">🕐</div>
              <h4>Open Daily</h4>
              <p>7AM to midnight, every day of the week. We keep the lights on so you can play longer.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">📱</div>
              <h4>Easy Booking</h4>
              <p>Reserve your room online in seconds. Walk-ins always welcome, reservations always smoother.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">🎉</div>
              <h4>Events & Parties</h4>
              <p>Celebrating something? We'll help set it up. Birthdays, team events, reunions — we handle it.</p>
            </div>
            <div className="about-card">
              <div className="about-card-icon">🏆</div>
              <h4>Official Games</h4>
              <p>Full scoreboard, timer, and sound system for serious basketball matchups. Play like it counts.</p>
            </div>
          </div>
        </div>
      </section>

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