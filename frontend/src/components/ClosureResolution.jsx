import { useEffect, useRef, useState } from 'react';
import { CalendarX2, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import { bookingsService } from '../services/bookings';
import { refreshNotifications } from '../hooks/useNotifications';
import { AUTOMATIC_REFUND_STATUSES, REFUND_PROCESSING_ESTIMATE, canResolveClosure, canRetryUnsubmittedRefund, closureRefundAmount, isOnlineRefund, refundTiming } from '../utils/closureRefund';
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
  const online = isOnlineRefund(booking);
  const retryable = admin && canRetryUnsubmittedRefund(booking);
  const completedCopy = onlineProcessed > 0
    ? onlineProcessed < Number(amount) ? `${peso(onlineProcessed)} was sent through your original payment method; staff recorded the remaining payment as returned.` : `${peso(amount)} was processed through your original payment method.`
    : `${peso(amount)} was recorded as returned by staff.`;
  const Icon = pending ? CalendarX2 : completed ? CheckCircle2 : processing ? Clock3 : RotateCcw;
  const heading = pending ? 'Your reservation date is closed' : completed ? Number(amount) > 0 ? 'Refund processed' : 'Reservation cancelled' : processing ? 'Refund processing' : admin ? 'Refund needs staff assistance' : online ? 'Your refund is under review' : 'Your refund is being arranged';

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
      {amount > 0 && <p className="rv-closure-note">{online ? `Your online payment returns to the original payment method. ${REFUND_PROCESSING_ESTIMATE} ${refundTiming(booking)}` : 'The venue will arrange the return of your cash or manually recorded payment and confirm the timing with you.'}</p>}
    </> : <>
      <p>{completed ? Number(amount) > 0 ? completedCopy : 'There was no payment to refund.' : processing ? `Your reservation is cancelled. We received your full ${peso(amount)} refund request and are processing or verifying it. We’ll notify you by email and in your notification bell when it is processed.` : `Your reservation is cancelled and remains eligible for the full ${peso(amount)} refund. ${Number(refund.processedAmount) > 0 ? `${peso(refund.processedAmount)} has been processed online. ` : ''}The venue is reviewing the remaining refund. You do not need to submit another request. We’ll notify you after it is returned.`}</p>
      {processing && <p className="rv-closure-note">{REFUND_PROCESSING_ESTIMATE}</p>}
      {online && (processing || (completed && onlineProcessed > 0)) && Number(amount) > 0 && <p className="rv-closure-note">{refundTiming(booking)} “Processed” means sent by the payment provider; your bank or wallet may still be posting the money.</p>}
      {admin && processing && <>
        <p className="rv-closure-note">Check the provider before issuing any manual refund. Reference: {refund.requestId}{refund.providerRefundId ? ` · ${refund.providerRefundId}` : ''}</p>
        <button type="button" className="rv-closure-button" disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { onUpdated?.(await bookingsService.checkClosureRefund(booking._id)); }
          catch (failure) { setError(failure.message); }
          finally { setBusy(false); }
        }}>{busy ? 'Checking…' : 'Check provider status'}</button>
      </>}
      {admin && !completed && !processing && <>
        {refund.lastError && <p className="rv-closure-note">Reason: {refund.lastError}</p>}
        {retryable ? <>
          <p className="rv-closure-note">No refund was submitted to the payment provider. Retry the automatic refund through the original payment method, or record a manual refund only after returning the money.</p>
          <button type="button" className="rv-closure-button primary" disabled={busy} onClick={async () => {
            setBusy(true); setError('');
            try { onUpdated?.(await bookingsService.retryClosureRefund(booking._id)); refreshNotifications(); }
            catch (failure) { setError(failure.message); }
            finally { setBusy(false); }
          }}>{busy ? 'Retrying…' : 'Retry automatic refund'}</button>
        </> : <p className="rv-closure-note">Verify any online refund in the provider dashboard first. If a payment still needs returning, send the money or return the cash, then use Record manual refund below. Recording a refund does not transfer money.</p>}
      </>}
      {!completed && !processing && contactUrl && <a className="rv-closure-contact" href={contactUrl} target="_blank" rel="noreferrer">Contact The Riverview</a>}
    </>}
    {error && <p className="rv-closure-error" role="alert">{error}</p>}
  </section>;
}
