const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS, roleLabel } = require("../utils/permissions");
const User = require("../model/user");

const router = express.Router();
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function sessionKey(sid) {
  return crypto.createHash("sha256").update(String(sid)).digest("hex").slice(0, 12);
}

function readSessionDocs() {
  const connection = mongoose.connection;
  const db = connection.db || (typeof connection.getClient === "function" ? connection.getClient()?.db() : null);
  if (!db) throw new Error("Database connection is not ready.");
  return db.collection("sessions")
    .find({ $or: [{ expires: { $exists: false } }, { expires: { $gt: new Date() } }] })
    .toArray();
}

router.get("/", requirePermission(PERMISSIONS.ADMIN_MANAGE), async (req, res) => {
  try {
    const docs = await readSessionDocs();
    const currentKey = sessionKey(req.sessionID);
    const rows = docs.map((doc) => {
      let data = doc.session;
      try {
        if (typeof data === "string") data = JSON.parse(data);
      } catch {
        data = null;
      }
      if (!data || !data.userId) return null;
      const maxAge = Number(data.cookie && data.cookie.originalMaxAge) || 0;
      const expires = data.cookie && data.cookie.expires ? new Date(data.cookie.expires).getTime() : NaN;
      const lastSeen = maxAge && Number.isFinite(expires) ? expires - maxAge : null;
      return {
        key: sessionKey(doc._id),
        current: sessionKey(doc._id) === currentKey,
        userId: String(data.userId),
        startedAt: data.startedAt || null,
        lastSeen,
      };
    }).filter(Boolean);

    const users = rows.length
      ? await User.find({ _id: { $in: rows.map((row) => row.userId) } })
        .select("firstName lastName email role isActive")
        .lean()
      : [];
    const byId = new Map(users.map((user) => [String(user._id), user]));
    const now = Date.now();

    const entries = rows.map((row) => {
      const user = byId.get(row.userId);
      const name = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "Signed-out account";
      return {
        key: row.key,
        current: row.current,
        name,
        email: user ? user.email || "" : "",
        role: user ? roleLabel(user.role) : "—",
        accountActive: user ? !!user.isActive : false,
        signedInAt: row.startedAt,
        lastSeen: row.lastSeen,
        online: row.lastSeen ? now - row.lastSeen <= ONLINE_WINDOW_MS : false,
      };
    }).sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen || 0) - (a.lastSeen || 0));

    res.json({
      entries,
      total: entries.length,
      online: entries.filter((entry) => entry.online).length,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
