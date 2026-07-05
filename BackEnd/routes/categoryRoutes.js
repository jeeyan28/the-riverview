const express = require("express");
const router = express.Router();
const Category = require("../model/category");
const Room = require("../model/room");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

// Public — the facility form's category dropdown, and any guest-facing
// category filters, need to read this list without being logged in.
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.activeOnly === "true") filter.isActive = true;
    const categories = await Category.find(filter).sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found." });
    res.json(category);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Invalid category id." });
  }
});

// Everything below changes category data — manager/super_admin only,
// same permission gate as room management.
router.post("/", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { name, description, sortOrder, isActive } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "name is required." });
    }

    const existing = await Category.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ message: "A category with that name already exists." });
    }

    const category = new Category({
      name: name.trim(),
      description: description || "",
      sortOrder: Number(sortOrder) || 0,
      isActive: isActive !== undefined ? Boolean(isActive) && isActive !== "false" : true
    });

    await category.save();
    res.status(201).json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error." });
  }
});

router.put("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const { name, description, sortOrder, isActive } = req.body;

    const update = {};
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: "name cannot be empty." });
      const dupe = await Category.findOne({ name: name.trim(), _id: { $ne: req.params.id } });
      if (dupe) return res.status(409).json({ message: "A category with that name already exists." });
      update.name = name.trim();
    }
    if (description !== undefined) update.description = description;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;
    if (isActive !== undefined) update.isActive = Boolean(isActive) && isActive !== "false";

    const category = await Category.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ message: "Category not found." });

    // Keep every room's denormalized snapshot in sync so listings never show
    // a stale category name after a rename. This never touches which
    // category a room belongs to — only the display copy of its name.
    if (update.name) {
      await Room.updateMany({ category: category._id }, { $set: { categoryName: category.name } });
    }

    res.json(category);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || "Server error." });
  }
});

// Deleting a category never silently orphans or deletes the rooms in it.
// If rooms still reference this category, the caller must pass
// ?reassignTo=<categoryId> to move them somewhere else first — the delete
// is refused otherwise.
router.delete("/:id", requirePermission(PERMISSIONS.ROOM_MANAGE), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found." });

    const roomCount = await Room.countDocuments({ category: category._id });

    if (roomCount > 0) {
      const { reassignTo } = req.query;
      if (!reassignTo) {
        return res.status(409).json({
          message: `${roomCount} room(s) still use this category. Pass ?reassignTo=<categoryId> to move them first, or reassign them manually before deleting.`,
          roomCount
        });
      }
      if (reassignTo === String(category._id)) {
        return res.status(400).json({ message: "reassignTo must be a different category." });
      }
      const target = await Category.findById(reassignTo);
      if (!target) return res.status(400).json({ message: "reassignTo category not found." });

      await Room.updateMany(
        { category: category._id },
        { $set: { category: target._id, categoryName: target.name } }
      );
    }

    await category.deleteOne();
    res.json({ message: "Category deleted.", reassignedRooms: roomCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;