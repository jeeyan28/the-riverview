const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const upload = require("../middleware/upload");

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

router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, roomNumber, description, price, status, features, variants } = req.body;

    if (!name || !roomNumber) {
      return res.status(400).json({ message: "name and roomNumber are required." });
    }
    const room = new Room({
      name,
      roomNumber,
      description: description || "",
      price: Number(price) || 0,
      status: status || "Available",
      features: parseFeatures(features),
      variants: parseVariants(variants),
      image: req.file ? req.file.path : (req.body.image || "")
    });

    await room.save();
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error." });
  }
});

router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { name, roomNumber, description, price, status, features, variants } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (roomNumber !== undefined) update.roomNumber = roomNumber;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = Number(price) || 0;
    if (status !== undefined) update.status = status;
    if (features !== undefined) update.features = parseFeatures(features);
    if (variants !== undefined) update.variants = parseVariants(variants);
    if (req.file) update.image = req.file.path;

    const room = await Room.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!room) return res.status(404).json({ message: "Room not found." });

    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error." });
  }
});

router.delete("/:id", async (req, res) => {
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