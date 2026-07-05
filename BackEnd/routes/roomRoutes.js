const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const Category = require("../model/category");
const upload = require("../middleware/upload");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

function parseFeatures(features) {
  if (Array.isArray(features)) return features;
  if (!features) return [];
  if (typeof features === "string") {
    try {
      const parsed = JSON.parse(features);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    return features.split(",").map(f => f.trim()).filter(Boolean);
  }
  return [];
}

// Resolves a category id from the request body into { category, categoryName }
// ready to spread into a Room doc. Treats "", "null", and undefined as "clear
// the category" rather than an error, since the facility form's dropdown can
// legitimately be left on "No category". Throws only for a genuinely bad id.
async function resolveCategory(categoryId) {
  if (categoryId === undefined) return undefined; // caller should skip the field entirely
  if (!categoryId || categoryId === "null" || categoryId === "undefined") {
    return { category: null, categoryName: "" };
  }
  const category = await Category.findById(categoryId);
  if (!category) {
    const err = new Error("Selected category does not exist.");
    err.status = 400;
    throw err;
  }
  return { category: category._id, categoryName: category.name };
}

function parseVariants(variants) {
  if (Array.isArray(variants)) return variants;
  if (!variants) return [];
  try {
    const parsed = JSON.parse(variants);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(v => ({
        label: String(v.label || "").trim(),
        price: Number(v.price) || 0,
        pax: String(v.pax || "").trim()
      }))
      .filter(v => v.label !== "" || v.price > 0);
  } catch (_) {
    return [];
  }
}

// Public — guests need to see rooms to book them
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    // "uncategorized" is a magic value the admin UI uses to filter for rooms
    // that predate Tier 4 and haven't been assigned a category yet.
    if (req.query.category === "uncategorized") {
      filter.category = null;
    } else if (req.query.category) {
      filter.category = req.query.category;
    }
    const rooms = await Room.find(filter).sort({ name: 1 }).populate("category");
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate("category");
    if (!room) return res.status(404).json({ message: "Room not found." });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid room id." });
  }
});

// Everything below changes room data — manager/super_admin only
router.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), upload.single("image"), async (req, res) => {
  try {
    const { name, roomNumber, description, price, status, features, variants, category, capacity } = req.body;

    if (!name || !roomNumber) {
      return res.status(400).json({ message: "name and roomNumber are required." });
    }

    const categoryFields = await resolveCategory(category); // { category, categoryName } | undefined

    const room = new Room({
      name,
      roomNumber,
      description: description || "",
      price: Number(price) || 0,
      status: status || "Available",
      features: parseFeatures(features),
      variants: parseVariants(variants),
      capacity: Number(capacity) || 0,
      image: req.file ? req.file.path : (req.body.image || ""),
      ...(categoryFields || { category: null, categoryName: "" })
    });

    await room.save();
    await room.populate("category");
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), upload.single("image"), async (req, res) => {
  try {
    const { name, roomNumber, description, price, status, features, variants, category, capacity } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (roomNumber !== undefined) update.roomNumber = roomNumber;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = Number(price) || 0;
    if (status !== undefined) update.status = status;
    if (features !== undefined) update.features = parseFeatures(features);
    if (variants !== undefined) update.variants = parseVariants(variants);
    if (capacity !== undefined) update.capacity = Number(capacity) || 0;
    if (req.file) update.image = req.file.path;

    if (category !== undefined) {
      const categoryFields = await resolveCategory(category); // { category, categoryName }
      Object.assign(update, categoryFields);
    }

    const room = await Room.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
      .populate("category");
    if (!room) return res.status(404).json({ message: "Room not found." });

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

router.delete("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found." });
    res.json({ message: "Room deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;