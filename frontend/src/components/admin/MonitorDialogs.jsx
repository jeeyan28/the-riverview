import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import Modal from '../Modal';
import { roomSessionsService } from '../../services/monitoring';
import { sessionEnd, formatStartTime, formatTimeRemaining } from '../../hooks/useRoomMonitorData';

const EXTENSION_OPTIONS = [
  { hours: 0.5, label: '30 min' },
  { hours: 1, label: '1 hr' },
  { hours: 1.5, label: '1 hr 30 min' },
  { hours: 2, label: '2 hrs' },
];

function sessionLengthLabel(hours) {
  const wholeHours = Math.floor(Number(hours) || 0);
  const minutes = Math.round(((Number(hours) || 0) - wholeHours) * 60);
  return [wholeHours ? `${wholeHours} hr${wholeHours === 1 ? '' : 's'}` : '', minutes ? `${minutes} min` : ''].filter(Boolean).join(' ');
}

function guestInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

export function ExtendSessionModal({
  session, onClose, onSubmit,
  maxSessionHours: MAX_SESSION_HOURS,
  canExtendSession,
  formatMoney: money,
  formatClock: boardClock,
  formatReservationTime: reservationNoticeTime,
}) {
  const [addedHours, setAddedHours] = useState(0.5);
  const [collectNow, setCollectNow] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const sessionId = session?._id;
  const sessionDuration = Number(session?.duration);
  const extensionEligible = Boolean(session && canExtendSession(session));
  const quoteRevision = JSON.stringify([session?.amount, session?.paidAmount, session?.refundedAmount, session?.scheduledEndTime]);

  useEffect(() => {
    if (!sessionId) return;
    setAddedHours(0.5);
    setCollectNow(false);
    setPaymentMethod('Cash');
    setSaveError('');
  }, [sessionId]);

  useEffect(() => {
    setQuote(null);
    if (!sessionId) return;
    if (!extensionEligible || sessionDuration + addedHours > MAX_SESSION_HOURS) {
      setQuoteError(`Choose an extension that keeps the session within ${MAX_SESSION_HOURS} hours.`);
      return;
    }
    let current = true;
    setQuoteError('');
    roomSessionsService.quoteExtension(sessionId, addedHours)
      .then((result) => { if (current) setQuote(result); })
      .catch((error) => { if (current) setQuoteError(error.message || 'Could not calculate the extension charge.'); });
    return () => { current = false; };
  }, [sessionId, sessionDuration, extensionEligible, MAX_SESSION_HOURS, quoteRevision, addedHours, quoteAttempt]);

  if (!session) return null;

  const availableOptions = EXTENSION_OPTIONS.filter((option) => Number(session.duration) + option.hours <= MAX_SESSION_HOURS);
  const balanceAfter = quote ? Math.max(0, Math.round((Number(quote.newBalance) - (collectNow ? Number(quote.addedCharge) : 0)) * 100) / 100) : 0;
  const reservationTime = reservationNoticeTime(quote?.reservationStart);
  const reservationStartMs = Date.parse(quote?.reservationStart || '');
  const shorterExtensionFits = availableOptions.some((option) => option.hours < addedHours && sessionEnd(session).getTime() + option.hours * 60 * 60 * 1000 <= reservationStartMs);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!quote || quote.canExtend === false || Number(quote.addedHours) !== addedHours || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSubmit({ addedHours, collectNow, expectedCharge: quote.addedCharge, paymentMethod });
    } catch (error) {
      setSaveError(error.message || 'Could not extend this session.');
      if (error.status === 409) setQuoteAttempt((value) => value + 1);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={saving ? undefined : onClose} size="lg" className="extend-session-modal" title={`Extend session · ${session.roomName || session.facilityName} · Table ${session.roomNumber}`}>
      <form className="session-extension" onSubmit={handleSubmit}>
        <p className="mfield-note">{session.guestName || 'Walk-in guest'} · Current end {boardClock(sessionEnd(session))} · {sessionLengthLabel(session.duration)} of {MAX_SESSION_HOURS} hours used</p>
        <div className="mfield-section-label">Add time</div>
        <div className="session-extension-options" role="group" aria-label="Extension length">
          {availableOptions.map((option) => (
            <button key={option.hours} type="button" className={`session-extension-option${addedHours === option.hours ? ' active' : ''}`} aria-pressed={addedHours === option.hours} disabled={saving} onClick={() => { if (option.hours !== addedHours) { setQuote(null); setAddedHours(option.hours); } setSaveError(''); }}>{option.label}</button>
          ))}
        </div>
        <div className="session-extension-quote-slot" aria-live="polite">
          {quoteError && <div className="session-extension-retry"><p className="session-form-error" role="alert">{quoteError}</p>{availableOptions.length > 0 && <button type="button" className="rm-btn" onClick={() => setQuoteAttempt((value) => value + 1)}>Try again</button>}</div>}
          {!quote && !quoteError && <p className="mfield-note" role="status">Calculating the extension charge…</p>}
          {quote?.canExtend === false && (
            <div className="session-availability-notice session-availability-notice--conflict" role="status">
              <TriangleAlert size={20} aria-hidden="true" />
              <div>
                <span className="session-availability-label">Upcoming reservation{reservationTime ? ` · ${reservationTime}` : ''}</span>
                <strong>Keep one {session.roomName || session.facilityName} table free</strong>
                <p>Adding {sessionLengthLabel(addedHours)} would keep this table busy when the reservation starts.</p>
                <p className="session-availability-action">
                  {shorterExtensionFits
                    ? 'Pick a shorter extension, or keep the current end time.'
                    : `Keep the current end time, or free up another ${session.roomName || session.facilityName} table.`}
                </p>
              </div>
            </div>
          )}
          {quote && quote.canExtend !== false && (
            <>
              <div className="session-payment-ledger session-extension-summary" aria-label="Extension payment summary">
                <div><span>Current balance</span><strong>{money(quote.currentBalance)}</strong></div>
                <div><span>Added time</span><strong>{money(quote.addedCharge)}</strong></div>
                <div><span>New end time</span><strong>{boardClock(new Date(quote.scheduledEndTime))}</strong></div>
                <div className={balanceAfter > 0 ? 'balance-due' : 'balance-paid'}><span>Balance after extension</span><strong>{money(balanceAfter)}</strong></div>
              </div>
              <div className="mfield-section-label">When will the guest pay for the added time?</div>
              <div className="session-collection-options" role="group" aria-label="Extension payment timing">
                <button type="button" className={collectNow ? 'active' : ''} aria-pressed={collectNow} disabled={saving} onClick={() => setCollectNow(true)}><strong>Pay before play</strong><small>Collect {money(quote.addedCharge)} now</small></button>
                <button type="button" className={!collectNow ? 'active' : ''} aria-pressed={!collectNow} disabled={saving} onClick={() => setCollectNow(false)}><strong>Pay after play</strong><small>Add {money(quote.addedCharge)} to the balance</small></button>
              </div>
              {collectNow && Number(quote.currentBalance) > 0 && <p className="mfield-note">The earlier {money(quote.currentBalance)} balance will still be due when this session finishes.</p>}
              {collectNow && (
                <div className="mfield session-extension-method">
                  <label htmlFor="extension-payment-method">Payment method</label>
                  <select id="extension-payment-method" value={paymentMethod} disabled={saving} onChange={(event) => setPaymentMethod(event.target.value)}>
                    <option value="Cash">Cash</option>
                    <option value="GCash">GCash</option>
                    <option value="Maya">Maya</option>
                  </select>
                </div>
              )}
            </>
          )}
        </div>
        {saveError && <p className="session-form-error" role="alert">{saveError}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-cancel" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-confirm" disabled={!quote || quote.canExtend === false || Number(quote.addedHours) !== addedHours || saving}>{saving ? 'Saving…' : 'Confirm extension'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function FinishSessionModal({
  session, disabled, onClose, onSubmit,
  getPaymentSummary: paymentSummary,
  formatMoney: money,
}) {
  const [submitting, setSubmitting] = useState(false);

  const payment = paymentSummary(session);
  const isFullyPaid = !!session && payment.balance === 0;

  async function handleSubmit(event) {
    event.preventDefault();
    const received = Math.max(Number(session.paidAmount || 0), Number(session.amount || 0) + Number(session.refundedAmount || 0));
    setSubmitting(true);
    try {
      await onSubmit({ paid: Number(session.amount) > 0, paidAmount: received });
    } catch (err) {
      alert(err.message || 'Could not finish this session.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={!!session} onClose={onClose} title="Finish session">
      {session && (
        <form onSubmit={handleSubmit}>
          <p className="mfield-note">{session.guestName || 'Walk-in guest'} · {session.roomName || `Table ${session.roomNumber}`} · charge {money(session.amount)}</p>
          {isFullyPaid ? (
            <div className="finish-session-notice finish-session-notice--paid" role="status">
              <i className="bi bi-check-circle-fill" aria-hidden="true"></i>
              <span><strong>Payment complete</strong><small>Finishing will close this session and make the table available.</small></span>
            </div>
          ) : (
            <>
              <div className="finish-payment-ledger" aria-label="Current payment balance">
                <div><span>Already received</span><strong>{money(payment.collected)}</strong></div>
                <div><span>Balance remaining</span><strong>{money(payment.balance)}</strong></div>
              </div>
              <p className="mfield-note">Collect the full {money(payment.balance)} balance before finishing. This will record it as paid.</p>
            </>
          )}
          <div className="modal-actions"><button type="button" className="btn-cancel" onClick={onClose}>Keep active</button><button type="submit" className="btn-confirm" disabled={disabled || submitting}>{submitting ? 'Saving…' : isFullyPaid ? 'Finish session' : 'Record full payment & finish'}</button></div>
        </form>
      )}
    </Modal>
  );
}

export function RoomDetailModal({
  room, view, onClose, canOperate, onExtend, onEndSessionPaid, onCancelSession,
  getPaymentSummary: paymentSummary,
  canExtendSession,
  formatMoney: money,
}) {
  const title = room ? `Table ${room.roomNumber} — ${room.facilityName}` : 'Table details';

  return (
    <Modal open={!!room} onClose={onClose} title={title}>
      {room && view && (
        <>
          <div className="rmd-top">
            <span className={`rm-status-pill status-${view.stateClass}`}><span className="dot"></span>{view.statusLabel}</span>
            {view.occupancy && <span className="rm-foot-price">{money(Number(view.occupancy.rate) || room.price)}/hr</span>}
          </div>

          {view.occupancy ? (
            <>
              <div className={`rmd-timer-block${view.isWarning ? ' warn' : ''}${(view.isPastEnd || view.isCritical) ? ' expired' : ''}`}>
                {view.isPastEnd && <div className="rmd-timer-caption">Overdue</div>}
                <div className="rmd-timer-value">{formatTimeRemaining(view.remaining, view.isPastEnd)}</div>
                {!view.isPastEnd && <div className="rmd-timer-caption">Time left</div>}
              </div>

              {view.occupancy.guestName && (
                <div className="rmd-guest-row">
                  <div className="rmd-avatar">{guestInitials(view.occupancy.guestName)}</div>
                  <div>
                    <div className="rmd-guest-name">{view.occupancy.guestName}</div>
                    <div className="rmd-guest-sub">Started {formatStartTime(view.occupancy)}</div>
                  </div>
                </div>
              )}

              <div className="rmd-stat-grid">
                <div className="rmd-stat-box">
                  <div className="lbl">Session type</div>
                  <div className="val">{view.occupancy.booking ? 'Reserved' : 'Walk-in'}</div>
                </div>
                <div className="rmd-stat-box">
                  <div className="lbl">Total charge</div>
                  <div className="val">{money(view.occupancy.amount)}</div>
                </div>
                <div className="rmd-stat-box"><div className="lbl">Received</div><div className="val">{money(paymentSummary(view.occupancy).collected)}</div></div>
                <div className="rmd-stat-box"><div className="lbl">Balance remaining</div><div className="val">{money(paymentSummary(view.occupancy).balance)}</div></div>
              </div>
            </>
          ) : (
            <div className="rmd-empty-block">
              <i className="bi bi-check-circle"></i>
              <span>Ready for a new session</span>
              <div className="rmd-rate">₱{room.price}/hr</div>
            </div>
          )}

          <div className="rmd-actions">
            {view.occupancy ? (
              canOperate && (
                <>
                  <button className="rm-btn rm-btn--success rm-btn--block" onClick={onEndSessionPaid}><i className="bi bi-check2-circle"></i>Finish Session</button>
                  <div className="rmd-actions-row">
                    {canExtendSession(view.occupancy) && <button className="rm-btn" onClick={onExtend}><i className="bi bi-clock-history"></i>Extend</button>}
                    <button className="rm-btn danger" onClick={onCancelSession}><i className="bi bi-x-circle"></i>Cancel Session</button>
                  </div>
                </>
              )
            ) : null}
            <button className="btn-cancel" onClick={onClose}>Close</button>
          </div>
        </>
      )}
    </Modal>
  );
}
