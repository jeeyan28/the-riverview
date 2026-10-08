import { Link } from 'react-router-dom';
import { Check, Clock3, MessageCircle, Phone, RotateCw, TriangleAlert } from 'lucide-react';

export function CheckoutStep({
  attemptId, cardCvc, cardExpiry, cardNumber, checkOriginalPayment, claimDiscount,
  contactMessengerUrl, contactPhone, depositBalanceCopy, downPaymentAmount,
  handleConfirmWalletPay, handleDemoPay, handlePayCard, handleRetryPayment,
  handleSelectMethod, payError, payErrorKind, payLoading, paymentChoice, pmIntent,
  priceBreakdown, selectedDuration, selectedMethod, setCardCvc, setCardExpiry,
  setCardNumber, setPaymentChoice, visiblePaymentMethods, visiblePaymentOptions,
}) {
  const isDemo = pmIntent?.gateway === 'demo';
  const isCard = !isDemo && selectedMethod === 'card';
  const blocksPayment = ['checking', 'paidSlotUnavailable', 'expired', 'cancelled'].includes(payErrorKind);
  const paymentPolicy = paymentChoice === 'deposit'
    ? `Successful payment confirms your reservation. ${priceBreakdown.eligibleDiscount > 0 ? selectedDuration === 1 ? `Receive your ₱${priceBreakdown.eligibleDiscount.toLocaleString()} room discount at the facility. ` : `Staff will deduct your ₱${priceBreakdown.eligibleDiscount.toLocaleString()} room discount from the remaining balance at the facility. ` : ''}${depositBalanceCopy}The first hour is non-refundable if you cancel.`
    : downPaymentAmount > (priceBreakdown.hourlyRates[0] || 0)
      ? 'Successful payment confirms your reservation. If you cancel, contact the venue for a refund minus the first hour.'
      : 'Successful payment confirms your reservation. This first hour is non-refundable if you cancel.';

  return <div className="bk-step" id="bkStepPayment">
    <div className="bk-slots-head"><h3>Payment</h3></div>
    <p className="bk-payment-methods-help">{isDemo ? 'Try the checkout with a synthetic payment.' : 'Choose a secure payment method to confirm your reservation.'}</p>

    <div className="bk-downpayment-card">
      <p className="bk-summary-label">{selectedDuration === 1 ? 'Due now · 1 hour' : paymentChoice === 'deposit' ? 'Due now · first-hour deposit' : 'Due now · full payment'}</p>
      <p className="bk-downpayment-amount">₱{downPaymentAmount.toLocaleString()}</p>
      <p className="bk-downpayment-duration">{paymentPolicy}</p>
    </div>

    {visiblePaymentOptions.length > 1 && <div className="bk-payment-methods">
      <span className="bk-payment-methods-label" id="bk-payment-hours-label">Payment amount</span>
      <div className="bk-payment-methods-grid bk-payment-duration-grid" role="group" aria-labelledby="bk-payment-hours-label">
        {visiblePaymentOptions.map(({ choice, label, amount }) => <button key={choice} type="button" className={'bk-payment-method-tile bk-payment-duration-tile' + (paymentChoice === choice ? ' bk-payment-method-tile--selected' : '')} disabled={payLoading || Boolean(attemptId)} aria-pressed={paymentChoice === choice} onClick={() => setPaymentChoice(choice)}>
          <span className="bk-payment-choice-copy">
            <strong>{label}</strong><small>₱{amount.toLocaleString()}</small>
            {claimDiscount && priceBreakdown.eligibleDiscount > 0 && <small>{choice === 'full' ? `Includes ₱${priceBreakdown.eligibleDiscount.toLocaleString()} discount` : selectedDuration === 1 ? 'Receive room discount at the facility' : 'Room discount deducted from venue balance'}</small>}
          </span>
          <span className="bk-payment-choice-check" aria-hidden="true"><Check size={16} /></span>
        </button>)}
      </div>
    </div>}

    {isDemo ? <div className="bk-demo-payment" role="note">
      <strong>Demo checkout</strong><p>No real payment is collected. No card, wallet or email service is contacted.</p>
    </div> : !pmIntent && !payError ? <div className="bk-payment-methods" role="status">
      <span className="bk-payment-methods-label">Preparing secure payment…</span>
      <div className="bk-skeleton-grid" style={{ gridTemplateColumns: '1fr 1fr' }} aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="bk-skeleton-block bk-skeleton-tile" />)}
      </div>
    </div> : <div className="bk-payment-methods">
      <span className="bk-payment-methods-label" id="bk-payment-method-label">Payment method</span>
      <p className="bk-payment-methods-help">GCash, Maya, QR Ph and cards are available through secure checkout.</p>
      <div className="bk-payment-methods-grid bk-payment-method-grid" role="group" aria-labelledby="bk-payment-method-label">
        {visiblePaymentMethods.map(method => <button key={method.key} type="button" className={'bk-payment-method-tile' + (selectedMethod === method.key ? ' bk-payment-method-tile--selected' : '')} disabled={!pmIntent || payLoading} aria-pressed={selectedMethod === method.key} onClick={() => handleSelectMethod(method.key)}>
          <span className="bk-payment-choice-icon" aria-hidden="true"><i className={method.icon} /></span>
          <span className="bk-payment-choice-copy"><strong>{method.label}</strong><small>{method.description}</small></span>
          <span className="bk-payment-choice-check" aria-hidden="true"><Check size={16} /></span>
        </button>)}
      </div>
    </div>}

    {!isDemo && selectedMethod && !isCard && <p className="bk-payment-redirect-note">You will be redirected to complete your payment securely.</p>}
    {isCard && <form id="bkCardForm" className="bk-guest-fields" onSubmit={handlePayCard}>
      <div className="bk-field">
        <label className="bk-field-label" htmlFor="bk-card-number">Card number</label>
        <input id="bk-card-number" className="bk-field-input" autoComplete="cc-number" inputMode="numeric" placeholder="1234 5678 9012 3456" value={cardNumber} onChange={event => setCardNumber(event.target.value)} disabled={payLoading} required />
      </div>
      <div className="bk-card-row">
        <div className="bk-field">
          <label className="bk-field-label" htmlFor="bk-card-expiry">Expiry (MM/YY)</label>
          <input id="bk-card-expiry" className="bk-field-input" autoComplete="cc-exp" inputMode="numeric" placeholder="MM/YY" value={cardExpiry} onChange={event => setCardExpiry(event.target.value)} disabled={payLoading} required />
        </div>
        <div className="bk-field">
          <label className="bk-field-label" htmlFor="bk-card-cvc">CVC</label>
          <input id="bk-card-cvc" className="bk-field-input" autoComplete="cc-csc" inputMode="numeric" placeholder="123" value={cardCvc} onChange={event => setCardCvc(event.target.value)} disabled={payLoading} required />
        </div>
      </div>
    </form>}

    {payError && payErrorKind === 'checking' && <div className="bk-payment-fallback" role="status">
      <p className="bk-payment-fallback-title">Checking your original payment</p>
      <p className="bk-payment-fallback-desc">{payError}</p>
      <button type="button" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary" onClick={checkOriginalPayment}><RotateCw size={16} aria-hidden="true" />Check payment status</button>
    </div>}
    {payError && ['connectivity', 'paidSlotUnavailable', 'expired', 'cancelled'].includes(payErrorKind) && <div className="bk-payment-fallback" role="alert">
      <div className="bk-payment-fallback-head">
        {payErrorKind === 'expired' ? <Clock3 size={20} className="bk-payment-fallback-icon" aria-hidden="true" /> : <TriangleAlert size={20} className="bk-payment-fallback-icon" aria-hidden="true" />}
        <div>
          <p className="bk-payment-fallback-title">{payErrorKind === 'connectivity' ? "We couldn't reach our payment provider" : payErrorKind === 'paidSlotUnavailable' ? "We couldn't secure your reservation" : payErrorKind === 'expired' ? 'Payment session expired' : 'Payment cancelled'}</p>
          <p className="bk-payment-fallback-desc">{payError}{payErrorKind === 'connectivity' && ' Check the original payment status before paying again.'}{payErrorKind === 'paidSlotUnavailable' && ' Please do not pay again. Contact the venue with your original payment reference.'}</p>
        </div>
      </div>
      <div className="bk-payment-fallback-actions">
        {payErrorKind !== 'paidSlotUnavailable' && <button type="button" className="bk-payment-fallback-btn bk-payment-fallback-btn--primary" onClick={handleRetryPayment}><RotateCw size={16} aria-hidden="true" />Check payment status</button>}
        {['connectivity', 'paidSlotUnavailable'].includes(payErrorKind) && <>
          {contactMessengerUrl && <a href={contactMessengerUrl} target="_blank" rel="noreferrer" className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost"><MessageCircle size={16} aria-hidden="true" />Message the venue</a>}
          {contactPhone && <a href={`tel:${contactPhone}`} className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost"><Phone size={16} aria-hidden="true" />Call the venue</a>}
          {!contactPhone && !contactMessengerUrl && <Link to="/contact" className="bk-payment-fallback-btn bk-payment-fallback-btn--ghost"><MessageCircle size={16} aria-hidden="true" />Contact the venue</Link>}
        </>}
      </div>
    </div>}
    {payError && !['checking', 'connectivity', 'paidSlotUnavailable', 'expired', 'cancelled'].includes(payErrorKind) && <p className="bk-payment-error" role="alert"><TriangleAlert size={16} aria-hidden="true" />{payError}</p>}

    <div className="bk-detail-actions">
      <button type={isCard ? 'submit' : 'button'} form={isCard ? 'bkCardForm' : undefined} className="bk-confirm bk-continue" disabled={payLoading || !pmIntent || (!isDemo && !selectedMethod) || blocksPayment} aria-busy={payLoading} onClick={isDemo ? handleDemoPay : isCard ? undefined : handleConfirmWalletPay}>
        {payLoading ? 'Processing…' : isDemo ? 'Simulate successful payment' : `Pay ₱${downPaymentAmount.toLocaleString()}`}
      </button>
    </div>
  </div>;
}
