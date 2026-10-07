const { runReservationJobs } = require('./reservationJobs');

function startReservationScheduler() {
  let stopped = false;
  let pending = null;
  function tick() {
    if (stopped || pending) return pending;
    pending = runReservationJobs()
      .catch(error => { console.error('Reservation scheduler failed:', error.message); })
      .finally(() => { pending = null; });
    return pending;
  }
  const timer = setInterval(tick, 60000);
  tick();
  return async function stop() {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}

module.exports = { startReservationScheduler };
