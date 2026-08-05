import { resolveImageUrl } from '../utils/resolveImageUrl';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';

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

// The facility card shown on the landing page before a guest clicks "Book
// Now" — i.e. what they see BEFORE the Booking Modal's room-picker step
// (that's RoomOptionCard, a different card for a different moment). Pass
// `onSelect` to make "Book Now" functional (Home.jsx); omit it for a
// static preview (Room Management's live preview) — same markup either way.
function FacilityBookingCard({ room, liveStatus, onSelect }) {
  const cardImage = room.image ? resolveImageUrl(room.image) : fallbackRoomImg;
  const hasVariants = room.variants && room.variants.length > 0;
  const startingPrice = hasVariants
    ? Math.min(...room.variants.map((v) => Number(v.price) || 0))
    : Number(room.price) || 0;
  const roomTypeCount = hasVariants ? room.variants.length : 0;

  const initiallyAvailable = room.status === 'Available';
  const statusLabel = liveStatus || (initiallyAvailable ? 'Available' : 'Unavailable');
  const statusClass =
    statusLabel === 'Fully Booked'
      ? 'room-status-fullybooked'
      : initiallyAvailable
      ? 'room-status-available'
      : 'room-status-unavailable';

  const interactive = typeof onSelect === 'function';

  return (
    <div className="room-card" data-room-id={room._id}>
      <div className="room-card-img">
        <img src={cardImage} alt={room.name} />
      </div>
      <div className="room-card-body">
        <h3>{room.name || 'Untitled Facility'}</h3>
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

        {interactive ? (
          <a href="#" className="btn-select" onClick={(e) => { e.preventDefault(); onSelect(room); }}>
            <i className="fa-solid fa-calendar-check"></i> Book Now
          </a>
        ) : (
          <span className="btn-select btn-select--preview">
            <i className="fa-solid fa-calendar-check"></i> Book Now
          </span>
        )}
      </div>
    </div>
  );
}

export default FacilityBookingCard;