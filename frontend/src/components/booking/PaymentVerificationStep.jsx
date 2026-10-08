import { Link } from 'react-router-dom';
import { CircleX, Clock3, LoaderCircle, MessageCircle, Phone, TriangleAlert } from 'lucide-react';
import { BookingSuccess } from './BookingPresentation';

export function PaymentVerificationStep({ pmReturn, room, selectedVariant, handleDone, handleRetryFromReturn, contactMessengerUrl, contactPhone }) {
  const { phase, message, reference } = pmReturn;
  const headings = {
    loading: 'Checking your payment…', cancelled: 'Payment cancelled',
    expired: 'Payment session expired', failed: 'Payment could not be completed',
    needLogin: 'Log in to check your payment', pending: 'Payment is not confirmed yet',
  };
  const descriptions = {
    loading: 'Please wait while we check the original payment.',
    cancelled: 'The payment was cancelled. No reservation was confirmed.',
    expired: 'The payment window expired. No reservation was confirmed.',
    failed: 'The payment was not completed. Check its status before trying again.',
    needLogin: 'Use the same account you started checkout with to see your payment status.',
    pending: 'We have not confirmed a reservation yet. Check the original payment status before paying again.',
  };
  const StatusIcon = phase === 'loading' ? LoaderCircle : phase === 'cancelled' ? CircleX : ['expired', 'pending'].includes(phase) ? Clock3 : TriangleAlert;

  return <div className={`bk-step bk-payment-return bk-payment-return--${phase}`} id="bkStepPaymongoReturn" role={phase === 'confirmed' ? undefined : 'status'} aria-live={phase === 'confirmed' ? undefined : 'polite'}>
    {phase === 'confirmed' ? <BookingSuccess booking={pmReturn.booking} room={room} selectedVariant={selectedVariant} onDone={handleDone} /> : phase === 'paidSlotUnavailable' ? <div className="bk-payment-fallback" role="alert">
      <div className="bk-payment-fallback-head">
        <TriangleAlert size={22} className="bk-payment-fallback-icon" aria-hidden="true" />
        <div>
          <h3 className="bk-payment-fallback-title">Payment received, reservation not confirmed</h3>
          <p className="bk-payment-fallback-desc">{message || 'Your payment was received, but the selected time could not be booked.'}</p>
          <p className="bk-payment-fallback-desc">Please do not pay again. Contact the venue with your payment reference.</p>
          {reference && <p className="bk-payment-reference">Payment reference <code>{reference}</code></p>}
        </div>
      </div>
      <div className="bk-payment-fallback-actions">
        {contactMessengerUrl && <a href={contactMessengerUrl} target="_blank" rel="noreferrer" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary"><MessageCircle size={16} aria-hidden="true" />Message the venue</a>}
        {contactPhone && <a href={`tel:${contactPhone}`} className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost"><Phone size={16} aria-hidden="true" />Call the venue</a>}
        {!contactPhone && !contactMessengerUrl && <Link to="/contact" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary" onClick={handleDone}><MessageCircle size={16} aria-hidden="true" />Contact the venue</Link>}
      </div>
      <button type="button" className="bk-done" onClick={handleDone}>Close</button>
    </div> : <>
      <div className="bk-confirm-icon"><StatusIcon size={22} className={phase === 'loading' ? 'bk-verify-spinner' : undefined} aria-hidden="true" /></div>
      <h3>{headings[phase]}</h3>
      <p>{message || descriptions[phase]}</p>
      {reference && <p className="bk-payment-reference">Payment reference <code>{reference}</code></p>}
      {['pending', 'cancelled', 'expired', 'failed'].includes(phase) ? <div className="bk-success-actions-row">
        <button type="button" className="bk-back-btn" onClick={handleDone}>Close</button>
        <button type="button" className="bk-confirm bk-continue" onClick={handleRetryFromReturn}>Check payment status</button>
      </div> : phase !== 'loading' && <button type="button" className="bk-done" onClick={handleDone}>Done</button>}
    </>}
  </div>;
}
