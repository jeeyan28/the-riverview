const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const upload = require("../middleware/upload");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");
const { logAudit } = require("../utils/auditLog");


router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find().sort({ name: 1 });
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found." });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid room id." });
  }
});

router.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), upload.fields([{ name: "image", maxCount: 1 }, { name: "variantImages", maxCount: 20 }]), async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      features,
      variants,
      capacity,
      variantImageIndexes,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "name is required."
      });
    }

    let parsedFeatures = [];
    let parsedVariants = [];
    try {
      if (features) parsedFeatures = JSON.parse(features);
      if (variants) parsedVariants = JSON.parse(variants);
    } catch {
      return res.status(400).json({ message: "features/variants must be valid JSON." });
    }

    const variantImageFiles = req.files?.variantImages || [];
    if (variantImageFiles.length) {
      let indexes = [];
      try {
        indexes = variantImageIndexes ? JSON.parse(variantImageIndexes) : [];
      } catch {
        return res.status(400).json({ message: "variantImageIndexes must be valid JSON." });
      }
      indexes.forEach((variantIndex, i) => {
        if (parsedVariants[variantIndex] && variantImageFiles[i]) {
          parsedVariants[variantIndex].image = variantImageFiles[i].path;
        }
      });
    }

    const room = new Room({
      name,

      description: description || "",

      price: Number(price) || 0,

      capacity: Number(capacity) || 0,

      features: parsedFeatures,
      variants: parsedVariants,

      image: req.files?.image?.[0] ? req.files.image[0].path : (req.body.image || ""),
    });

    await room.save();
    await logAudit({ category: "Room Management", action: "created", description: `added room "${room.name}"`, user: req.user });
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), upload.fields([{ name: "image", maxCount: 1 }, { name: "variantImages", maxCount: 20 }]), async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      features,
      variants,
      capacity,
      variantImageIndexes,
    } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = Number(price) || 0;
    if (capacity !== undefined) update.capacity = Number(capacity) || 0;
    if (req.files?.image?.[0]) update.image = req.files.image[0].path;

    try {
      if (features !== undefined) update.features = JSON.parse(features);
      if (variants !== undefined) update.variants = JSON.parse(variants);
    } catch {
      return res.status(400).json({ message: "features/variants must be valid JSON." });
    }

    const variantImageFiles = req.files?.variantImages || [];
    if (variantImageFiles.length && update.variants) {
      let indexes = [];
      try {
        indexes = variantImageIndexes ? JSON.parse(variantImageIndexes) : [];
      } catch {
        return res.status(400).json({ message: "variantImageIndexes must be valid JSON." });
      }
      indexes.forEach((variantIndex, i) => {
        if (update.variants[variantIndex] && variantImageFiles[i]) {
          update.variants[variantIndex].image = variantImageFiles[i].path;
        }
      });
    }

    const room = await Room.findByIdAndUpdate(req.params.id, update, { returnDocument: "after", runValidators: true });
    if (!room) return res.status(404).json({ message: "Room not found." });

    await logAudit({ category: "Room Management", action: "updated", description: `updated room "${room.name}"`, user: req.user });
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
    await logAudit({ category: "Room Management", action: "deleted", description: `deleted room "${room.name}"`, user: req.user });
    res.json({ message: "Room deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;