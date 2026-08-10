const express = require("express");
const router = express.Router();
const Settings = require("../model/settings");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");
const { paymentMethodQrUpload } = require("../middleware/upload");
const { logAudit } = require("../utils/auditLog");
const { validate } = require("../middleware/validate");
const {
  operatingHoursSchema,
  createHolidaySchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
} = require("../validation/settingsSchemas");

router.get("/", async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const now = new Date();

    res.json({
      operatingHours: settings.operatingHours,
      holidays: settings.holidays.map(h => ({
        _id: h._id, name: h.name, date: h.date, fullDay: h.fullDay, note: h.note
      })),
      announcements: settings.announcements
        .filter(a => a.isActive && (!a.expiresAt || a.expiresAt > now))
        .map(a => ({ _id: a._id, title: a.title, message: a.message, emoji: a.emoji, createdAt: a.createdAt })),
      paymentMethods: settings.paymentMethods
        .filter(pm => pm.isActive)
        .map(pm => ({ _id: pm._id, name: pm.name, qrImage: pm.qrImage })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/admin", requirePermission(PERMISSIONS.SETTINGS_VIEW), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/operating-hours", requirePermission(PERMISSIONS.SETTINGS_MANAGE), validate(operatingHoursSchema), async (req, res) => {
  try {
    const { openTime, closeTime, openDays, minOnlineDurationHours, maxOnlineDurationHours } = req.body;
    const settings = await Settings.getSingleton();

    if (openTime !== undefined) settings.operatingHours.openTime = openTime;
    if (closeTime !== undefined) settings.operatingHours.closeTime = closeTime;
    if (openDays !== undefined) settings.operatingHours.openDays = openDays;
    if (minOnlineDurationHours !== undefined) settings.operatingHours.minOnlineDurationHours = minOnlineDurationHours;
    if (maxOnlineDurationHours !== undefined) settings.operatingHours.maxOnlineDurationHours = maxOnlineDurationHours;

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();

    await logAudit({ category: "Settings", action: "updated", description: "updated operating hours", user: req.user });
    res.json(settings.operatingHours);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/holidays", requirePermission(PERMISSIONS.SETTINGS_MANAGE), validate(createHolidaySchema), async (req, res) => {
  try {
    const { name, date, fullDay, note } = req.body;
    const settings = await Settings.getSingleton();
    settings.holidays.push({ name, date, fullDay: fullDay !== false, note: note || "" });
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    const created = settings.holidays[settings.holidays.length - 1];
    await logAudit({ category: "Settings", action: "created", description: `added holiday "${created.name}" (${created.date})`, user: req.user });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/holidays/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const target = settings.holidays.find(h => String(h._id) === req.params.id);
    if (!target) {
      return res.status(404).json({ message: "Holiday not found." });
    }
    settings.holidays = settings.holidays.filter(h => String(h._id) !== req.params.id);
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    await logAudit({ category: "Settings", action: "deleted", description: `removed holiday "${target.name}" (${target.date})`, user: req.user });
    res.json({ message: "Holiday removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/announcements", requirePermission(PERMISSIONS.SETTINGS_MANAGE), validate(createAnnouncementSchema), async (req, res) => {
  try {
    const { title, message, emoji, isActive, expiresAt } = req.body;
    const settings = await Settings.getSingleton();
    settings.announcements.push({
      title, message,
      emoji: emoji || "📣",
      isActive: isActive !== false,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    const created = settings.announcements[settings.announcements.length - 1];
    await logAudit({ category: "Announcement", action: "created", description: `posted announcement "${created.title}"`, user: req.user });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/announcements/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), validate(updateAnnouncementSchema), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const ann = settings.announcements.id(req.params.id);
    if (!ann) return res.status(404).json({ message: "Announcement not found." });

    const { title, message, emoji, isActive, expiresAt } = req.body;
    if (title !== undefined) ann.title = title;
    if (message !== undefined) ann.message = message;
    if (emoji !== undefined) ann.emoji = emoji;
    if (isActive !== undefined) ann.isActive = !!isActive;
    if (expiresAt !== undefined) ann.expiresAt = expiresAt ? new Date(expiresAt) : null;

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    await logAudit({ category: "Announcement", action: "updated", description: `updated announcement "${ann.title}"`, user: req.user });
    res.json(ann);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/announcements/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const target = settings.announcements.id(req.params.id);
    if (!target) return res.status(404).json({ message: "Announcement not found." });
    const removedTitle = target.title;
    settings.announcements = settings.announcements.filter(a => String(a._id) !== req.params.id);
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    await logAudit({ category: "Announcement", action: "deleted", description: `removed announcement "${removedTitle}"`, user: req.user });
    res.json({ message: "Announcement removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/payment-methods", requirePermission(PERMISSIONS.SETTINGS_MANAGE), paymentMethodQrUpload.single("qrImage"), validate(createPaymentMethodSchema), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const settings = await Settings.getSingleton();
    settings.paymentMethods.push({
      name,
      qrImage: req.file ? req.file.path : "",
      isActive: isActive !== undefined ? isActive : true,
    });
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    const created = settings.paymentMethods[settings.paymentMethods.length - 1];
    await logAudit({ category: "Settings", action: "created", description: `added payment method "${created.name}"`, user: req.user });
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.put("/payment-methods/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), paymentMethodQrUpload.single("qrImage"), validate(updatePaymentMethodSchema), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const pm = settings.paymentMethods.id(req.params.id);
    if (!pm) return res.status(404).json({ message: "Payment method not found." });

    const { name, isActive } = req.body;
    if (name !== undefined) pm.name = name;
    if (isActive !== undefined) pm.isActive = isActive;
    if (req.file) pm.qrImage = req.file.path;

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    await logAudit({ category: "Settings", action: "updated", description: `updated payment method "${pm.name}"`, user: req.user });
    res.json(pm);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.delete("/payment-methods/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const target = settings.paymentMethods.find(pm => String(pm._id) === req.params.id);
    if (!target) {
      return res.status(404).json({ message: "Payment method not found." });
    }
    settings.paymentMethods = settings.paymentMethods.filter(pm => String(pm._id) !== req.params.id);
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    await logAudit({ category: "Settings", action: "deleted", description: `removed payment method "${target.name}"`, user: req.user });
    res.json({ message: "Payment method removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;