import { resolveImageUrl } from '../utils/resolveImageUrl';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';
import { CalendarCheck, Info, Layers3 } from 'lucide-react';

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

function FacilityBookingCard({ room, liveStatus, onSelect, onDetails }) {
  const cardImage = room.image ? resolveImageUrl(room.image) : fallbackRoomImg;
  const hasVariants = room.variants && room.variants.length > 0;
  const startingPrice = hasVariants
    ? Math.min(...room.variants.flatMap((v) => [
        Number(v.price) || 0,
        ...(v.pricingMode === 'time-based' && v.eveningPrice !== null && v.eveningPrice !== undefined && v.eveningPrice !== '' && Number.isFinite(Number(v.eveningPrice)) ? [Number(v.eveningPrice)] : []),
      ]))
    : Number(room.price) || 0;
  const roomTypeCount = hasVariants ? room.variants.length : 0;
  const visibleFeatures = Array.isArray(room.features) ? room.features.slice(0, 2) : [];
  const remainingFeatureCount = Math.max(0, (room.features?.length || 0) - visibleFeatures.length);

  const statusLabel = liveStatus || 'Available';
  const statusClass =
    statusLabel === 'Fully Reserved'
      ? 'room-status-fullybooked'
      : 'room-status-available';

  const interactive = typeof onSelect === 'function';

  return (
    <div className="room-card" data-room-id={room._id}>
      <div className="room-card-img">
        <span className={`room-card-status ${statusClass}`}>{statusLabel}</span>
        <img src={cardImage} alt={room.name} />
      </div>
      <div className="room-card-body">
        <h3>{room.name || 'Untitled Facility'}</h3>
        <span className="price-amt">From ₱{startingPrice.toLocaleString()}/hr</span>

        {(roomTypeCount > 0 || (room.features && room.features.length > 0)) && (
          <div className="room-card-tags">
            {roomTypeCount > 0 && (
              <span className="room-tag">
                <Layers3 size={14} aria-hidden="true" />
                {roomTypeCount} Room Type{roomTypeCount > 1 ? 's' : ''}
              </span>
            )}
            {visibleFeatures.map((f, i) => (
              <span className="room-tag" key={i}><i className={`fa-solid ${getFeatureIcon(f)}`}></i>{f}</span>
            ))}
            {remainingFeatureCount > 0 && <span className="room-tag room-tag--more">+{remainingFeatureCount} amenities</span>}
          </div>
        )}

        <p className="room-card-desc">{room.description || ''}</p>

        {interactive ? (
          <div className="room-card-actions">
            <button type="button" className="btn-room-details" onClick={() => onDetails?.(room)}>
              <Info size={16} aria-hidden="true" /> Details
            </button>
            <button type="button" className="btn-select" onClick={() => onSelect(room)}>
              <CalendarCheck size={16} aria-hidden="true" /> Reserve
            </button>
          </div>
        ) : (
          <span className="btn-select btn-select--preview">
            <CalendarCheck size={16} aria-hidden="true" /> Reserve
          </span>
        )}
      </div>
    </div>
  );
}

export default FacilityBookingCard;
