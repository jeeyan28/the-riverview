function FacilityCardSkeleton() {
  return (
    <div className="room-card room-card-skeleton">
      <div className="room-card-img">
        <div className="skeleton skeleton-room-img" />
      </div>
      <div className="room-card-body">
        <div className="skeleton skeleton-room-title" />
        <div className="skeleton skeleton-room-price" />
        <div className="room-card-tags">
          <div className="skeleton skeleton-room-tag" />
          <div className="skeleton skeleton-room-tag" />
        </div>
        <div className="skeleton skeleton-room-desc" />
        <div className="skeleton skeleton-room-desc skeleton-room-desc--short" />
        <div className="skeleton skeleton-room-btn" />
      </div>
    </div>
  );
}

export default FacilityCardSkeleton;