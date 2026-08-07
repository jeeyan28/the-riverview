import { resolveImageUrl } from '../utils/resolveImageUrl';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';

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

function FacilityBookingCard({ room, liveStatus, onSelect }) {
  const cardImage = room.image ? resolveImageUrl(room.image) : fallbackRoomImg;
  const hasVariants = room.variants && room.variants.length > 0;
  const startingPrice = hasVariants
    ? Math.min(...room.variants.map((v) => Number(v.price) || 0))
    : Number(room.price) || 0;
  const roomTypeCount = hasVariants ? room.variants.length : 0;

  const statusLabel = liveStatus || 'Available';
  const statusClass =
    statusLabel === 'Fully Reserved'
      ? 'room-status-fullybooked'
      : 'room-status-available';

  const interactive = typeof onSelect === 'function';

  return (
    <div className="room-card" data-room-id={room._id}>
      <div className="room-card-img">
        <img src={cardImage} alt={room.name} />
      </div>
      <div className="room-card-body">
        <h3>{room.name || 'Untitled Facility'}</h3>
        <span className="price-amt">Start at ₱{startingPrice}/hr</span>

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
            <i className="fa-solid fa-calendar-check"></i> Reserve Now
          </a>
        ) : (
          <span className="btn-select btn-select--preview">
            <i className="fa-solid fa-calendar-check"></i> Reserve Now
          </span>
        )}
      </div>
    </div>
  );
}

export default FacilityBookingCard;