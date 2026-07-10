// Every permission the admin panel understands. Keep these strings stable —
// they also appear in the frontend's mirrored copy (js/admin.js) and in
// data-requires-permission attributes in admin.html, so renaming one means
// updating both sides.
const PERMISSIONS = {
  POS_ACCESS:  "pos:access",
  POS_REFUND:  "pos:refund",       // refunds, discounts, void transactions

  ROOM_VIEW:   "room:view",
  ROOM_MANAGE: "room:manage",      // create/edit/delete rooms, pricing, status

  BOOKING_VIEW:   "booking:view",
  BOOKING_MANAGE: "booking:manage", // create/edit/cancel bookings

  REPORTS_VIEW: "reports:view",

  FORECASTING_VIEW: "forecasting:view", // Owner-only demand/revenue forecasting

  ADMIN_MANAGE: "admin:manage",    // create/edit/deactivate other staff/supervisor/owner accounts
                                    // (WHO a given admin:manage holder may actually act on is governed
                                    // separately by the role hierarchy below, not by this permission alone)

  // Operating hours, holidays/closures, and homepage announcements.
  // Staff can VIEW these (e.g. to answer a guest's question) but only
  // Supervisor/Owner can change what's live on the public homepage.
  SETTINGS_VIEW:   "settings:view",
  SETTINGS_MANAGE: "settings:manage",
};

// Internal role slugs are unchanged from the original schema (user / staff /
// manager / super_admin) to avoid a risky data migration on existing accounts
// and sessions. They map 1:1 onto the business-facing role names:
//   user        -> "User"       (customer)
//   staff       -> "Staff"
//   manager     -> "Supervisor"
//   super_admin -> "Owner"
const ROLE_LABELS = {
  user: "User",
  staff: "Staff",
  manager: "Supervisor",
  super_admin: "Owner",
};

// Higher number = more authority. Drives "can only manage roles strictly
// below your own" everywhere admin accounts are created, edited, have their
// role changed, or are deleted/deactivated.
const ROLE_LEVEL = {
  user: 0,
  staff: 1,
  manager: 2,
  super_admin: 3,
};

const ROLE_PERMISSIONS = {
  super_admin: Object.values(PERMISSIONS), // Owner — everything, including Forecasting

  // Supervisor — everything Owner has except Forecasting. ADMIN_MANAGE is
  // included here on purpose: a Supervisor CAN manage user accounts, just
  // only ones with a strictly lower role. That "who" restriction is enforced
  // by canManageTarget()/canAssignRole() below, not by this permission list.
  manager: Object.values(PERMISSIONS).filter((p) => p !== PERMISSIONS.FORECASTING_VIEW),

  // Staff — restricted to Bookings, Room Monitoring, and their own Profile.
  // Deliberately excludes POS_ACCESS and SETTINGS_VIEW (previously granted,
  // now Supervisor/Owner-only) so Staff can't reach the POS or Settings
  // panels/routes at all.
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

// ── Role hierarchy rules (shared by every place that creates/edits/deletes
// an account or changes a role) ─────────────────────────────────────────
//
//   • Nobody may act on an account whose role is equal to or higher than
//     their own — including their own account (self-role-change is blocked
//     unconditionally, regardless of level).
//   • Only an Owner may assign the Owner role to anyone, and only an Owner
//     may modify or delete an existing Owner account at all.
//
// Returns { ok, message } so callers can respond with a clear 403 instead
// of a bare boolean.
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

// Separate from canManageTarget(): governs which role may be HANDED OUT (on
// create, or on a role change), independent of whether a target account
// exists yet.
function canAssignRole({ actor, targetRole }) {
  if (!ROLE_LEVEL.hasOwnProperty(targetRole)) {
    return { ok: false, message: "Unknown role." };
  }
  // Owner role is a special case: only an Owner may hand it out, but an
  // Owner CAN hand it out (including to create another Owner) — so this is
  // checked on its own, before the generic strictly-lower-than-yours rule
  // below, which would otherwise also block super_admin -> super_admin.
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

// Roles an actor is allowed to hand out — drives the role dropdown in the
// admin UI so nobody is even offered a choice the server would reject.
function assignableRoles(actorRole) {
  const level = roleLevel(actorRole);
  return Object.keys(ROLE_LEVEL).filter((role) => {
    if (role === "user") return false;
    // Mirrors canAssignRole()'s special case: Owner is the one role that's
    // assignable at the actor's OWN level, and only for an Owner actor.
    if (role === "super_admin") return actorRole === "super_admin";
    return roleLevel(role) < level;
  });
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
};