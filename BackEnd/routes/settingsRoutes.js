const express = require("express");
const router = express.Router();
const Settings = require("../model/settings");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");
const { paymentMethodQrUpload } = require("../middleware/upload");

// ── Public — the homepage needs this with NO login to show the operating
//    hours banner, block holiday dates on the booking calendar, and render
//    any active announcements. Never expose `updatedBy` or full history here.
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
        .map(a => ({ _id: a._id, title: a.title, message: a.message, emoji: a.emoji })),
      // Only active methods, and only what the booking page's payment step
      // needs to render a button + QR — never expose timestamps/history here.
      paymentMethods: settings.paymentMethods
        .filter(pm => pm.isActive)
        .map(pm => ({ _id: pm._id, name: pm.name, qrImage: pm.qrImage })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Full settings document (includes inactive/expired announcements) —
//    admin only, used by the Settings > Promotion/Announcements admin UI.
router.get("/admin", requirePermission(PERMISSIONS.SETTINGS_VIEW), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Update operating hours — manager/super_admin only
router.put("/operating-hours", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const { openTime, closeTime, openDays, maxAdvanceDays, bookingCutoffHours } = req.body;
    const settings = await Settings.getSingleton();

    if (openTime !== undefined) settings.operatingHours.openTime = openTime;
    if (closeTime !== undefined) settings.operatingHours.closeTime = closeTime;
    if (Array.isArray(openDays)) {
      settings.operatingHours.openDays = openDays
        .map(Number)
        .filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    }
    if (maxAdvanceDays !== undefined) settings.operatingHours.maxAdvanceDays = Number(maxAdvanceDays) || 30;
    if (bookingCutoffHours !== undefined) settings.operatingHours.bookingCutoffHours = Number(bookingCutoffHours) || 0;

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();

    res.json(settings.operatingHours);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Add a holiday / closure date — manager/super_admin only
router.post("/holidays", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const { name, date, fullDay, note } = req.body;
    if (!name || !date) {
      return res.status(400).json({ message: "name and date are required." });
    }
    const settings = await Settings.getSingleton();
    settings.holidays.push({ name, date, fullDay: fullDay !== false, note: note || "" });
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    res.status(201).json(settings.holidays[settings.holidays.length - 1]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Delete a holiday / closure date — manager/super_admin only
router.delete("/holidays/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const before = settings.holidays.length;
    settings.holidays = settings.holidays.filter(h => String(h._id) !== req.params.id);
    if (settings.holidays.length === before) {
      return res.status(404).json({ message: "Holiday not found." });
    }
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ message: "Holiday removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Create an announcement — manager/super_admin only
router.post("/announcements", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const { title, message, emoji, isActive, expiresAt } = req.body;
    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required." });
    }
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
    res.status(201).json(settings.announcements[settings.announcements.length - 1]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Update an announcement (e.g. toggle isActive) — manager/super_admin only
router.put("/announcements/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
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
    res.json(ann);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Delete an announcement — manager/super_admin only
router.delete("/announcements/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const before = settings.announcements.length;
    settings.announcements = settings.announcements.filter(a => String(a._id) !== req.params.id);
    if (settings.announcements.length === before) {
      return res.status(404).json({ message: "Announcement not found." });
    }
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ message: "Announcement removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Add a payment method (e.g. "GCash", "Maya", or any wallet the business
//    adds) — manager/super_admin only. QR image is optional at create time
//    (an admin can add the button first, upload the QR right after) but a
//    method with no qrImage simply won't have a scannable code on the
//    booking page yet.
router.post("/payment-methods", requirePermission(PERMISSIONS.SETTINGS_MANAGE), paymentMethodQrUpload.single("qrImage"), async (req, res) => {
  try {
    const { name, isActive } = req.body;
    if (!name) {
      return res.status(400).json({ message: "name is required." });
    }
    const settings = await Settings.getSingleton();
    settings.paymentMethods.push({
      name,
      qrImage: req.file ? req.file.path : "",
      isActive: isActive !== undefined ? isActive === "true" || isActive === true : true,
    });
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    res.status(201).json(settings.paymentMethods[settings.paymentMethods.length - 1]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Update a payment method — rename it, replace its QR image, or flip
//    isActive to show/hide its button on the live booking page (e.g. mark
//    it unavailable while a wallet is down, then flip it back on later).
//    manager/super_admin only.
router.put("/payment-methods/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), paymentMethodQrUpload.single("qrImage"), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const pm = settings.paymentMethods.id(req.params.id);
    if (!pm) return res.status(404).json({ message: "Payment method not found." });

    const { name, isActive } = req.body;
    if (name !== undefined) pm.name = name;
    if (isActive !== undefined) pm.isActive = isActive === "true" || isActive === true;
    if (req.file) pm.qrImage = req.file.path;

    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    res.json(pm);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Delete a payment method — manager/super_admin only
router.delete("/payment-methods/:id", requirePermission(PERMISSIONS.SETTINGS_MANAGE), async (req, res) => {
  try {
    const settings = await Settings.getSingleton();
    const before = settings.paymentMethods.length;
    settings.paymentMethods = settings.paymentMethods.filter(pm => String(pm._id) !== req.params.id);
    if (settings.paymentMethods.length === before) {
      return res.status(404).json({ message: "Payment method not found." });
    }
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ message: "Payment method removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
