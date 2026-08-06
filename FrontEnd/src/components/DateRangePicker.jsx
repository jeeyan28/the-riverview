import '../styles/date-range-picker.css';
import { useEffect, useRef, useState } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatLabel(key) {
  const d = fromKey(key);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const days = [];
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getTime() + i * DAY_MS));
  }
  return days;
}

const PRESETS = [
  { label: 'Today', getRange: () => { const k = toKey(new Date()); return [k, k]; } },
  { label: 'Last 7 days', getRange: () => { const today = new Date(); const start = new Date(today.getTime() - 6 * DAY_MS); return [toKey(start), toKey(today)]; } },
  { label: 'This month', getRange: () => { const today = new Date(); const start = new Date(today.getFullYear(), today.getMonth(), 1); return [toKey(start), toKey(today)]; } },
];

function DateRangePicker({ from, to, onChange }) {
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState(null);
  const [viewYear, setViewYear] = useState(() => fromKey(from).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => fromKey(from).getMonth());
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setPendingStart(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function openPicker() {
    setViewYear(fromKey(from).getFullYear());
    setViewMonth(fromKey(from).getMonth());
    setPendingStart(null);
    setOpen(true);
  }

  function shiftMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  function handleDayClick(date) {
    const key = toKey(date);
    if (!pendingStart) {
      setPendingStart(key);
      return;
    }
    const [rangeFrom, rangeTo] = key < pendingStart ? [key, pendingStart] : [pendingStart, key];
    onChange(rangeFrom, rangeTo);
    setPendingStart(null);
    setOpen(false);
  }

  function handlePreset(preset) {
    const [rangeFrom, rangeTo] = preset.getRange();
    onChange(rangeFrom, rangeTo);
    setPendingStart(null);
    setOpen(false);
  }

  const days = buildMonthGrid(viewYear, viewMonth);
  const selectedStart = pendingStart || from;
  const selectedEnd = pendingStart ? null : to;

  return (
    <div className="drp-root" ref={rootRef}>
      <button type="button" className="drp-trigger" onClick={() => (open ? setOpen(false) : openPicker())}>
        <i className="ti ti-calendar" />
        <span>{formatLabel(from)} – {formatLabel(to)}</span>
      </button>

      {open && (
        <div className="drp-popover">
          <div className="drp-presets">
            {PRESETS.map((preset) => (
              <button key={preset.label} type="button" className="drp-preset-btn" onClick={() => handlePreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>

          <div className="drp-calendar">
            <div className="drp-nav">
              <button type="button" className="drp-nav-btn" onClick={() => shiftMonth(-1)}>
                <i className="ti ti-chevron-left" />
              </button>
              <span className="drp-nav-label">{MONTH_LABELS[viewMonth]} {viewYear}</span>
              <button type="button" className="drp-nav-btn" onClick={() => shiftMonth(1)}>
                <i className="ti ti-chevron-right" />
              </button>
            </div>

            <div className="drp-weekdays">
              {WEEKDAY_LABELS.map((label, i) => (
                <span key={i}>{label}</span>
              ))}
            </div>

            <div className="drp-days">
              {days.map((date) => {
                const key = toKey(date);
                const inMonth = date.getMonth() === viewMonth;
                const isStart = key === selectedStart;
                const isEnd = key === selectedEnd;
                const inRange = selectedEnd && key > selectedStart && key < selectedEnd;
                const classes = ['drp-day'];
                if (!inMonth) classes.push('drp-day-muted');
                if (isStart || isEnd) classes.push('drp-day-selected');
                if (inRange) classes.push('drp-day-in-range');
                return (
                  <button key={key} type="button" className={classes.join(' ')} onClick={() => handleDayClick(date)}>
                    {date.getDate()}
                  </button>
                );
              })}
            </div>

            {pendingStart && <div className="drp-hint">Pick the end date</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;