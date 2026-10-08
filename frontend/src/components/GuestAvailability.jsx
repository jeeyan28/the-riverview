import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePublicAvailability } from '../hooks/usePublicAvailability';
import { businessDate } from '../utils/businessDate';
import { shiftBookingDate } from '../utils/bookingHours';
import { getPaxCapacity, priceOptionsFor } from '../utils/rooms';

const STATE_LABELS = { available: 'Available', full: 'Full', outside_hours: 'Outside operating hours', closed: 'Closed' };

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function capacityNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(100, number) : null;
}

function timeLabel(value) {
  const text = String(value ?? '');
  const parsed = /^\d{1,2}:\d{2}$/.test(text) ? Number(text.split(':')[0]) : Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 48) return text;
  const hour = parsed % 24;
  return (hour % 12 || 12) + ':00 ' + (hour >= 12 ? 'PM' : 'AM');
}

function hoursLabel(hours) {
  if (typeof hours === 'string') return hours;
  const open = hours?.openTime ?? hours?.openHour ?? hours?.open;
  const close = hours?.closeTime ?? hours?.closeHour ?? hours?.close;
  if (open === undefined || close === undefined) return 'Start times follow the venue schedule.';
  const hour = value => Number(String(value).split(':')[0]);
  return timeLabel(open) + ' – ' + timeLabel(close) + (hour(close) >= 24 || hour(close) <= hour(open) ? ' next day' : '');
}

function initialSelection(room, variants, initialVariantLabel, initialDraft) {
  const draft = initialDraft?.roomId === room?._id ? initialDraft : null;
  const candidate = draft?.variantLabel || initialVariantLabel;
  const variant = variants.find((item) => item.label === candidate)
    || variants.find((item) => !item.status || item.status === 'Available') || variants[0];
  const duration = Number(draft?.duration);
  const guestCount = Number(draft?.guestCount);
  const date = validDate(draft?.serviceDate) ? draft.serviceDate : validDate(draft?.date) ? draft.date : businessDate();
  const validDuration = Number.isInteger(duration) && duration >= 1 && duration <= 5 ? duration : 1;
  return {
    variantLabel: variant?.label || '',
    date,
    duration: validDuration,
    guestCount: Number.isInteger(guestCount) && guestCount >= 1 && guestCount <= 100 ? String(guestCount) : '1',
    paymentChoice: validDuration > 1 && draft?.paymentChoice === 'full' ? 'full' : 'deposit',
    selectedKey: validDate(draft?.date) && /^(?:[01]\d|2[0-3]):00$/.test(draft?.timeIn || '') ? draft.date + '|' + draft.timeIn : '',
  };
}

