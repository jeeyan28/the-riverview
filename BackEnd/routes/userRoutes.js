const express = require("express");
const router = express.Router();

const User = require("../model/user");
const { ensureAuthenticated, requirePermission } = require("../middleware/adminAuth");
const {
  hasPermission,
  PERMISSIONS,
  isAdminRole,
  roleLabel,
  canManageTarget,
  canAssignRole,
  assignableRoles,
} = require("../utils/permissions");
const { normalizeName, validateName } = require("../utils/nameValidation");

// Anyone may edit their own profile; editing someone else's requires the
// admin:manage permission AND passing the same role-hierarchy check used by
// the dedicated role/status endpoints below (a Supervisor must not be able
// to edit an Owner's profile fields just because this route doesn't touch role/status).
function canEditTarget(req, target) {
  if (req.session.userId === String(target._id)) return true;
  if (!isAdminRole(req.user.role) || !hasPermission(req.user, PERMISSIONS.ADMIN_MANAGE)) return false;
  return canManageTarget({ actor: req.user, target }).ok;
}

function shapeUser(u) {
  return {
    _id: u._id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    roleLabel: roleLabel(u.role),
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

// ── List users (admins + customers), for the "Manage Users" panel.
// Owner and Supervisor both have admin:manage, so both can view this list —
// the UI decides per-row whether the "manage" actions are shown, using the
// same canManageTarget() rule the server enforces below. Query params:
//   ?role=staff|manager|super_admin|user   filter by role
//   ?search=text                            match name/email
router.get("/", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search) {
      const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
    const shaped = users.map((u) => ({
      ...shapeUser(u),
      canManage: canManageTarget({ actor: req.user, target: u }).ok,
    }));

    res.json({ users: shaped, assignableRoles: assignableRoles(req.user.role) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Create a new admin account (Staff / Supervisor / Owner).
// Customer ("user") signups go through /api/auth/register instead — this
// endpoint is specifically for the admin panel's "Manage Users" panel.
router.post("/", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const { firstName, lastName, phone, email, password, role } = req.body;

    const firstNameError = validateName(firstName, "First name");
    const lastNameError = validateName(lastName, "Last name");
    if (firstNameError) {
      return res.status(400).json({ message: firstNameError });
    }
    if (lastNameError) {
      return res.status(400).json({ message: lastNameError });
    }
    if (!email || !password || !role) {
      return res.status(400).json({ message: "First name, last name, email, password, and role are required." });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const assignCheck = canAssignRole({ actor: req.user, targetRole: role });
    if (!assignCheck.ok) return res.status(403).json({ message: assignCheck.message });

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already in use." });

    const user = await User.create({
      firstName: normalizeName(firstName),
      lastName: normalizeName(lastName),
      phone: phone || "",
      email: String(email).toLowerCase(),
      password,
      role,
    });

    res.status(201).json({ user: shapeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Change a user's role.
router.put("/:id/role", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const { role } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });

    const manageCheck = canManageTarget({ actor: req.user, target });
    if (!manageCheck.ok) return res.status(403).json({ message: manageCheck.message });

    const assignCheck = canAssignRole({ actor: req.user, targetRole: role });
    if (!assignCheck.ok) return res.status(403).json({ message: assignCheck.message });

    target.role = role;
    await target.save();
    res.json({ user: shapeUser(target) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Activate / deactivate a user (soft-disable instead of deleting — keeps
// booking/sales history intact for reporting).
router.put("/:id/status", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const { isActive } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });

    const manageCheck = canManageTarget({ actor: req.user, target });
    if (!manageCheck.ok) return res.status(403).json({ message: manageCheck.message });

    target.isActive = !!isActive;
    await target.save();
    res.json({ user: shapeUser(target) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Delete a user account outright.
router.delete("/:id", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });

    const manageCheck = canManageTarget({ actor: req.user, target });
    if (!manageCheck.ok) return res.status(403).json({ message: manageCheck.message });

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Update profile details (firstName/lastName/phone)
router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });

    if (!canEditTarget(req, target)) {
      return res.status(403).json({ message: "You don't have permission to edit this account." });
    }

    // Google-linked accounts source their name/profile from Google (see
    // /api/auth/google), not a manual edit form — block a self-edit here so
    // the two paths can't drift. An admin editing someone else's account is
    // still allowed through (e.g. to fix a typo), since that's not this rule's concern.
    const isSelfEdit = req.session.userId === String(target._id);
    if (isSelfEdit && target.googleId) {
      return res.status(403).json({ message: "Your profile is managed by your Google account." });
    }

    const { firstName, lastName, phone } = req.body;
    if (firstName !== undefined) {
      const firstNameError = validateName(firstName, "First name");
      if (firstNameError) {
        return res.status(400).json({ message: firstNameError });
      }
      target.firstName = normalizeName(firstName);
    }
    if (lastName !== undefined) {
      const lastNameError = validateName(lastName, "Last name");
      if (lastNameError) {
        return res.status(400).json({ message: lastNameError });
      }
      target.lastName = normalizeName(lastName);
    }
    if (phone !== undefined) target.phone = phone;
    await target.save();

    res.json(shapeUser(target));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Change password (requires current password — even for admins editing
//    their own account; admins editing someone else's account skip this
//    check since they can't know the target's current password)
router.put("/:id/password", ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!canEditTarget(req, user)) {
      return res.status(403).json({ message: "You don't have permission to change this account's password." });
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters." });
    }

    const isSelf = req.session.userId === req.params.id;
    if (isSelf) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required." });
      }
      const match = await user.comparePassword(currentPassword);
      if (!match) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }
    }

    user.password = newPassword; // re-hashed by the pre-save hook in model/user.js
    await user.save();

    res.json({ message: "Password updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;