const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ["Announcement", "Room Management", "Manage Users"],
    required: true,
  },
  action: { type: String, enum: ["created", "updated", "deleted"], required: true },
  description: { type: String, required: true, trim: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  performedByName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);