import '../styles/date-range-picker.css';
import { CalendarDays } from 'lucide-react';
import { businessDate } from '../utils/businessDate';

function shiftKey(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const PRESETS = [
  { label: 'Today', range: () => { const today = businessDate(); return [today, today]; } },
  { label: 'Last 7 days', range: () => { const today = businessDate(); return [shiftKey(today, -6), today]; } },
  { label: 'This month', range: () => { const today = businessDate(); return [`${today.slice(0, 7)}-01`, today]; } },
];

function DateRangePicker({ from, to, onChange }) {
  function updateFrom(value) {
    if (!value) return;
    onChange(value, value > to ? value : to);
  }

  function updateTo(value) {
    if (!value) return;
    onChange(value < from ? value : from, value);
  }

  return (
    <div className="drp-simple" aria-label="Service date range">
      <div className="drp-simple-title"><CalendarDays size={16} aria-hidden="true" /><span>Service dates</span></div>
      <div className="drp-quick" role="group" aria-label="Quick date ranges">
        {PRESETS.map((preset) => {
          const [presetFrom, presetTo] = preset.range();
          const selected = presetFrom === from && presetTo === to;
          return <button key={preset.label} type="button" className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => onChange(presetFrom, presetTo)}>{preset.label}</button>;
        })}
      </div>
      <div className="drp-fields">
        <label><span>From</span><input type="date" value={from} max={to} onChange={(event) => updateFrom(event.target.value)} /></label>
        <span className="drp-separator" aria-hidden="true">to</span>
        <label><span>To</span><input type="date" value={to} min={from} onChange={(event) => updateTo(event.target.value)} /></label>
      </div>
    </div>
  );
}

export default DateRangePicker;
