const express = require("express");
const router = express.Router();

const User = require("../model/user");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { hasPermission, PERMISSIONS, isAdminRole } = require("../utils/permissions");

// Anyone may edit their own profile; editing someone else's requires the
// admin:manage permission (super_admin, per ROLE_PERMISSIONS).
function canEditTarget(req, targetId) {
  if (req.session.userId === targetId) return true;
  return isAdminRole(req.user.role) && hasPermission(req.user, PERMISSIONS.ADMIN_MANAGE);
}

// ── Update profile details (firstname/lastname/phone)
router.put("/:id", ensureAuthenticated, async (req, res) => {
  try {
    if (!canEditTarget(req, req.params.id)) {
      return res.status(403).json({ message: "You can only edit your own profile." });
    }

    const { firstname, lastname, phone } = req.body;
    const update = {};
    if (firstname !== undefined) update.firstname = firstname;
    if (lastname !== undefined) update.lastname = lastname;
    if (phone !== undefined) update.phone = phone;

    const user = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!user) return res.status(404).json({ message: "User not found." });

    res.json({
      _id: user._id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      phone: user.phone,
      role: user.role,
    });
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
    if (!canEditTarget(req, req.params.id)) {
      return res.status(403).json({ message: "You can only change your own password." });
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "New password must be at least 8 characters." });
    }

    const user = await User.findById(req.params.id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found." });

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