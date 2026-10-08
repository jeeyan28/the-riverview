const { hasPermission, isAdminRole } = require("../utils/permissions");
const User = require("../model/user");
const { refreshSessionLifetime } = require("../utils/sessionPolicy");
const { isObjectIdOrHexString } = require("mongoose");
const { randomUUID } = require("node:crypto");

async function ensureAuthenticated(req, res, next) {
  if (!req.session || !isObjectIdOrHexString(req.session.userId)) {
    return res.status(401).json({ message: "Not logged in." });
  }
  try {
    const user = await User.findOne({
      _id: req.session.userId,
      $or: [
        { password: { $type: "string", $ne: "" } },
        { googleId: { $type: "string", $ne: "" } },
      ],
    });
    if (!user || !user.isActive || user.isVerified === false || (req.session.sessionVersion || "") !== (user.sessionVersion || "")) {
      req.session.destroy?.(() => {});
      return res.status(401).json({ message: "Not logged in." });
    }
    req.user = user;
    refreshSessionLifetime(req, user);
    next();
  } catch (err) {
    const requestId = req.id || randomUUID();
    console.error("Session verification failed:", { requestId, error: err.code || err.name || "Error" });
    return res.status(503).json({
      message: "We could not verify your session right now. Try again.",
      code: "SESSION_UNAVAILABLE",
      requestId,
    });
  }
}

function ensureAdmin(req, res, next) {
  ensureAuthenticated(req, res, () => {
    if (!isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Admin access required." });
    }
    next();
  });
}

function requirePermission(permission) {
  return Object.assign((req, res, next) => {
    ensureAdmin(req, res, () => {
      if (!hasPermission(req.user, permission)) {
        return res.status(403).json({ message: "You do not have permission to do that." });
      }
      next();
    });
  }, { apiAccess: { permissions: [permission] } });
}

function requireAnyPermission(...permissions) {
  return Object.assign((req, res, next) => {
    ensureAdmin(req, res, () => {
      if (!permissions.some((p) => hasPermission(req.user, p))) {
        return res.status(403).json({ message: "You do not have permission to do that." });
      }
      next();
    });
  }, { apiAccess: { anyPermissions: permissions } });
}

function requireRole(...roles) {
  return Object.assign((req, res, next) => {
    ensureAdmin(req, res, () => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Your role does not have access to this." });
      }
      next();
    });
  }, { apiAccess: { roles } });
}

ensureAuthenticated.apiAccess = { authenticated: true };
ensureAdmin.apiAccess = { roles: ['staff', 'manager', 'super_admin'] };

module.exports = { ensureAuthenticated, ensureAdmin, requirePermission, requireAnyPermission, requireRole };
