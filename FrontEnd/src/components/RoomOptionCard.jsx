import { resolveImageUrl } from '../utils/resolveImageUrl';
import fallbackRoomImg from '../assets/pictures/Billiard.jpg';

// resolveImageUrl only branches on http(s):// vs relative path — a local
// blob:/data: preview URL (used for instant image previews before upload)
// would otherwise get incorrectly prefixed with the API origin.
function toDisplaySrc(image) {
  if (!image) return fallbackRoomImg;
  if (image.startsWith('blob:') || image.startsWith('data:')) return image;
  return resolveImageUrl(image);
}

// Renders one bookable option (a pricing tier / variant). Pass `onSelect`
// to make it clickable (customer booking flow); omit it for a static
// preview (admin live preview) — same markup either way.
function RoomOptionCard({ option, room, selected = false, disabled = false, onSelect }) {
  const cardImage = toDisplaySrc(option.image);
  const description = option.description || room?.description;
  const features = option.features && option.features.length ? option.features : room?.features;
  const interactive = typeof onSelect === 'function';

  return (
    <div
      className={
        'bk-room-option' +
        (selected ? ' bk-room-option--selected' : '') +
        (disabled ? ' bk-room-option--disabled' : '')
      }
      onClick={disabled || !interactive ? undefined : onSelect}
      style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <div className="bk-room-option-img">
        <img src={cardImage} alt={option.label || 'Room'} />
      </div>
      <div className="bk-room-option-body">
        <div className="bk-room-option-top">
          <div className="bk-room-option-name-wrap">
            <p className="bk-room-option-name">{option.label || 'Untitled'}</p>
          </div>
          {interactive && <span className={'bk-radio' + (selected ? ' bk-radio--selected' : '')}></span>}
        </div>
        {option.pax && (
          <p className="bk-room-option-pax"><i className="fa-solid fa-users"></i> {option.pax}</p>
        )}
        {description && <p className="bk-room-option-desc">{description}</p>}
        {features && features.length > 0 && (
          <ul className="bk-room-option-amenities">
            {features.map((f, fi) => (
              <li key={fi}><i className="fa-solid fa-check"></i>{f}</li>
            ))}
          </ul>
        )}
        <span className="bk-room-option-price">₱{option.price || 0}/hr</span>
      </div>
    </div>
  );
}

export default RoomOptionCard;