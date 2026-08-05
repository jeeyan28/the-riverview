
import { useEffect, useState } from 'react';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50];

function DataTable({
  columns,
  rows,
  loading,
  emptyMessage = 'No data yet.',
  getRowKey,
  paginate = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  defaultPageSize = pageSizeOptions[0],
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  useEffect(() => {
    setPage(1);
  }, [rows]);

  const allRows = rows || [];
  const totalRows = allRows.length;
  const totalPages = paginate ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const safePage = Math.min(page, totalPages);
  const visibleRows = paginate ? allRows.slice((safePage - 1) * pageSize, safePage * pageSize) : allRows;

  const rangeStart = totalRows === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, totalRows);

  return (
    <>
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0' }}>
                Loading…
              </td>
            </tr>
          ) : totalRows === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            visibleRows.map((row, i) => (
              <tr key={getRowKey ? getRowKey(row) : i}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {paginate && !loading && totalRows > 0 && (
        <div className="dt-pagination">
          <div className="dt-pagination-size">
            <label htmlFor="dt-page-size">Show</label>
            <select
              id="dt-page-size"
              className="users-filter-input"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span>per page · {rangeStart}–{rangeEnd} of {totalRows}</span>
          </div>
          <div className="dt-pagination-nav">
            <button className="card-action" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
              <i className="ti ti-chevron-left"></i> Prev
            </button>
            <span>Page {safePage} of {totalPages}</span>
            <button className="card-action" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <i className="ti ti-chevron-right"></i>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default DataTable;