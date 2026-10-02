import { useEffect, useRef, useState } from 'react';
import { CalendarX2, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import { bookingsService } from '../services/bookings';
import { refreshNotifications } from '../hooks/useNotifications';
import { AUTOMATIC_REFUND_STATUSES, canResolveClosure, closureRefundAmount, refundTiming } from '../utils/closureRefund';
import '../styles/reservation-notifications.css';

const peso = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export default function ClosureResolution({ booking, onReschedule, onUpdated, contactUrl, admin = false, readOnly = false }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmRef = useRef(null);
  useEffect(() => { if (confirming) confirmRef.current?.focus({ preventScroll: true }); }, [confirming]);
  const pending = canResolveClosure(booking);
  const refund = booking.closureRefund;
  if (!pending && !refund) return null;
  const completed = refund?.status === 'completed';
  const processing = AUTOMATIC_REFUND_STATUSES.includes(refund?.status);
  const amount = pending ? closureRefundAmount(booking) : refund?.amount;
  const onlineProcessed = Number(refund?.processedAmount || 0);
  const completedCopy = onlineProcessed > 0
    ? onlineProcessed < Number(amount) ? `${peso(onlineProcessed)} was sent through your original payment method; staff recorded the remaining payment as returned.` : `${peso(amount)} was processed through your original payment method.`
    : `${peso(amount)} was recorded as returned by staff.`;
  const Icon = pending ? CalendarX2 : completed ? CheckCircle2 : processing ? Clock3 : RotateCcw;
  const heading = pending ? 'Your reservation date is closed' : completed ? Number(amount) > 0 ? 'Refund processed' : 'Reservation cancelled' : processing ? 'Refund processing' : 'Staff will arrange your refund';

  async function requestRefund() {
    setBusy(true); setError('');
    try {
      const updated = await bookingsService.requestClosureRefund(booking._id);
      onUpdated?.(updated); refreshNotifications(); setConfirming(false);
    } catch (failure) { setError(failure.message || 'Could not request your refund. Refresh your reservation before trying again.'); }
    finally { setBusy(false); }
  }

  return <section className={`rv-closure-resolution${completed ? ' is-complete' : ''}`} aria-label="Venue closure options">
    <div className="rv-closure-heading"><Icon size={22} aria-hidden="true" /><h3>{heading}</h3></div>
    {pending ? <>
      <p>We’re closed on {booking.venueClosure.date} for {booking.venueClosure.name}.{booking.venueClosure.note ? ` ${booking.venueClosure.note}` : ''}</p>
      <p>Choose another available date without using your usual reschedule allowance{amount > 0 ? `, or cancel for a full ${peso(amount)} refund` : ', or cancel this reservation'}. No first-hour charge will be kept.</p>
      {readOnly ? <p className="rv-closure-note">A customer or staff member with reservation management permission can choose an option.</p> : confirming ? <div className="rv-closure-confirm">
        <p>{amount > 0 ? `Cancel this reservation and request the full ${peso(amount)} refund?` : 'Cancel this reservation?'} This releases your reserved slot.</p>
        <div className="rv-closure-actions"><button type="button" className="rv-closure-button primary" ref={confirmRef} disabled={busy} onClick={requestRefund}>{busy ? 'Submitting…' : amount > 0 ? 'Confirm refund' : 'Confirm cancellation'}</button><button type="button" className="rv-closure-button" disabled={busy} onClick={() => setConfirming(false)}>Go back</button></div>
      </div> : <div className="rv-closure-actions">
        {onReschedule && <button type="button" className="rv-closure-button primary" onClick={onReschedule}>Reschedule reservation</button>}
        <button type="button" className="rv-closure-button" onClick={() => setConfirming(true)}>{amount > 0 ? 'Refund payment' : 'Cancel reservation'}</button>
      </div>}
      {amount > 0 && <p className="rv-closure-note">Online refunds return to the original payment method. Cash and manual payments are returned by staff. {refundTiming(booking)}</p>}
    </> : <>
      <p>{completed ? Number(amount) > 0 ? completedCopy : 'There was no payment to refund.' : processing ? `Your reservation is cancelled. Your full ${peso(amount)} refund is being processed or verified. We’ll notify you by email and in your notification bell when it is processed.` : `Your reservation is cancelled and remains eligible for the full ${peso(amount)} refund. ${Number(refund.processedAmount) > 0 ? `${peso(refund.processedAmount)} has been processed online. ` : ''}Staff will arrange the remaining payment and notify you after it is returned.`}</p>
      {refund.provider !== 'manual' && (!completed || onlineProcessed > 0) && Number(amount) > 0 && <p className="rv-closure-note">{refundTiming(booking)} “Processed” means sent by the payment provider; your bank or wallet may still be posting the money.</p>}
      {admin && processing && <>
        <p className="rv-closure-note">Check the provider before issuing any manual refund. Reference: {refund.requestId}{refund.providerRefundId ? ` · ${refund.providerRefundId}` : ''}</p>
        <button type="button" className="rv-closure-button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { onUpdated?.(await bookingsService.checkClosureRefund(booking._id)); }
          catch (failure) { setError(failure.message); }
          finally { setBusy(false); }
        }}>{busy ? 'Checking…' : 'Check provider status'}</button>
      </>}
      {!completed && !processing && contactUrl && <a className="rv-closure-contact" href={contactUrl} target="_blank" rel="noreferrer">Contact The Riverview</a>}
    </>}
    {error && <p className="rv-closure-error" role="alert">{error}</p>}
  </section>;
}
