// 1. FORCE PUBLIC DNS (Must be the very first lines of code)
const dns = require('node:dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

// 2. Load dependencies
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const { MongoStore } = require("connect-mongo"); // v6 exports MongoStore as a named export, not the module default
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT || 3000;

// Sets baseline security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc).
// Run `npm install helmet` if it isn't already a dependency.
app.use(helmet());

// Cap request body size so a huge payload can't be used as a cheap DoS vector.
app.use(express.json({ limit: "100kb" }));

app.use(cors({
  origin: process.env.APP_BASE_URL || "http://localhost:5500",
  credentials: true,
}));

// ── Health check
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});


app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,

  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "sessions",
    ttl: 60 * 60 * 8,
  }),

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

// ── Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/rooms", require("./routes/roomRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));

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