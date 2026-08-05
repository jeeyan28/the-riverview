import '../../styles/admin/reports.css';
const REPORT_ITEMS = [
  { icon: 'file-spreadsheet', bg: 'rgba(239,62,109,.1)', color: 'var(--teal)', name: 'Daily Booking Report', date: 'Today, Jun 25 2026' },
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
        <div className="rep-daterange-row">
          <div className="field-stack">
            <label className="field-label">From</label>
            <input type="date" defaultValue="2026-06-01" className="rep-date-input" />
          </div>
          <div className="field-stack">
            <label className="field-label">To</label>
            <input type="date" defaultValue="2026-06-25" className="rep-date-input" />
          </div>
          <button className="save-btn">Generate Report</button>
        </div>
      </div>
    </div>
  );
}

export default Reports;