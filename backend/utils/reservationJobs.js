const { processPendingClosureRefunds } = require('./closureRefunds');
const { deliverNotificationEmails } = require('./reservationNotifications');
const { voidExpiredBookings } = require('./bookingHelper');
const AppError = require('./appError');

let activeRun;

function runReservationJobs() {
  if (!activeRun) {
    activeRun = (async () => {
      const results = {};
      const failed = [];
      for (const [name, run] of [
        ['noShows', voidExpiredBookings],
        ['refunds', processPendingClosureRefunds],
        ['emails', deliverNotificationEmails],
      ]) {
        try { results[name] = await run(); }
        catch (error) {
          failed.push(name);
          console.error(`Reservation job ${name} failed:`, error.message);
        }
      }
      if (failed.length) throw new AppError(503, 'Some reservation jobs could not finish. Please retry.');
      return { refunds: results.refunds, emails: results.emails };
    })().finally(() => { activeRun = null; });
  }
  return activeRun;
}

module.exports = { runReservationJobs };
