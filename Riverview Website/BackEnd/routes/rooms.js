const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const upload = require("../middleware/upload");

function parseFeatures(features) {
  if (Array.isArray(features)) return features;
  if (!features) return [];
  return String(features).split(",").map(f => f.trim()).filter(Boolean);
}

router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.status) filter.status = req.query.status;

    const rooms = await Room.find(filter).sort({ category: 1, price: 1 });
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
    const { name, category, roomNumber, capacity, description, price, status, features } = req.body;

    if (!name || !category || !roomNumber || !capacity || price === undefined) {
      return res.status(400).json({ message: "name, category, roomNumber, capacity and price are required." });
    }

    const room = new Room({
      name,
      category,
      roomNumber,
      capacity,
      description: description || "",
      price: Number(price),
      status: status || "Available",
      features: parseFeatures(features),
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
    const { name, category, roomNumber, capacity, description, price, status, features } = req.body;

    const update = {};
    if (name !== undefined) update.name = name;
    if (category !== undefined) update.category = category;
    if (roomNumber !== undefined) update.roomNumber = roomNumber;
    if (capacity !== undefined) update.capacity = capacity;
    if (description !== undefined) update.description = description;
    if (price !== undefined) update.price = Number(price);
    if (status !== undefined) update.status = status;
    if (features !== undefined) update.features = parseFeatures(features);
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