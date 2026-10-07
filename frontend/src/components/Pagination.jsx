function Pagination({ page, pageSize, totalItems, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50], itemLabel = 'items' }) {
  if (totalItems === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const rangeStart = (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalItems);

  return (
    <div className="dt-pagination">
      <div className="dt-pagination-size">
        <label htmlFor="pg-page-size">Show</label>
        <select
          id="pg-page-size"
          className="users-filter-input"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span>per page · {rangeStart}–{rangeEnd} of {totalItems} {itemLabel}</span>
      </div>
      <div className="dt-pagination-nav">
        <button className="card-action" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
          <i className="ti ti-chevron-left"></i> Prev
        </button>
        <span>Page {safePage} of {totalPages}</span>
        <button className="card-action" disabled={safePage >= totalPages} onClick={() => onPageChange(safePage + 1)}>
          Next <i className="ti ti-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

export default Pagination;