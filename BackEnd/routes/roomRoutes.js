const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const upload = require("../middleware/upload");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");


// Public — guests need to see rooms to book them
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const rooms = await Room.find(filter).sort({ name: 1 });
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

// Everything below changes room data — manager/super_admin only
router.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      roomNumber,
      description,
      price,
      status,
      features,
      variants,
      capacity,
    } = req.body;

    if (!name || !roomNumber) {
      return res.status(400).json({
        message: "name and roomNumber are required."
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

    const room = new Room({
      name,
      roomNumber,

      description: description || "",

      price: Number(price) || 0,

      status: status || "Available",

      capacity: Number(capacity) || 0,

      features: parsedFeatures,
      variants: parsedVariants,

      image: req.file ? req.file.path : (req.body.image || ""),
    });

    await room.save();
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      status,
      features,
      variants,
      capacity,
    } = req.body;

    // Room No. is locked after creation (FEATURE_REQUESTS.md Priority 1) —
    // silently ignored here even if sent.
    const update = {};
    if (name !== undefined) update.name = name;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = Number(price) || 0;
    if (status !== undefined) update.status = status;
    if (capacity !== undefined) update.capacity = Number(capacity) || 0;
    if (req.file) update.image = req.file.path;

    // features/variants arrive as JSON strings inside FormData — see the
    // same note in POST / above.
    try {
      if (features !== undefined) update.features = JSON.parse(features);
      if (variants !== undefined) update.variants = JSON.parse(variants);
    } catch {
      return res.status(400).json({ message: "features/variants must be valid JSON." });
    }

    const room = await Room.findByIdAndUpdate(req.params.id, update, { returnDocument: "after", runValidators: true });
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