// ─────────────────────────────────────────────────────────────────────────
// DataTable — generic table, per components/README.md ("DataTable.jsx —
// bookings, users, POS sales tables"). Matches admin.html's `.tbl` markup
// (see the Dashboard panel's "Recent Bookings" table for the original:
// <table class="tbl"><thead>...<tbody id="dash-recent-bookings">Loading…).
//
// `columns` is an array of { key, label, render? }. If a column needs
// custom formatting (a status pill, a formatted date, a currency value),
// pass `render(row)` — otherwise it just reads `row[key]`. This mirrors
// the actual variety inside admin.js's table-building code, without baking
// in any one page's specific formatting logic here.
//
// Usage (as Admin/Bookings.jsx will use it in Phase 8):
//   <DataTable
//     columns={[
//       { key: 'guest', label: 'Guest' },
//       { key: 'room', label: 'Room' },
//       { key: 'timeIn', label: 'Time In' },
//       { key: 'status', label: 'Status', render: (row) => <StatusPill status={row.status} /> },
//     ]}
//     rows={bookings}
//     loading={loading}
//     emptyMessage="No bookings yet."
//   />
// ─────────────────────────────────────────────────────────────────────────
function DataTable({ columns, rows, loading, emptyMessage = 'No data yet.', getRowKey }) {
  return (
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
        ) : !rows || rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px 0' }}>
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={getRowKey ? getRowKey(row) : i}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export default DataTable;
