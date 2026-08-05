const PERMISSIONS = {
  POS_ACCESS:  "pos:access",
  POS_REFUND:  "pos:refund",

  ROOM_VIEW:   "room:view",
  ROOM_MANAGE: "room:manage",

  BOOKING_VIEW:   "booking:view",
  BOOKING_MANAGE: "booking:manage",

  REPORTS_VIEW: "reports:view",

  FORECASTING_VIEW: "forecasting:view",

  ADMIN_MANAGE: "admin:manage",

  SETTINGS_VIEW:   "settings:view",
  SETTINGS_MANAGE: "settings:manage",
};

const ROLE_LABELS = {
  user: "User",
  staff: "Staff",
  manager: "Supervisor",
  super_admin: "Owner",
};

const ROLE_LEVEL = {
  user: 0,
  staff: 1,
  manager: 2,
  super_admin: 3,
};

const ROLE_PERMISSIONS = {
  super_admin: Object.values(PERMISSIONS),

  manager: Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.FORECASTING_VIEW),

  staff: [
    PERMISSIONS.ROOM_VIEW,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.BOOKING_MANAGE,
  ],
};

function getEffectivePermissions(user) {
  return ROLE_PERMISSIONS[user.role] || [];
}

function hasPermission(user, permission) {
  return getEffectivePermissions(user).includes(permission);
}

function isAdminRole(role) {
  return ["staff", "manager", "super_admin"].includes(role);
}

function roleLevel(role) {
  return ROLE_LEVEL.hasOwnProperty(role) ? ROLE_LEVEL[role] : -1;
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function canManageTarget({ actor, target }) {
  const isSelf = String(actor._id) === String(target._id);
  if (isSelf) {
    return { ok: false, message: "You cannot change your own role or account status here." };
  }
  if (target.role === "super_admin" && actor.role !== "super_admin") {
    return { ok: false, message: "Only an Owner can manage another Owner's account." };
  }
  if (roleLevel(target.role) >= roleLevel(actor.role)) {
    return { ok: false, message: "You cannot manage a user with the same or higher role than yours." };
  }
  return { ok: true };
}

function canAssignRole({ actor, targetRole }) {
  if (!ROLE_LEVEL.hasOwnProperty(targetRole)) {
    return { ok: false, message: "Unknown role." };
  }
  if (targetRole === "super_admin") {
    if (actor.role !== "super_admin") {
      return { ok: false, message: "Only an Owner can assign the Owner role." };
    }
    return { ok: true };
  }
  if (roleLevel(targetRole) >= roleLevel(actor.role)) {
    return { ok: false, message: "You cannot assign a role equal to or higher than your own." };
  }
  return { ok: true };
}

function assignableRoles(actorRole) {
  const level = roleLevel(actorRole);
  return Object.keys(ROLE_LEVEL).filter((role) => {
    if (role === "user") return false;
    if (role === "super_admin") return actorRole === "super_admin";
    return roleLevel(role) < level;
  });
}

function assignableRoleChanges(actorRole) {
  return [...assignableRoles(actorRole), "user"];
}

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_LEVEL,
  getEffectivePermissions,
  hasPermission,
  isAdminRole,
  roleLevel,
  roleLabel,
  canManageTarget,
  canAssignRole,
  assignableRoles,
  assignableRoleChanges,
};