function GuestAvailability({ room, initialVariantLabel = '', initialDraft = null, onContinue }) {
  const { user, sessionVerified } = useAuth();
  const fieldId = useId();
  const summaryRef = useRef(null);
  const roomId = room?._id || '';
  const variants = useMemo(() => room ? priceOptionsFor(room) : [], [room]);
  const [form, setForm] = useState(() => initialSelection(room, variants, initialVariantLabel, initialDraft));
  const [expectedAvailable, setExpectedAvailable] = useState(Boolean(form.selectedKey));
  const draftSignature = JSON.stringify([initialDraft?.roomId, initialDraft?.variantLabel, initialDraft?.date, initialDraft?.timeIn, initialDraft?.serviceDate, initialDraft?.duration, initialDraft?.guestCount, initialDraft?.paymentChoice]);
  const source = useRef(null);
  source.current = { room, variants, initialVariantLabel, initialDraft };

  useEffect(() => {
    const values = source.current;
    const next = initialSelection(values.room, values.variants, values.initialVariantLabel, values.initialDraft);
    setForm(next);
    setExpectedAvailable(Boolean(next.selectedKey));
  }, [roomId, initialVariantLabel, draftSignature]);

  const variant = variants.find((item) => item.label === form.variantLabel);
  const guestCount = Number(form.guestCount);
  const configuredCapacity = getPaxCapacity(variant?.pax) || capacityNumber(room?.capacity);
  const validGuests = Number.isInteger(guestCount) && guestCount >= 1 && guestCount <= 100;
  const selection = { roomId, variantLabel: form.variantLabel, date: form.date, duration: form.duration, guestCount, paymentChoice: form.paymentChoice };
  const { data, status, error, retry } = usePublicAvailability(selection, { enabled: Boolean(variant && validGuests && (!configuredCapacity || guestCount <= configuredCapacity)) });
  const capacity = data ? capacityNumber(data.guestCapacity) : capacityNumber(configuredCapacity);
  const maximumGuests = capacity || 100;
  const guestError = !validGuests ? 'Enter a whole guest count from 1 to 100.'
    : capacity && guestCount > capacity ? 'This room accommodates up to ' + capacity + ' guests. Reduce the group size or choose another room.' : '';
  const sessionUnavailable = Boolean(user && !sessionVerified);
  const slots = data?.slots || [];
  const selectedSlot = slots.find((slot) => slot.date + '|' + slot.timeIn === form.selectedKey);
  const availableCount = slots.filter((slot) => slot.state === 'available').length;
  const fullCount = slots.filter((slot) => slot.state === 'full').length;
  const quote = selectedSlot?.quote;
  const selectedAvailable = selectedSlot?.state === 'available';
  const selectedFull = selectedSlot?.state === 'full';
  const canContinue = status === 'ready' && selectedAvailable && !guestError && !sessionUnavailable && typeof onContinue === 'function';
  const money = (value) => '₱' + Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const features = variant?.features?.length ? variant.features : room?.features || [];

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function draftFor(slot) {
    return {
      roomId,
      variantLabel: form.variantLabel,
      date: slot.date,
      timeIn: slot.timeIn,
      duration: form.duration,
      guestCount,
      serviceDate: data.serviceDate,
      paymentChoice: form.paymentChoice,
    };
  }

  function continueReservation(event) {
    event.preventDefault();
    if (canContinue) onContinue(draftFor(selectedSlot));
  }

  return (
    <section className="fd-availability" id="availability" aria-labelledby={fieldId + '-heading'} aria-busy={status === 'loading'}>
      <div className="fd-section-heading">
        <h2 id={fieldId + '-heading'}>Check availability</h2>
        <p>Choose a room, date and available time. Times use {data?.timeZone || 'Asia/Manila'}.</p>
      </div>
      <form className="fd-availability-layout" onSubmit={continueReservation}>
        <div className="fd-availability-controls">
          <div className="fd-availability-fields">
            <div className="fd-availability-field">
              <label htmlFor={fieldId + '-variant'}>Room type</label>
              <select id={fieldId + '-variant'} value={form.variantLabel} required onChange={(event) => update('variantLabel', event.target.value)}>
                {variants.map((item) => <option key={item.label} value={item.label}>{item.label}{item.status && item.status !== 'Available' ? ' · ' + item.status : ''}</option>)}
              </select>
            </div>
            <div className="fd-availability-field">
              <label htmlFor={fieldId + '-date'}>Date</label>
              <input id={fieldId + '-date'} type="date" value={form.date} required onChange={(event) => update('date', event.target.value)} />
            </div>
            <div className="fd-availability-field">
              <label htmlFor={fieldId + '-duration'}>Duration</label>
              <select id={fieldId + '-duration'} value={form.duration} onChange={(event) => {
                const duration = Number(event.target.value);
                setForm((current) => ({ ...current, duration, paymentChoice: duration === 1 ? 'deposit' : current.paymentChoice }));
              }}>
                {[1, 2, 3, 4, 5].map((hours) => <option key={hours} value={hours}>{hours} {hours === 1 ? 'hour' : 'hours'}</option>)}
              </select>
            </div>
            <div className="fd-availability-field">
              <label htmlFor={fieldId + '-guests'}>Guests</label>
              <input id={fieldId + '-guests'} type="number" inputMode="numeric" min={1} max={maximumGuests} step={1} value={form.guestCount} required aria-invalid={Boolean(guestError)} aria-describedby={fieldId + '-capacity'} onChange={(event) => update('guestCount', event.target.value)} />
              <p className="fd-availability-note" id={fieldId + '-capacity'}>{guestError || (capacity ? 'Maximum ' + capacity + ' guests for this room.' : 'Group capacity is not confirmed. Contact us before planning a larger group.')}</p>
              {!capacity && <Link className="fd-primary-link" to="/contact">Confirm group capacity</Link>}
            </div>
            <div className="fd-availability-field">
              <label htmlFor={fieldId + '-payment'}>Payment choice</label>
              <select id={fieldId + '-payment'} value={form.paymentChoice} onChange={(event) => update('paymentChoice', event.target.value)}>
                <option value="deposit">{form.duration === 1 ? 'Pay for this hour' : 'First-hour deposit'}</option>
                {form.duration > 1 && <option value="full">Pay in full</option>}
              </select>
            </div>
          </div>
          <p className="fd-availability-note">Operating hours: {data ? hoursLabel(data.operatingHours) : 'Loading the venue schedule…'} A start marked “next day” uses the next calendar date.</p>
          {Number(variant?.extraGuestFee) > 0 && <p className="fd-availability-note">{Number(variant.includedGuests) > 0
            ? Number(variant.includedGuests) + ' guests included; each guest above that adds ' + money(variant.extraGuestFee) + ' per hour.'
            : money(variant.extraGuestFee) + ' per guest per hour applies to every guest, in addition to the room rate.'}</p>}
          <div className="fd-availability-status" aria-live="polite" aria-atomic="true">
            {status === 'loading' && <p role="status">Checking start times and prices…</p>}
            {status === 'idle' && <p>Complete the room, date and guest count to check start times.</p>}
            {status === 'error' && <div><p role="alert">Unable to load availability. {error}</p><button type="button" className="fd-secondary-link" onClick={retry}>Retry availability</button></div>}
            {status === 'ready' && (availableCount > 0
              ? <p>{availableCount} available {availableCount === 1 ? 'start time' : 'start times'} for this duration.</p>
              : slots.length && slots.every((slot) => slot.state === 'closed')
                ? <p>The venue is closed for this date. Choose another date.</p>
                : fullCount > 0
                  ? <p>All bookable start times are full. Try a shorter duration, another room or another date.</p>
                  : <p>No start times fit within operating hours. Try a shorter duration or another date.</p>)}
            {status === 'ready' && expectedAvailable && form.selectedKey && !selectedAvailable && <p>Your selected start time is no longer available for these choices. Your other selections are saved; choose another time.</p>}
          </div>
          {status === 'ready' && (
            <fieldset className="fd-availability-times">
              <legend>Start time</legend>
              <div className="fd-slot-grid">
                {slots.map((slot) => {
                  const key = slot.date + '|' + slot.timeIn;
                  const selectable = slot.state === 'available';
                  const isSelected = form.selectedKey === key && selectable;
                  const label = timeLabel(slot.displayHour ?? slot.timeIn) + (slot.startsNextDay ? ' · next day' : '');
                  return (
                    <button key={key} type="button" className={'fd-slot fd-slot--' + slot.state + (isSelected ? ' is-selected' : '')} disabled={!selectable} aria-pressed={isSelected} aria-label={label + ', ' + (isSelected ? 'Selected' : STATE_LABELS[slot.state]) + (slot.reason ? '. ' + slot.reason : '')} title={slot.reason || undefined} onClick={(event) => {
                      if (!form.selectedKey && event.detail > 0 && window.matchMedia('(max-width: 700px)').matches) {
                        requestAnimationFrame(() => summaryRef.current?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
                      }
                      update('selectedKey', key);
                      setExpectedAvailable(slot.state === 'available');
                    }}>
                      <span className="fd-slot-heading"><strong>{label}</strong>{isSelected && <Check size={16} aria-hidden="true" />}</span><span>{isSelected ? 'Selected' : STATE_LABELS[slot.state]}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          {status === 'ready' && <div className="fd-availability-alternatives">
            <button type="button" className="fd-secondary-link" onClick={retry}>Refresh availability</button>
            {validDate(form.date) && <button type="button" className="fd-secondary-link" onClick={() => update('date', shiftBookingDate(form.date, 1))}>Check next day</button>}
            {form.duration > 1 && <button type="button" className="fd-secondary-link" onClick={() => setForm((current) => ({ ...current, duration: 1, paymentChoice: 'deposit' }))}>Try one hour</button>}
          </div>}
        </div>
        <aside ref={summaryRef} className="fd-availability-summary" aria-labelledby={fieldId + '-summary'}>
          <h3 id={fieldId + '-summary'}>Your selection</h3>
          <p>{variant?.label || 'Choose a room'} · {form.duration} {form.duration === 1 ? 'hour' : 'hours'} · {validGuests ? guestCount : '—'} {guestCount === 1 ? 'guest' : 'guests'}</p>
          {selectedSlot ? <p>{new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(selectedSlot.date + 'T12:00:00'))} · {timeLabel(selectedSlot.displayHour ?? selectedSlot.timeIn)}{selectedSlot.startsNextDay ? ' · next calendar day' : ''}</p> : <p>Choose an available start time to see its price.</p>}
          {quote && ['amount', 'downPayment', 'remainingBalance'].every((field) => Number.isFinite(quote[field])) && <dl className="fd-room-facts">
            <div><dt>Total price</dt><dd>{money(quote.amount)}</dd></div>
            <div><dt>{form.paymentChoice === 'full' ? 'Full payment at checkout' : form.duration === 1 ? 'Due at checkout' : 'Deposit at checkout'}</dt><dd>{money(quote.downPayment)}</dd></div>
            <div><dt>Remaining at venue</dt><dd>{money(quote.remainingBalance)}</dd></div>
          </dl>}
          {features.length > 0 && <div className="fd-amenities"><h4>Included</h4><ul>{features.map((feature) => <li key={feature}>{feature}</li>)}</ul></div>}
          {sessionUnavailable && <p className="fd-availability-notice" role="status">Your signed-in session could not be verified. Availability browsing is still open; retry the session check before reserving.</p>}
          {selectedFull && <p className="fd-availability-note">This start time is full. Choose another time or check another day.</p>}
          <button type="submit" className="fd-primary-button" disabled={!canContinue}>{user ? 'Continue to reserve' : 'Sign in to reserve'}</button>
          <p className="fd-availability-note">No payment or reservation yet. Your time is held temporarily after you continue; only successful checkout confirms the reservation.</p>
        </aside>
      </form>
    </section>
  );
}

export default GuestAvailability;
