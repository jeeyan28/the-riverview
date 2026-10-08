const express = require("express");
const router = express.Router();
const Notification = require("../model/notification");
const { linkUnassignedReservationNotifications } = require("../utils/reservationNotifications");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { validate } = require("../middleware/validate");
const { bookingIdParamsSchema, emptyBodySchema } = require("../validation/bookingSchemas");

router.use(ensureAuthenticated);
router.get("/", async (req, res) => {
  await linkUnassignedReservationNotifications(req.user);
  const filter = { user: req.user._id, type: { $in: Notification.schema.path('type').enumValues } };
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(50).select("type title message booking reservationCode readAt createdAt").lean(),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);
  res.json({ items, unreadCount });
});
router.post("/read-all", validate(emptyBodySchema), async (req, res) => {
  await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true });
});
router.post("/:id/read", validate(bookingIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  const result = await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } });
  if (!result.matchedCount) return res.status(404).json({ message: "Notification not found." });
  res.json({ id: req.params.id });
});
module.exports = router;
