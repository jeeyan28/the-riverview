const mongoose = require("mongoose");

// One document per login attempt (password or Google). Snapshots
// name/email/role at the time of login — not just a ref — so history stays
// accurate even after a later role change, name edit, or account deletion.
const loginHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // null if email didn't match any account
  name: { type: String, default: "" },
  email: { type: String, required: true, lowercase: true },
  role: { type: String, default: "user" }, // snapshot; drives the Users/Admin tab split
  method: { type: String, enum: ["password", "google"], default: "password" },
  status: { type: String, enum: ["success", "failed"], required: true },
  // Short reason shown in the Admin tab for failed attempts, e.g. "Wrong password", "Account locked".
  reason: { type: String, default: "" },
  ip: { type: String, default: "" },
  userAgent: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

loginHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model("LoginHistory", loginHistorySchema);