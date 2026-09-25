const { isAdminRole } = require('./permissions');

const STAFF_SESSION_MS = 8 * 60 * 60 * 1000;
const CUSTOMER_SESSION_MS = 365 * 24 * 60 * 60 * 1000;

function refreshSessionLifetime(req, user) {
  req.session.cookie.maxAge = isAdminRole(user.role) ? STAFF_SESSION_MS : CUSTOMER_SESSION_MS;
}

function setAuthenticatedSession(req, user) {
  req.session.userId = user._id.toString();
  req.session.role = user.role;
  if (!req.session.startedAt) req.session.startedAt = Date.now();
  refreshSessionLifetime(req, user);
}

module.exports = { STAFF_SESSION_MS, CUSTOMER_SESSION_MS, refreshSessionLifetime, setAuthenticatedSession };
