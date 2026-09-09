const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const upload = require("../middleware/upload");
const { requirePermission } = require("../middleware/adminAuth");
const { validate } = require("../middleware/validate");
const { PERMISSIONS } = require("../utils/permissions");
const { SERVICE_NAMES, canonicalServiceName, escapeRegExp } = require("../utils/roomCatalog");
const { roomIdParamsSchema, emptyBodySchema, roomWriteSchema } = require("../validation/roomSchemas");
const { logAudit } = require("../utils/auditLog");
const { syncRoomInventory, deactivateRoomInventory } = require("../utils/syncRoomInventory");

const roomUploads = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "variantImages", maxCount: 20 },
]);

function parseJsonField(value, fallback, label) {
  if (value === undefined || value === null || value === "") return fallback;
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw { status: 400, message: `${label} must be a valid JSON array.` };
  }
}

function parseRoomBody(req, res, next) {
  try {
    const canonicalName = canonicalServiceName(req.body.name);
    req.body = {
      ...req.body,
      name: canonicalName || req.body.name,
      features: parseJsonField(req.body.features, [], "features"),
      variants: parseJsonField(req.body.variants, [], "variants"),
      variantImageIndexes: parseJsonField(req.body.variantImageIndexes, [], "variantImageIndexes"),
    };
    next();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || "Invalid room data." });
  }
}

function attachUploadedImages(req) {
  const variants = req.body.variants.map((variant) => ({ ...variant }));
  const files = req.files?.variantImages || [];
  const indexes = req.body.variantImageIndexes || [];

  if (files.length !== indexes.length) {
    throw { status: 400, message: "Each uploaded room image must have a matching room index." };
  }
  indexes.forEach((variantIndex, fileIndex) => {
    if (!variants[variantIndex]) {
      throw { status: 400, message: "A room image references a room that does not exist." };
    }
    variants[variantIndex].image = files[fileIndex].path;
  });

  return {
    name: req.body.name,
    description: req.body.description,
    price: req.body.price,
    capacity: req.body.capacity,
    features: req.body.features,
    variants,
    ...(req.files?.image?.[0] ? { image: req.files.image[0].path } : {}),
  };
}

async function findDuplicateService(name, excludingId) {
  return Room.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, "i"),
    ...(excludingId ? { _id: { $ne: excludingId } } : {}),
  }).select("_id name");
}

router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find({ name: { $in: SERVICE_NAMES } }).sort({ name: 1 });
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/admin", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const rooms = await Room.find().sort({ name: 1 });
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", validate(roomIdParamsSchema, "params"), async (req, res) => {
  try {
    const room = await Room.findOne({ _id: req.params.id, name: { $in: SERVICE_NAMES } });
    if (!room) return res.status(404).json({ message: "Facility not found." });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid facility id." });
  }
});

router.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), roomUploads, parseRoomBody, validate(roomWriteSchema), async (req, res) => {
  try {
    const duplicate = await findDuplicateService(req.body.name);
    if (duplicate) return res.status(409).json({ message: `${duplicate.name} already exists. Edit that facility instead.` });

    const room = new Room(attachUploadedImages(req));
    await room.save();
    await syncRoomInventory(room);
    await logAudit({ category: "Room Management", action: "created", description: `added facility "${room.name}"`, user: req.user });
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), roomUploads, parseRoomBody, validate(roomIdParamsSchema, "params"), validate(roomWriteSchema), async (req, res) => {
  try {
    const duplicate = await findDuplicateService(req.body.name, req.params.id);
    if (duplicate) return res.status(409).json({ message: `${duplicate.name} already exists. Edit that facility instead.` });

    const existing = await Room.findById(req.params.id).select("image name");
    if (!existing) return res.status(404).json({ message: "Facility not found." });

    const update = attachUploadedImages(req);
    if (!update.image) update.image = existing.image || "";
    const room = await Room.findByIdAndUpdate(req.params.id, update, { returnDocument: "after", runValidators: true });
    await syncRoomInventory(room, existing.name);
    await logAudit({ category: "Room Management", action: "updated", description: `updated facility "${room.name}"`, user: req.user });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ message: err.message || "Server error." });
  }
});

router.delete("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), validate(roomIdParamsSchema, "params"), validate(emptyBodySchema), async (req, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);
    if (!room) return res.status(404).json({ message: "Facility not found." });
    await deactivateRoomInventory(room.name);
    await logAudit({ category: "Room Management", action: "deleted", description: `deleted facility "${room.name}"`, user: req.user });
    res.json({ message: "Facility deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
