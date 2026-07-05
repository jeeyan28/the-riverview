// Every permission the admin panel understands. Keep these strings stable.
const PERMISSIONS = {
  POS_ACCESS:  "pos:access",
  POS_REFUND:  "pos:refund",       // refunds, discounts, void transactions

  ROOM_VIEW:   "room:view",
  ROOM_MANAGE: "room:manage",      // create/edit/delete rooms, pricing, status

  BOOKING_VIEW:   "booking:view",
  BOOKING_MANAGE: "booking:manage", // create/edit/cancel bookings

  REPORTS_VIEW: "reports:view",

  ADMIN_MANAGE: "admin:manage",    // create/edit/deactivate other staff/manager/super_admin accounts

  // Operating hours, holidays/closures, and homepage announcements.
  // Staff can VIEW these (e.g. to answer a guest's question) but only
  // manager/super_admin can change what's live on the public homepage.
  SETTINGS_VIEW:   "settings:view",
  SETTINGS_MANAGE: "settings:manage",
};

const ROLE_PERMISSIONS = {
  super_admin: Object.values(PERMISSIONS), // owner — everything

  manager: [
    PERMISSIONS.POS_ACCESS,
    PERMISSIONS.POS_REFUND,
    PERMISSIONS.ROOM_VIEW,
    PERMISSIONS.ROOM_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
  ],

  staff: [
    PERMISSIONS.POS_ACCESS,
    PERMISSIONS.ROOM_VIEW,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.SETTINGS_VIEW,
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

module.exports = { PERMISSIONS, ROLE_PERMISSIONS, getEffectivePermissions, hasPermission, isAdminRole };