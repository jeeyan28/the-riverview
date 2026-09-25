import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Clock3,
  CreditCard,
  DoorOpen,
  Layers3,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import BookingModal from '../components/BookingModal';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { roomsService } from '../services/rooms';
import { getPaxCapacity, priceOptionsFor } from '../utils/rooms';
import { variantRateLabel } from '../utils/roomPricing';
import { facilityImage } from '../utils/facilityImage';
import '../styles/facility-details.css';
import { useAuth } from '../context/AuthContext';
import { buildLoginPath, buildRoomReservationPath } from '../utils/auth';

function money(value) {
  return `₱${Number(value || 0).toLocaleString()}`;
}

function availablePrices(variant) {
  const prices = [Number(variant?.price)];
  if (variant?.pricingMode === 'time-based' && variant?.eveningPrice !== null && variant?.eveningPrice !== undefined && variant?.eveningPrice !== '') {
    prices.push(Number(variant.eveningPrice));
  }
  return prices.filter((price) => Number.isFinite(price) && price >= 0);
}

function sectionId(label, index) {
  const slug = String(label || `room-${index + 1}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `room-${slug || index + 1}`;
}

function ReservationAction({ user, roomId, variantLabel = '', className, disabled = false, onStart, children }) {
  if (!user && !disabled) {
    return (
      <Link className={className} to={buildLoginPath(buildRoomReservationPath(roomId, variantLabel))}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={() => onStart(variantLabel)} disabled={disabled}>
      {children}
    </button>
  );
}

function FacilityDetails() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { settings, openHour, closeHour } = useSiteSettings();
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingRoom, setBookingRoom] = useState(null);
  const [initialVariantLabel, setInitialVariantLabel] = useState('');
  const reserveIntent = searchParams.get('reserve') === '1';
  const reserveVariant = searchParams.get('variant') || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    roomsService.get(roomId)
      .then((data) => {
        if (!cancelled) setRoom(data);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError?.status === 404
            ? 'This facility is no longer available.'
            : 'We could not load this facility. Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [roomId]);

  useEffect(() => {
    if (!room?.name) return undefined;
    const previousTitle = document.title;
    document.title = `${room.name} | The Riverview`;
    return () => { document.title = previousTitle; };
  }, [room?.name]);

  const variants = useMemo(() => room ? priceOptionsFor(room) : [], [room]);
  const summary = useMemo(() => {
    const prices = variants.flatMap(availablePrices);
    const capacities = variants.map((variant) => getPaxCapacity(variant.pax)).filter(Number.isFinite);
    return {
      startingPrice: prices.length ? Math.min(...prices) : 0,
      units: variants.reduce((total, variant) => total + (Number(variant.roomCount) || 1), 0),
      maxGuests: capacities.length ? Math.max(...capacities) : null,
    };
  }, [variants]);

  useEffect(() => {
    if (!room || !reserveIntent) return;
    const returnPath = buildRoomReservationPath(room._id, reserveVariant);
    if (!user) {
      navigate(buildLoginPath(returnPath), { replace: true });
      return;
    }
    setInitialVariantLabel(reserveVariant);
    setBookingRoom(room);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('reserve');
    nextParams.delete('variant');
    setSearchParams(nextParams, { replace: true });
  }, [room, reserveIntent, reserveVariant, user, navigate, searchParams, setSearchParams]);

  function startBooking(variantLabel = '') {
    if (!user) {
      navigate(buildLoginPath(buildRoomReservationPath(room._id, variantLabel)));
      return;
    }
    setInitialVariantLabel(variantLabel);
    setBookingRoom(room);
  }

  if (loading) {
    return (
      <div className="fd-page fd-page--state">
        <div className="fd-state-card" role="status">Loading facility details…</div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="fd-page fd-page--state">
        <div className="fd-state-card">
          <h1>Facility unavailable</h1>
          <p>{error || 'This facility could not be found.'}</p>
          <Link to="/rooms" className="fd-primary-link"><ArrowLeft size={17} /> Back to facilities</Link>
        </div>
      </div>
    );
  }

  const heroImage = facilityImage(room.image, room.name);

  return (
    <div className="fd-page">
      <header className="fd-hero">
        <div className="fd-hero-inner">
          <Link to="/rooms" className="fd-back"><ArrowLeft size={17} aria-hidden="true" /> All facilities</Link>
          <div className="fd-hero-grid">
            <div className="fd-hero-media">
              {heroImage ? <img src={heroImage} alt={`${room.name} at The Riverview`} /> : <strong className="facility-name-placeholder">{room.name}</strong>}
              <span>Availability is checked by date and time</span>
            </div>
            <div className="fd-hero-copy">
              <h1>{room.name}</h1>
              <p>{room.description || 'Explore every managed room type, hourly rate, capacity, and amenity before choosing your schedule.'}</p>
              <div className="fd-hero-actions">
                <ReservationAction user={user} roomId={room._id} className="fd-primary-button" onStart={startBooking}>
                  <CalendarCheck size={18} aria-hidden="true" /> Start reservation
                </ReservationAction>
                <a href="#room-types" className="fd-secondary-link">Compare rooms <ArrowRight size={17} aria-hidden="true" /></a>
              </div>
            </div>
          </div>
          <dl className="fd-summary-strip" aria-label={`${room.name} summary`}>
            <div><dt>Room types</dt><dd>{variants.length}</dd></div>
            <div><dt>Listed units</dt><dd>{summary.units}</dd></div>
            <div><dt>Hourly rate</dt><dd>{summary.startingPrice ? `From ${money(summary.startingPrice)}` : 'Ask staff'}</dd></div>
            <div><dt>Largest capacity</dt><dd>{summary.maxGuests ? `${summary.maxGuests} guests` : 'Ask staff'}</dd></div>
          </dl>
        </div>
      </header>

      <div className="fd-content">
        <aside className="fd-booking-guide" aria-labelledby="fd-guide-title">
          <div>
            <Layers3 size={20} aria-hidden="true" />
            <h2 id="fd-guide-title">Before you reserve</h2>
          </div>
          <ol>
            <li><strong>Choose a room type</strong><span>Compare its capacity, units, amenities, and exact hourly rate.</span></li>
            <li><strong>Pick 1–5 whole hours</strong><span>The calendar checks availability for your selected room type.</span></li>
            <li><strong>Pay for 1 hour or in full</strong><span>Your remaining balance stays visible in your account and to staff.</span></li>
          </ol>
          <p><Clock3 size={16} aria-hidden="true" /> Operating times come from the venue schedule configured by staff.</p>
          <p><CreditCard size={16} aria-hidden="true" /> Online confirmation requires the displayed payment.</p>
          <ReservationAction user={user} roomId={room._id} className="fd-primary-button" onStart={startBooking}>
            <CalendarCheck size={18} aria-hidden="true" /> Check availability
          </ReservationAction>
        </aside>

        <section className="fd-room-section" id="room-types" aria-labelledby="fd-room-title">
          <div className="fd-section-heading">
            <h2 id="fd-room-title">Rooms, rates, and inclusions</h2>
            <p>Rates apply per whole hour. Select a room type to carry it into the reservation flow.</p>
          </div>

          <div className="fd-room-list">
            {variants.map((variant, index) => {
              const features = variant.features?.length ? variant.features : room.features || [];
              const image = facilityImage(variant.image, room.name, variant.label, room.image);
              const roomCount = Number(variant.roomCount) || 1;
              const status = variant.status || 'Available';
              return (
                <article className="fd-room" id={sectionId(variant.label, index)} key={variant.label || index}>
                  <div className="fd-room-media">{image ? <img src={image} alt={`${variant.label || room.name} room`} loading="lazy" /> : <span className="facility-name-placeholder">{variant.label || room.name}</span>}</div>
                  <div className="fd-room-body">
                    <div className="fd-room-title-row">
                      <div>
                        <h3>{variant.label || 'Standard'}</h3>
                        {variant.bestFor && <span className="fd-best-for">{variant.bestFor}</span>}
                      </div>
                      <span className={`fd-status fd-status--${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
                    </div>
                    <p className="fd-rate">{variantRateLabel(variant)}</p>
                    <p className="fd-room-description">{variant.description || room.description || 'Managed room type available for whole-hour reservations.'}</p>

                    <dl className="fd-room-facts">
                      <div><dt><UsersRound size={15} aria-hidden="true" /> Capacity</dt><dd>{variant.pax || room.capacity || 'Ask staff'}</dd></div>
                      <div><dt><DoorOpen size={15} aria-hidden="true" /> Units</dt><dd>{roomCount} {roomCount === 1 ? 'room' : 'rooms'}</dd></div>
                      <div><dt><Clock3 size={15} aria-hidden="true" /> Billing</dt><dd>Whole hour</dd></div>
                      {Number(variant.extraGuestFee) > 0 && (
                        <div><dt><UsersRound size={15} aria-hidden="true" /> Extra guests</dt><dd>{money(variant.extraGuestFee)}/guest/hr after {Number(variant.includedGuests) || 0}</dd></div>
                      )}
                    </dl>

                    {features.length > 0 && (
                      <div className="fd-amenities">
                        <h4>Included amenities</h4>
                        <ul>{features.map((feature) => <li key={feature}><Sparkles size={14} aria-hidden="true" /> {feature}</li>)}</ul>
                      </div>
                    )}

                    <ReservationAction
                      user={user}
                      roomId={room._id}
                      variantLabel={variant.label}
                      className="fd-room-cta"
                      disabled={status !== 'Available'}
                      onStart={startBooking}
                    >
                      {status === 'Available' ? `Reserve ${variant.label || 'this room'}` : `${variant.label || 'Room'} unavailable`}
                      {status === 'Available' && <ArrowRight size={17} aria-hidden="true" />}
                    </ReservationAction>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

      </div>

      <BookingModal
        room={bookingRoom}
        initialVariantLabel={initialVariantLabel}
        onClose={() => {
          setBookingRoom(null);
          setInitialVariantLabel('');
        }}
        openHour={openHour}
        closeHour={closeHour}
        settings={settings}
      />
    </div>
  );
}

export default FacilityDetails;
