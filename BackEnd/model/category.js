const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, unique: true },
  description: { type: String, default: "" },
  // Controls display order in the admin UI and any guest-facing category lists.
  sortOrder:   { type: Number, default: 0 },
  // Lets admins retire a category (e.g. seasonal) without deleting it and
  // without touching the rooms still assigned to it.
  isActive:    { type: Boolean, default: true },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model("Category", categorySchema);