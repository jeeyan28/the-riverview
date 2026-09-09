import DateRangePicker from './DateRangePicker';

export default function RevenueFilters({ from, to, source, onRangeChange, onSourceChange, reload, loading, children }) {
  return (
    <div className="finance-toolbar no-print">
      <div className="field-stack">
        <span className="field-label">Service dates</span>
        <DateRangePicker from={from} to={to} onChange={onRangeChange} />
      </div>
      <label className="field-stack">
        <span className="field-label">Source</span>
        <select value={source} onChange={(event) => onSourceChange(event.target.value)}>
          <option value="all">All sales</option>
          <option value="booking">Online reservations</option>
          <option value="walkin">Walk-ins / manual bookings</option>
        </select>
      </label>
      <button type="button" className="btn-cancel" disabled={loading} onClick={reload}>Refresh</button>
      {children}
    </div>
  );
}
