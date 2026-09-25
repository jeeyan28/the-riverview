function PageSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-label="Loading">
      <div className="page-skeleton-bar" />
      <div className="page-skeleton-bar short" />
      <div className="page-skeleton-block" />
      <span className="visually-hidden">Loading page…</span>
    </div>
  );
}

export default PageSkeleton;
