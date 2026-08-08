const express = require("express");
const router = express.Router();

const LoginHistory = require("../model/loginHistory");
const { requireRole } = require("../middleware/adminAuth");

const PAGE_SIZE = 25;

function shape(entry) {
  return {
    _id: entry._id,
    name: entry.name || "—",
    email: entry.email,
    role: entry.role,
    method: entry.method,
    status: entry.status,
    reason: entry.reason,
    ip: entry.ip,
    userAgent: entry.userAgent,
    createdAt: entry.createdAt,
  };
}

// ── List login history, split by tab (mirrors AdminSidebar's manager/
// super_admin-only gating for this page). Query params:
//   ?tab=users|admin   (default "users") — "admin" = staff/manager/super_admin roles
//   ?search=text       matches name/email
//   ?status=success|failed
//   ?page=1
router.get("/", requireRole("manager", "super_admin"), async (req, res) => {
  try {
    const tab = req.query.tab === "admin" ? "admin" : "users";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const filter = {
      role: tab === "admin" ? { $in: ["staff", "manager", "super_admin"] } : "user",
    };
    if (req.query.status === "success" || req.query.status === "failed") {
      filter.status = req.query.status;
    }
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }];
    }

    const [entries, total] = await Promise.all([
      LoginHistory.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE),
      LoginHistory.countDocuments(filter),
    ]);

    res.json({
      entries: entries.map(shape),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;