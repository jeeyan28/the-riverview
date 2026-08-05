function PageSkeleton() {
  return (
    <div className="page-skeleton">
      <div className="skeleton-navbar">
        <div className="skeleton skeleton-logo" />
        <div className="skeleton-nav-links">
          <div className="skeleton skeleton-pill" />
          <div className="skeleton skeleton-pill" />
          <div className="skeleton skeleton-pill" />
        </div>
      </div>

      <div className="skeleton-hero">
        <div className="skeleton skeleton-hero-title" />
        <div className="skeleton skeleton-hero-subtitle" />
      </div>

      <div className="skeleton-cards">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>

      <div className="skeleton-footer">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line" />
      </div>
    </div>
  );
}

export default PageSkeleton;