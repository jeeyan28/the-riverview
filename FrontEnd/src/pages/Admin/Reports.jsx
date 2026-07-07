// ─────────────────────────────────────────────────────────────────────────
// Admin / Reports — migrated from admin.html's <div id="panel-reports">.
// Part of Phase 8 (Page Migration).
//
// IMPORTANT — unlike every other Admin page so far (even Analytics, which
// at least had mock Chart.js data), this panel has ZERO logic behind it in
// the original: no report/export endpoint exists anywhere in
// Backend/routes (confirmed — nothing report/export/csv/xlsx/pdf-shaped
// in any route file), and admin.js has no reports-related code at all —
// not renderReportsPanel(), not one onclick handler on any of the six
// "Export" buttons or the "Generate Report" button. The six report cards'
// names/dates and the date-range inputs' preset values are exactly the
// hardcoded strings admin.html shipped with; nothing here ever read from
// a server. This file is a straight, honest port of that: the cards,
// labels, and buttons all render, but the buttons intentionally have no
// onClick — clicking Export or Generate Report in the original did
// nothing, and this preserves that rather than inventing behavior that
// was never there. If a real reporting/export feature gets built later,
// this is the file to wire it into.
//
// The two date inputs use `defaultValue` (uncontrolled) rather than
// `value`, since the original HTML `value="2026-06-01"` just set an
// initial, still-freely-editable value with no JS ever reading or
// resetting it — `defaultValue` is the faithful React equivalent of that,
// where `value` alone (with no onChange) would make the field read-only
// and is not what the original behaved like.
// ─────────────────────────────────────────────────────────────────────────

const REPORT_ITEMS = [
  { icon: 'file-spreadsheet', bg: 'rgba(0,201,167,.1)', color: 'var(--teal)', name: 'Daily Booking Report', date: 'Today, Jun 25 2026' },
  { icon: 'file-analytics', bg: 'rgba(55,138,221,.1)', color: '#378ADD', name: 'Weekly Revenue Summary', date: 'Jun 19–25 2026' },
  { icon: 'chart-pie', bg: 'rgba(239,159,39,.1)', color: '#EF9F27', name: 'Room Utilization Report', date: 'This month' },
  { icon: 'users', bg: 'rgba(212,83,126,.1)', color: '#D4537E', name: 'Guest Activity Log', date: 'All time' },
  { icon: 'calendar-stats', bg: 'rgba(99,153,34,.1)', color: '#639922', name: 'Monthly Summary', date: 'June 2026' },
  { icon: 'alert-triangle', bg: 'rgba(255,107,107,.1)', color: '#ff6b6b', name: 'Overdue Incidents', date: 'Last 30 days' },
];

function Reports() {
  return (
    <div className="panel active" id="panel-reports">
      <div className="card">
        <div className="card-head"><span className="card-title">Generate &amp; download reports</span></div>
        <div className="rep-grid">
          {REPORT_ITEMS.map((item) => (
            <div className="rep-item" key={item.name}>
              <div className="rep-info">
                <div className="rep-ico" style={{ background: item.bg, color: item.color }}>
                  <i className={`ti ti-${item.icon}`}></i>
                </div>
                <div>
                  <div className="rep-name">{item.name}</div>
                  <div className="rep-date">{item.date}</div>
                </div>
              </div>
              <button className="dl-btn">
                <i className="ti ti-download"></i>Export
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Custom date range</span></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '.7rem', color: 'var(--muted)' }}>From</label>
            <input
              type="date"
              defaultValue="2026-06-01"
              style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: '#c8d6e5', fontSize: '.82rem', fontFamily: "'Inter',sans-serif", outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '.7rem', color: 'var(--muted)' }}>To</label>
            <input
              type="date"
              defaultValue="2026-06-25"
              style={{ background: 'var(--navy3)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: '#c8d6e5', fontSize: '.82rem', fontFamily: "'Inter',sans-serif", outline: 'none' }}
            />
          </div>
          <button className="save-btn">Generate Report</button>
        </div>
      </div>
    </div>
  );
}

export default Reports;
