import Modal from '../Modal';
import ReservationTimePicker from '../ReservationTimePicker';
import { formatPeso } from '../../utils/currency';
import { businessDate } from '../../utils/businessDate';
import { repeatCustomerLookupTerm } from '../../utils/repeatCustomers';

export function ManualReservationForm({
  open, onClose, onSubmit, guestName, setGuestName,
  selectedCustomerName, setSelectedCustomerName, customerMatches, customerLookupState, customerNameFocused,
  setCustomerNameFocused, customerPrefillNotice, setCustomerPrefillNotice, customerNameRef, customerOptionRefs,
  choosePreviousCustomer, guestContact, setGuestContact, guestEmail, setGuestEmail,
  guestCount, setGuestCount, roomId, setRoomId, roomsLoading,
  roomsError, onReloadRooms, selectableRooms, variants, variantLabel,
  setVariantLabel, date, setDate, timeIn, setTimeIn,
  duration, setDuration, minDuration, maxDuration, selectedRoom,
  setAvailability, available, estimatedCharge, firstHourPayment, remainingBalance,
  selectedPaymentChoice, setPaymentChoice, amountReceived, paymentMethod, setPaymentMethod,
  paymentMethods, specialRequests, setSpecialRequests, saving,
}) {
  return (
    <Modal open={open} onClose={onClose} title="Add manual reservation" size="2xl" className="walkin-booking-modal">
      <form onSubmit={onSubmit} className="walkin-booking-form">
        <p className="walkin-form-intro">Start typing a returning customer's name to reuse their usual reservation details. Choose a new date and available time for every booking.</p>

        <section className="walkin-form-section" aria-labelledby="walkin-guest-heading">
          <h3 id="walkin-guest-heading" className="walkin-section-title">Guest</h3>
          <div className="booking-form-grid walkin-guest-grid">
            <div className="mfield manual-customer-field" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setCustomerNameFocused(false); }}>
              <label htmlFor="manual-guest-name">Customer name (Last, First)</label>
              <input
                id="manual-guest-name"
                ref={customerNameRef}
                required
                autoComplete="off"
                value={guestName}
                onFocus={() => setCustomerNameFocused(true)}
                onChange={(event) => { setGuestName(event.target.value); setSelectedCustomerName(''); setCustomerPrefillNotice(''); setCustomerNameFocused(true); }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && customerMatches.length) {
                    event.preventDefault();
                    setCustomerNameFocused(true);
                    requestAnimationFrame(() => customerOptionRefs.current[0]?.focus());
                  }
                  if (event.key === 'Escape' && customerNameFocused) { event.stopPropagation(); setCustomerNameFocused(false); }
                }}
                aria-controls="manual-customer-suggestions"
                aria-expanded={customerNameFocused && repeatCustomerLookupTerm(guestName).length >= 2 && guestName.trim() !== selectedCustomerName}
                aria-autocomplete="list"
                role="combobox"
                placeholder="e.g. Dela Cruz, Juan"
              />
              {customerNameFocused && repeatCustomerLookupTerm(guestName).length >= 2 && guestName.trim() !== selectedCustomerName && (
                <div className="manual-customer-suggestions" id="manual-customer-suggestions" role="listbox" aria-label="Previous customers">
                  {customerLookupState === 'loading' && <p className="manual-customer-suggestion-message">Looking for previous customers…</p>}
                  {customerLookupState === 'error' && <p className="manual-customer-suggestion-message">Could not load previous customers. You can enter the details manually.</p>}
                  {customerLookupState === 'ready' && !customerMatches.length && <p className="manual-customer-suggestion-message">No matching previous customer. Continue entering a new reservation.</p>}
                  {customerMatches.map((customer, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="manual-customer-suggestion"
                      key={customer.key}
                      ref={(element) => { customerOptionRefs.current[index] = element; }}
                      onClick={() => choosePreviousCustomer(customer)}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') { event.preventDefault(); customerOptionRefs.current[Math.min(index + 1, customerMatches.length - 1)]?.focus(); }
                        if (event.key === 'ArrowUp') { event.preventDefault(); (index ? customerOptionRefs.current[index - 1] : customerNameRef.current)?.focus(); }
                        if (event.key === 'Escape') { event.stopPropagation(); customerNameRef.current?.focus(); setCustomerNameFocused(false); }
                      }}
                    >
                      <span className="manual-customer-suggestion-name">{customer.name}<small>{customer.reservationCount} reservation{customer.reservationCount === 1 ? '' : 's'} on file</small></span>
                      <span className="manual-customer-suggestion-detail">{customer.phone || customer.email || 'No contact on file'}</span>
                      {customer.preference && <span className="manual-customer-suggestion-usual">Usually {customer.preference.roomName}{customer.preference.variantLabel ? ` · ${customer.preference.variantLabel}` : ''} · {customer.preference.duration}h</span>}
                    </button>
                  ))}
                </div>
              )}
              {customerPrefillNotice && <p className="manual-customer-prefill-notice" role="status">{customerPrefillNotice}</p>}
            </div>
            <div className="mfield"><label htmlFor="manual-guest-contact">Phone number</label><input id="manual-guest-contact" type="tel" autoComplete="tel" required maxLength={40} value={guestContact} onChange={(event) => setGuestContact(event.target.value)} placeholder="0912 345 6789" /></div>
            <div className="mfield"><label htmlFor="manual-guest-email">Email</label><input id="manual-guest-email" type="email" autoComplete="email" required maxLength={254} value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} placeholder="guest@example.com" /></div>
            <div className="mfield"><label htmlFor="manual-guest-count">Guests</label><input id="manual-guest-count" type="number" min="1" required value={guestCount} onChange={(event) => setGuestCount(event.target.value)} /></div>
          </div>
        </section>

        <section className="walkin-form-section" aria-labelledby="walkin-schedule-heading">
          <h3 id="walkin-schedule-heading" className="walkin-section-title">Facility & schedule</h3>
          <div className="booking-form-grid walkin-facility-grid">
            <div className="mfield"><label htmlFor="manual-room">Facility</label><select id="manual-room" required value={roomId} disabled={roomsLoading || !selectableRooms.length} onChange={(event) => { setRoomId(event.target.value); setTimeIn(''); }}><option value="">{roomsLoading ? 'Loading facilities…' : 'Choose a facility'}</option>{selectableRooms.map((room) => <option key={room._id} value={room._id}>{room.name}</option>)}</select></div>
            <div className="mfield"><label htmlFor="manual-variant">Room type</label><select id="manual-variant" required={variants.length > 0} value={variantLabel} onChange={(event) => { setVariantLabel(event.target.value); setTimeIn(''); }} disabled={!variants.length}><option value="">{variants.length ? 'Choose a room type' : 'Base price'}</option>{variants.map((variant) => <option key={variant.label} value={variant.label}>{variant.label}</option>)}</select></div>
          </div>
          {!roomsLoading && (roomsError || !selectableRooms.length) && <p className="admin-slot-hint admin-slot-hint--warning" role="alert">{roomsError || 'No facilities are available for manual reservations.'} <button type="button" className="admin-slot-retry" onClick={onReloadRooms}>Try again</button></p>}
          <div className="booking-form-grid walkin-time-grid">
            <div className="mfield"><label htmlFor="manual-date">Date</label><input id="manual-date" type="date" required value={date} min={businessDate()} onChange={(event) => { setDate(event.target.value); setTimeIn(''); }} /></div>
            <div className="mfield"><label htmlFor="manual-duration">Duration (hours)</label><select id="manual-duration" value={duration} onChange={(event) => { setDuration(event.target.value); if (event.target.value === '1') setPaymentChoice('deposit'); setTimeIn(''); }}>{Array.from({ length: maxDuration - minDuration + 1 }, (_, index) => String(minDuration + index)).map((hours) => <option key={hours} value={hours}>{hours} hour{hours === '1' ? '' : 's'}</option>)}</select></div>
          </div>
          <ReservationTimePicker room={selectedRoom} variantLabel={variantLabel} date={date} duration={duration} timeIn={timeIn} onSelect={setTimeIn} onAvailabilityChange={setAvailability} />
        </section>

        <section className="walkin-form-section" aria-labelledby="walkin-payment-heading">
          <h3 id="walkin-payment-heading" className="walkin-section-title">Payment</h3>
          <div className="manual-payment-layout">
            <div className="manual-charge"><span>Total reservation charge</span><strong>{available ? formatPeso(estimatedCharge) : '—'}</strong><small>{available ? 'Includes the selected hours.' : 'Choose an available time to see the charge.'}</small></div>
            <fieldset className="manual-payment-options" disabled={!available}>
              <legend>Amount received</legend>
              <div className="manual-payment-choice-list">
                <label className={`manual-payment-option${selectedPaymentChoice === 'deposit' ? ' is-selected' : ''}`}>
                  <input type="radio" name="manual-payment-choice" value="deposit" checked={selectedPaymentChoice === 'deposit'} onChange={() => setPaymentChoice('deposit')} />
                  <span><b>{Number(duration) === 1 ? '1-hour reservation payment' : '1-hour down payment'}</b><small>{Number(duration) === 1 ? 'Covers the full reservation' : `Balance ${formatPeso(remainingBalance)} due at the venue`}</small></span>
                  <strong>{available ? formatPeso(firstHourPayment) : '—'}</strong>
                </label>
                {Number(duration) > 1 && (
                  <label className={`manual-payment-option${selectedPaymentChoice === 'full' ? ' is-selected' : ''}`}>
                    <input type="radio" name="manual-payment-choice" value="full" checked={selectedPaymentChoice === 'full'} onChange={() => setPaymentChoice('full')} />
                    <span><b>Full payment</b><small>Nothing left to pay at the venue</small></span>
                    <strong>{available ? formatPeso(estimatedCharge) : '—'}</strong>
                  </label>
                )}
              </div>
            </fieldset>
            {available && amountReceived > 0 && <div className="mfield manual-payment-method"><label htmlFor="manual-payment-method">Payment method</label><select id="manual-payment-method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>{paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}</select></div>}
          </div>
        </section>

        <section className="walkin-form-section" aria-labelledby="walkin-notes-heading">
          <h3 id="walkin-notes-heading" className="walkin-section-title">Notes</h3>
          <div className="mfield manual-notes"><label htmlFor="manual-notes">Special requests / notes <span className="walkin-optional">Optional</span></label><textarea id="manual-notes" rows="3" value={specialRequests} onChange={(event) => setSpecialRequests(event.target.value)} placeholder="Add details the staff should know" /></div>
        </section>

        <div className="modal-actions walkin-actions"><button type="button" className="btn-cancel" onClick={onClose}>Cancel</button><button type="submit" className="btn-confirm" disabled={saving || !available}>{saving ? 'Creating…' : 'Create confirmed reservation'}</button></div>
      </form>
    </Modal>
  );
}

