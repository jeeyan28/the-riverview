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
  assignableRoleChanges,
} = require("../utils/permissions");
const { normalizeName, validateName } = require("../utils/nameValidation");
const { isPasswordStrongEnough, PASSWORD_POLICY_MESSAGE } = require("../utils/passwordPolicy");
const { logAudit } = require("../utils/auditLog");

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

router.get("/", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = String(req.query.role);
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).limit(500);
    const shaped = users.map((u) => ({
      ...shapeUser(u),
      canManage: canManageTarget({ actor: req.user, target: u }).ok,
    }));

    res.json({
      users: shaped,
      assignableRoles: assignableRoles(req.user.role),
      assignableRoleChanges: assignableRoleChanges(req.user.role),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

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
    if (!isPasswordStrongEnough(password)) {
      return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
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

    await logAudit({ category: "Manage Users", action: "created", description: `created user account for ${user.firstName} ${user.lastName} (${roleLabel(user.role)})`, user: req.user });
    res.status(201).json({ user: shapeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

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
    await logAudit({ category: "Manage Users", action: "updated", description: `changed ${target.firstName} ${target.lastName}'s role to ${roleLabel(role)}`, user: req.user });
    res.json({ user: shapeUser(target) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/:id/status", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const { isActive } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });

    const manageCheck = canManageTarget({ actor: req.user, target });
    if (!manageCheck.ok) return res.status(403).json({ message: manageCheck.message });

    target.isActive = !!isActive;
    await target.save();
    await logAudit({ category: "Manage Users", action: "updated", description: `${target.isActive ? "activated" : "deactivated"} user ${target.firstName} ${target.lastName}`, user: req.user });
    res.json({ user: shapeUser(target) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/:id", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });

    const manageCheck = canManageTarget({ actor: req.user, target });
    if (!manageCheck.ok) return res.status(403).json({ message: manageCheck.message });

    await User.findByIdAndDelete(req.params.id);
    await logAudit({ category: "Manage Users", action: "deleted", description: `deleted user account for ${target.firstName} ${target.lastName}`, user: req.user });
    res.json({ message: "User deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found." });

    if (!canEditTarget(req, target)) {
      return res.status(403).json({ message: "You don't have permission to edit this account." });
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

router.put("/:id/password", ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!canEditTarget(req, user)) {
      return res.status(403).json({ message: "You don't have permission to change this account's password." });
    }

    const { currentPassword, newPassword } = req.body;
    if (!isPasswordStrongEnough(newPassword)) {
      return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE });
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

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;