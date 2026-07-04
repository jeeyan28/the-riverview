const { hasPermission } = require("../utils/permissions");
const User = require("../model/user");

// Requires an active session (any logged-in user, customer or admin).
async function ensureAuthenticated(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: "Not logged in." });
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "Not logged in." });
    }
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Not logged in." });
  }
}

// Requires the session user to be staff/manager/super_admin.
function ensureAdmin(req, res, next) {
  ensureAuthenticated(req, res, () => {
    if (!["staff", "manager", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access required." });
    }
    next();
  });
}

function requirePermission(permission) {
  return (req, res, next) => {
    ensureAdmin(req, res, () => {
      if (!hasPermission(req.user, permission)) {
        return res.status(403).json({ message: "You do not have permission to do that." });
      }
      next();
    });
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    ensureAdmin(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Your role does not have access to this." });
      }
      next();
    });
  };
}

module.exports = { ensureAuthenticated, ensureAdmin, requirePermission, requireRole };