export function CancellationReviewForm({
  booking, onClose, onSubmit, alreadyApproved, decision,
  setDecision, amounts, maxRefund, refundException, setRefundException,
  refundedAmount, setRefundedAmount, note, setNote, reviewError,
  setReviewError, saving, noRefundChange, paidAmount, reservationCode,
  retainedFirstHour,
}) {
  return (
    <Modal open={!!booking} onClose={onClose} title={alreadyApproved ? 'Record manual refund' : 'Review cancellation request'} size="xl" className="cancellation-review-modal">
      {booking && (
        <div className="cancellation-review">
          <div className="cancellation-review-context">
            <div className="cancellation-review-summary">
              <div><span>Guest</span><strong>{booking.guestName}</strong><small>{reservationCode}</small></div>
              <div><span>Paid so far</span><strong>{formatPeso(paidAmount)}</strong></div>
            </div>
            <div className="cancellation-review-reason"><span>Guest's reason</span><p>{booking.cancellationReason?.trim() || 'No reason provided.'}</p></div>
          </div>
          {!alreadyApproved && <fieldset className="cancellation-decision"><legend>Choose a decision</legend><div className="cancellation-decision-options">
            <button type="button" aria-pressed={decision === 'approve'} className={decision === 'approve' ? 'is-selected' : ''} onClick={() => setDecision('approve')}><strong>Approve cancellation</strong><small>Cancel the reservation and record any refund.</small></button>
            <button type="button" aria-pressed={decision === 'reject'} className={decision === 'reject' ? 'is-selected' : ''} onClick={() => { setDecision('reject'); setRefundException(false); setRefundedAmount(String(booking.refundedAmount ?? 0)); }}><strong>Keep reservation</strong><small>Decline the request; the reservation stays active.</small></button>
          </div></fieldset>}
          {decision === 'approve' && <div className="cancellation-refund-section">
            {amounts.customerCancelled && <div className="cancellation-policy"><span>Refund limit</span><strong>Up to {formatPeso(maxRefund)}</strong><small>{booking.cancellationRefundException ? 'Refund exception approved.' : `First-hour charge kept: ${amounts.firstHour === null ? 'needs review' : formatPeso(retainedFirstHour)}`}</small></div>}
            <div className="mfield"><label htmlFor="cancellation-refund">Total refunded manually</label><div className="cancellation-refund-input"><span>₱</span><input id="cancellation-refund" type="number" min={amounts.refunded} max={maxRefund} step="0.01" value={refundedAmount} onChange={(event) => { setRefundedAmount(event.target.value); setReviewError(''); }} /></div><p className="mfield-note">Enter the total already sent. Saving this amount does not send a payment.</p></div>
            {amounts.customerCancelled && <label className="cancellation-exception-option" htmlFor="cancellation-refund-exception"><input id="cancellation-refund-exception" type="checkbox" checked={refundException} onChange={(event) => setRefundException(event.target.checked)} disabled={Boolean(booking.cancellationRefundException)} /><span><strong>Venue or payment issue</strong><small>Allows a larger refund for a venue cancellation, duplicate charge, or verified payment error. Explain it in the note.</small></span></label>}
          </div>}
          <div className="mfield"><label htmlFor="cancellation-note">Review note {refundException && !booking.cancellationRefundException ? '(required)' : '(optional)'}</label><textarea id="cancellation-note" rows="2" value={note} onChange={(event) => { setNote(event.target.value); setReviewError(''); }} placeholder="Add context for the audit trail" /></div>
          {reviewError && <p className="cancellation-review-error" role="alert">{reviewError}</p>}
          <div className="modal-actions cancellation-review-actions"><button type="button" className="btn-cancel" onClick={onClose}>Close</button><button type="button" className="btn-confirm" disabled={saving || noRefundChange} onClick={onSubmit}>{saving ? 'Saving…' : alreadyApproved ? 'Record refund' : decision === 'approve' ? 'Approve request' : 'Keep reservation'}</button></div>
        </div>
      )}
    </Modal>
  );
}
