const express = require("express");
const router = express.Router();
const AuditLog = require("../model/auditLog");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

const PAGE_SIZE = 10;
const AUDIT_FILTERS = {
  cancellations: { category: "Booking", description: /cancel|refund/i },
  roles: { category: "Manage Users", description: /changed .*role/i },
  reschedules: { category: "Booking", description: /reschedul/i },
  payments: { category: "Booking", description: /recorded payment|paid booking/i },
};

router.get("/", requirePermission(PERMISSIONS.SETTINGS_VIEW), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const filterName = String(req.query.filter || "all");
    if (filterName !== "all" && filterName !== "other" && !AUDIT_FILTERS[filterName]) return res.status(400).json({ message: "Invalid audit filter." });
    const filter = filterName === "all" ? {} : filterName === "other" ? { $nor: Object.values(AUDIT_FILTERS) } : AUDIT_FILTERS[filterName];
    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ logs, page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
