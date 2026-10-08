const { processPendingClosureRefunds } = require('./closureRefunds');
const { deliverNotificationEmails } = require('./reservationNotifications');
const { voidExpiredBookings } = require('./bookingHelper');
const AppError = require('./appError');
const { claimLease, renewLease, releaseLease } = require('./jobLease');
const { deliverReceipts } = require('./receiptOutbox');
const { withJobDeadline } = require('./jobDeadline');

async function runReservationJobs({ stages, deadlineMs = 45000, leaseMs = 60000 } = {}) {
  const lease = await claimLease('reservations', { leaseMs });
  if (!lease) return { status: 'already_running' };
  const results = {}, failed = [];
  const deadline = Date.now() + Math.min(deadlineMs, 55000);
  let lost = false;
  const renewal = setInterval(() => {
    renewLease(lease, { leaseMs }).then(ok => { if (!ok) lost = true; }).catch(() => { lost = true; });
  }, Math.max(1000, Math.floor(leaseMs / 3)));
  renewal.unref();
  try {
    for (const [name, run] of stages || [
      ['noShows', voidExpiredBookings],
      ['refunds', () => processPendingClosureRefunds({ limit: 3 })],
      ['payments', () => require('./paymentReconciliation').reconcileDuePayments({ limit: 3 })],
      ['receipts', () => deliverReceipts({ limit: 5, deadlineMs: Math.max(1, deadline - Date.now()) })],
      ['emails', () => deliverNotificationEmails({ limit: 5 })],
    ]) {
      if (lost || Date.now() >= deadline || !await renewLease(lease, { leaseMs })) { failed.push(name); break; }
      try { results[name] = await withJobDeadline(deadline, run); }
      catch (error) {
        failed.push(name);
        console.error('Reservation job stage failed:', { stage: name, category: error.name });
      }
    }
  } finally {
    clearInterval(renewal);
    await releaseLease(lease, { counts: results, failedStages: failed });
  }
  if (failed.length) {
    const error = new AppError(503, 'Some reservation jobs could not finish. Please retry.');
    error.code = 'JOBS_PARTIAL_FAILURE';
    error.result = { status: 'partial_failure', counts: results, failedStages: failed };
    throw error;
  }
  return { status: 'completed', counts: results };
}

module.exports = { runReservationJobs };
