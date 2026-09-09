import { ChevronDown, Clock3, DoorOpen, Sparkles, Users } from 'lucide-react';
import Modal from './Modal';
import { variantRateLabel } from '../utils/roomPricing';

function RoomDetailsModal({ room, onClose, onReserve }) {
  if (!room) return null;
  const variants = room.variants?.length ? room.variants : [{
    label: room.name || 'Standard',
    price: room.price || 0,
    pax: room.pax,
    description: room.description,
    features: room.features || [],
    roomCount: 1,
  }];

  return (
    <Modal open={!!room} onClose={onClose} title={`${room.name} details`} size="xl">
      <div className="facility-detail-intro">
        <p>{room.description || 'Choose the room type that fits your group and preferred hourly rate.'} Tap a room type to see capacity, units, and amenities.</p>
        <span><Clock3 size={16} aria-hidden="true" /> Charged by whole hour</span>
      </div>
      <div className="facility-detail-variants">
        {variants.map((variant, index) => (
          <details className="facility-detail-variant" key={variant._id || variant.label || index}>
            <summary className="facility-detail-variant-head">
              <span className="facility-detail-variant-name">
                <strong>{variant.label || 'Standard'}</strong>
                <span className="facility-detail-rate">{variantRateLabel(variant)}</span>
              </span>
              {variant.bestFor && <span className="facility-detail-best">{variant.bestFor}</span>}
              <ChevronDown className="facility-detail-chevron" size={18} aria-hidden="true" />
            </summary>
            <div className="facility-detail-variant-body">
              {variant.description && <p className="facility-detail-description">{variant.description}</p>}
              <dl className="facility-detail-facts">
                <div><dt><Users size={15} aria-hidden="true" /> Capacity</dt><dd>{variant.pax || 'Ask staff'}</dd></div>
                <div><dt><DoorOpen size={15} aria-hidden="true" /> Units</dt><dd>{Number(variant.roomCount) || 1} available</dd></div>
                {Number(variant.extraGuestFee) > 0 && <div><dt><Users size={15} aria-hidden="true" /> Extra guests</dt><dd>₱{Number(variant.extraGuestFee).toLocaleString()}/guest/hr after {Number(variant.includedGuests) || 0}</dd></div>}
              </dl>
              {(variant.features?.length || room.features?.length) > 0 && (
                <ul className="facility-detail-features" aria-label={`${variant.label || room.name} features`}>
                  {(variant.features?.length ? variant.features : room.features).map((feature) => <li key={feature}><Sparkles size={14} aria-hidden="true" />{feature}</li>)}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
      <div className="modal-actions facility-detail-actions">
        <button type="button" className="pf-btn pf-btn-ghost" onClick={onClose}>Close</button>
        <button type="button" className="pf-btn pf-btn-solid" onClick={() => onReserve?.(room)}>Check availability</button>
      </div>
    </Modal>
  );
}

export default RoomDetailsModal;
