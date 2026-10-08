const { AsyncLocalStorage } = require('node:async_hooks');
const scope = new AsyncLocalStorage();
function withJobDeadline(deadline, run) { return scope.run(deadline, run); }
function remainingJobMs() { const deadline = scope.getStore(); return deadline ? Math.max(0, deadline - Date.now()) : Infinity; }
module.exports = { withJobDeadline, remainingJobMs };
