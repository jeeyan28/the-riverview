import { useState } from 'react';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';
import { variantRateLabel } from '../utils/roomPricing';

function toDisplaySrc(image) {
  if (!image) return fallbackRoomImg;
  if (image.startsWith('blob:') || image.startsWith('data:')) return image;
  return resolveImageUrl(image);
}

function featureIcon(feature) {
  const f = String(feature || '').toLowerCase();
  if (f.includes('air') || f.includes('aircon')) return 'fa-solid fa-snowflake';
  if (f.includes('premium') || f.includes('table')) return 'fa-solid fa-crown';
  if (f.includes('food') || f.includes('drink')) return 'fa-solid fa-utensils';
  return 'fa-solid fa-circle-check';
}

function RoomOptionCard({ option, room, selected = false, disabled = false, onSelect, availableCount }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const cardImage = toDisplaySrc(option.image);
  const description = option.description || room?.description;
  const features = option.features && option.features.length ? option.features : room?.features;
  const interactive = typeof onSelect === 'function';
  const bestFor = option.bestFor || room?.bestFor;
  const totalRooms = Number(option.roomCount) || 1;
  const showAvailability = interactive && Number.isFinite(availableCount) && !disabled;
  const hasDetails = !!description || showAvailability;
  const expanded = (interactive ? detailsOpen : true) && (hasDetails || !interactive);

  function handleKeyDown(e) {
    if (!interactive || disabled) return;
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  }

  function handleToggleDetails(e) {
    e.stopPropagation();
    setDetailsOpen((v) => !v);
  }

  return (
    <div
      className={
        'bk-room-option' +
        (selected ? ' bk-room-option--selected' : '') +
        (expanded ? ' bk-room-option--expanded' : '') +
        (disabled ? ' bk-room-option--disabled' : '')
      }
      onClick={disabled || !interactive ? undefined : onSelect}
      onKeyDown={interactive ? handleKeyDown : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-disabled={disabled || undefined}
      aria-label={interactive ? `Select ${option.label || 'room'}, ${variantRateLabel(option)}` : undefined}
    >
      <div className="bk-room-option-collapsed">
        <div className="bk-room-option-img">
          <img src={cardImage} alt={option.label || 'Room'} />
        </div>
        <div className="bk-room-option-body">
          <div className="bk-room-option-top">
            <div className="bk-room-option-name-wrap">
              <p className="bk-room-option-name">{option.label || 'Untitled'}</p>
              {bestFor && <span className="bk-room-option-badge">{bestFor}</span>}
            </div>
            {interactive && (
              <span className={'bk-radio' + (selected ? ' bk-radio--selected' : '')}>
                {selected && <i className="fa-solid fa-check"></i>}
              </span>
            )}
          </div>
          {option.pax && (
            <p className="bk-room-option-pax"><i className="fa-solid fa-users"></i> {option.pax}</p>
          )}
          {features && features.length > 0 && (
            <ul className="bk-room-option-amenities-row">
              {features.map((f, fi) => (
                <li key={fi} className="bk-room-option-amenity">
                  <i className={featureIcon(f)}></i>{f}
                </li>
              ))}
            </ul>
          )}
          <div className="bk-room-option-bottom-row">
            <span className="bk-room-option-price">{variantRateLabel(option)}</span>
            {interactive && hasDetails && (
              <button
                type="button"
                className="bk-room-option-details-btn"
                onClick={handleToggleDetails}
                aria-expanded={detailsOpen}
              >
                {detailsOpen ? 'Hide Details' : 'View Details'}
                <i className={'fa-solid fa-arrow-right' + (detailsOpen ? ' bk-room-option-details-btn-icon--open' : '')}></i>
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="bk-room-option-expanded" onClick={(event) => event.stopPropagation()}>
          {description && <p>{description}</p>}
          <div className="bk-room-option-detail-facts">
            <span><strong>{totalRooms}</strong> unit{totalRooms === 1 ? '' : 's'}</span>
            {showAvailability && <span><strong>{availableCount}</strong> available for this time</span>}
            {Number(option.extraGuestFee) > 0 && <span><strong>₱{Number(option.extraGuestFee).toLocaleString()}</strong> per extra guest/hour after {Number(option.includedGuests) || 0}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default RoomOptionCard;
