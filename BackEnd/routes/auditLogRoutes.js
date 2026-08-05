const express = require("express");
const router = express.Router();
const AuditLog = require("../model/auditLog");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

router.get("/", requirePermission(PERMISSIONS.SETTINGS_VIEW), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit);
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;