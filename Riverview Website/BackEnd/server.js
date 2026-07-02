// 1. FORCE PUBLIC DNS (Must be the very first lines of code)
const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

// 2. Load dependencies
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// ── Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ── Routes
app.use("/", require("./routes/auth"));            // POST /register, POST /login  (unchanged paths)
app.use("/api/rooms", require("./routes/rooms"));   // GET/POST/PUT/DELETE /api/rooms
app.use("/api/bookings", require("./routes/bookings")); // GET/POST/PUT/DELETE /api/bookings

// ── Centralized error handler (catches multer file-type/size errors, etc.)
app.use((err, req, res, next) => {
  if (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || "Something went wrong." });
  }
  next();
});

// ── Connect to MongoDB then start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });