import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock3, CreditCard, Search } from 'lucide-react';
import BookingModal from '../components/BookingModal';
import FacilityBookingCard from '../components/FacilityBookingCard';
import FacilityCardSkeleton from '../components/FacilityCardSkeleton';
import RoomDetailsModal from '../components/RoomDetailsModal';
import Toast from '../components/Toast';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { useToast } from '../hooks/useToast';
import { roomsService } from '../services/rooms';
import '../styles/rooms-page.css';

const SERVICE_ORDER = ['All', 'Billiards', 'KTV', 'Court'];

function serviceFor(room) {
  const value = `${room?.name || ''} ${room?.description || ''}`.toLowerCase();
  if (value.includes('billiard') || value.includes('pool')) return 'Billiards';
  if (value.includes('ktv') || value.includes('karaoke')) return 'KTV';
  if (value.includes('court') || value.includes('basketball')) return 'Court';
  return room?.name || 'Other';
}

function Rooms() {
  const { settings, openHour, closeHour, refetch: refetchSettings } = useSiteSettings();
  const { toast, showToast } = useToast();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState('All');
  const [bookingRoom, setBookingRoom] = useState(null);
  const [detailRoom, setDetailRoom] = useState(null);

  async function loadRooms() {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await roomsService.list();
      setRooms(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRooms();
  }, []);

  const services = useMemo(() => {
    const available = new Set(rooms.map(serviceFor));
    const known = SERVICE_ORDER.filter((item) => item === 'All' || available.has(item));
    const other = [...available].filter((item) => !SERVICE_ORDER.includes(item)).sort();
    return [...known, ...other];
  }, [rooms]);

  const visibleRooms = filter === 'All'
    ? rooms
    : rooms.filter((room) => serviceFor(room) === filter);

  async function openBooking(room) {
    setBookingRoom(room);
    refetchSettings();
    try {
      const freshRoom = await roomsService.get(room._id);
      setBookingRoom(freshRoom);
    } catch (error) {
      if (error?.status === 404) {
        setBookingRoom(null);
        setRooms((current) => current.filter((item) => item._id !== room._id));
        showToast('This facility is no longer available.', 'error');
      }
    }
  }

  return (
    <div className="rp-page">
      <section className="rp-hero" aria-labelledby="rooms-title">
        <div className="rp-hero-inner">
          <div className="rp-hero-copy">
            <div className="section-label">Live Facility Catalog</div>
            <h1 id="rooms-title">Choose a space, then reserve your time.</h1>
            <p>
              Browse the facilities managed by The Riverview team. Prices, room types,
              and availability come directly from the reservation system.
            </p>
          </div>
          <div className="rp-hero-note" aria-label="Reservation rules">
            <div><Clock3 size={18} aria-hidden="true" /><span><strong>1–5 hours</strong>Whole-hour reservations</span></div>
            <div><CreditCard size={18} aria-hidden="true" /><span><strong>Secure down payment</strong>Confirms your slot online</span></div>
          </div>
        </div>
      </section>

      <section className="rp-catalog" aria-labelledby="facility-list-title">
        <div className="rp-filter-bar">
          <div>
            <div className="section-label">Available Services</div>
            <h2 id="facility-list-title" className="visually-hidden">Bookable facilities</h2>
            <div className="rp-filter-list" role="group" aria-label="Filter facilities by service">
              {services.map((service) => (
                <button
                  key={service}
                  type="button"
                  className={`rp-filter-button${filter === service ? ' is-selected' : ''}`}
                  aria-pressed={filter === service}
                  onClick={() => setFilter(service)}
                >
                  {service}
                </button>
              ))}
            </div>
          </div>
          <span className="rp-result-count">
            {loading ? 'Loading facilities…' : `${visibleRooms.length} facilit${visibleRooms.length === 1 ? 'y' : 'ies'}`}
          </span>
        </div>

        <div className="rooms-grid">
          {loading && <><FacilityCardSkeleton /><FacilityCardSkeleton /><FacilityCardSkeleton /></>}

          {!loading && loadError && (
            <div className="rp-empty">
              <Search size={24} aria-hidden="true" />
              <h3>Facilities could not be loaded</h3>
              <p>Please check your connection and try again.</p>
              <button type="button" className="btn-select" onClick={loadRooms}>Try again</button>
            </div>
          )}

          {!loading && !loadError && visibleRooms.length === 0 && (
            <div className="rp-empty">
              <CalendarCheck size={24} aria-hidden="true" />
              <h3>No facilities in this category yet</h3>
              <p>The admin-managed inventory will appear here as soon as it is available.</p>
            </div>
          )}

          {!loading && !loadError && visibleRooms.map((room) => (
            <FacilityBookingCard key={room._id} room={room} onSelect={openBooking} onDetails={setDetailRoom} />
          ))}
        </div>
      </section>

      <RoomDetailsModal room={detailRoom} onClose={() => setDetailRoom(null)} onReserve={(room) => { setDetailRoom(null); openBooking(room); }} />

      <BookingModal
        room={bookingRoom}
        onClose={() => setBookingRoom(null)}
        openHour={openHour}
        closeHour={closeHour}
        settings={settings}
      />
      <Toast {...toast} />
    </div>
  );
}

export default Rooms;
