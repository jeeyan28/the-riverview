const AuditLog = require("../model/auditLog");

async function logAudit({ category, action, description, user }) {
  try {
    await AuditLog.create({
      category,
      action,
      description,
      performedBy: user._id,
      performedByName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
    });
  } catch (err) {
    console.error("Audit log failed:", err);
  }
}

module.exports = { logAudit };