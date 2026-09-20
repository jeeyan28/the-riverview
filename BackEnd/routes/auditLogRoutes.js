const express = require("express");
const router = express.Router();
const AuditLog = require("../model/auditLog");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

const PAGE_SIZE = 10;

router.get("/", requirePermission(PERMISSIONS.SETTINGS_VIEW), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const [logs, total] = await Promise.all([
      AuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
      AuditLog.countDocuments(),
    ]);
    res.json({ logs, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
