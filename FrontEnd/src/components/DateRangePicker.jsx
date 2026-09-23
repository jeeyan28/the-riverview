import '../styles/date-range-picker.css';
import { useState } from 'react';
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

function dateLabel(key) {
  const date = new Date(`${key}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? key : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
}

function DateRangePicker({ from, to, onChange }) {
  const [customOpen, setCustomOpen] = useState(false);
  const activePreset = PRESETS.find((preset) => {
    const [start, end] = preset.range();
    return start === from && end === to;
  });
  const showCustom = customOpen || !activePreset;
  const rangeLabel = from && to ? from === to ? dateLabel(from) : `${dateLabel(from)} – ${dateLabel(to)}` : 'Choose dates';

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
      <div className="drp-simple-title"><CalendarDays size={17} aria-hidden="true" /><span><small>Service period</small><strong>{rangeLabel}</strong></span></div>
      <div className="drp-controls">
        <div className="drp-quick" role="group" aria-label="Choose a service period">
          {PRESETS.map((preset) => {
            const [presetFrom, presetTo] = preset.range();
            const selected = !showCustom && presetFrom === from && presetTo === to;
            return <button key={preset.label} type="button" className={selected ? 'active' : ''} aria-pressed={selected} onClick={() => { setCustomOpen(false); onChange(presetFrom, presetTo); }}>{preset.label}</button>;
          })}
          <button type="button" className={showCustom ? 'active' : ''} aria-pressed={showCustom} onClick={() => setCustomOpen(true)}>Custom dates</button>
        </div>
        {showCustom && <div className="drp-fields">
          <label><span>From</span><input type="date" value={from} max={to || undefined} onChange={(event) => updateFrom(event.target.value)} /></label>
          <span className="drp-separator" aria-hidden="true">to</span>
          <label><span>To</span><input type="date" value={to} min={from || undefined} onChange={(event) => updateTo(event.target.value)} /></label>
        </div>}
      </div>
    </div>
  );
}

export default DateRangePicker;
