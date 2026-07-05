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

// If this app runs behind any reverse proxy / load balancer / platform
// (Render, Railway, Nginx, etc.) in production, Express needs to trust the
// X-Forwarded-Proto header to know the original request was HTTPS. Without
// this, cookie.secure=true (below) can end up unusable and sessions silently
// fail to persist — this is the most common cause of "I'm logged in but every
// request says I'm not."
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Sets baseline security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc).
app.use(helmet());

// PayMongo webhook — MUST be registered before express.json() below and use
// express.raw(), because verifying the Paymongo-Signature header requires
// the exact raw bytes PayMongo sent. If express.json() parsed the body first,
// re-serializing it to compute the signature would (almost always) produce
// different bytes and every legitimate webhook would fail verification.
const { webhookHandler } = require("./routes/paymongoRoutes");
app.post("/api/payments/paymongo/webhook", express.raw({ type: "application/json" }), webhookHandler);

// Cap request body size so a huge payload can't be used as a cheap DoS vector.
app.use(express.json({ limit: "100kb" }));

// Supports one or several frontend origins via a comma-separated APP_BASE_URL
// (e.g. "https://app.example.com,https://www.example.com"). Falls back to the
// Live Server default for local development.
const allowedOrigins = (process.env.APP_BASE_URL || "http://localhost:5500")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser tools (curl, server-to-server) with no Origin header.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
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
  name: "connect.sid",

  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "sessions",
    ttl: 60 * 60 * 8,
    autoRemove: "native",
  }).on("error", (err) => {
    // connect-mongo fails closed but silently by default — log loudly so a
    // Mongo hiccup in production doesn't look like an unexplained logout bug.
    console.error("Session store error:", err);
  }),

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 8,
  },
}));

// ── Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/rooms", require("./routes/roomRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes")); // Tier 4: room categories
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes")); // operating hours, holidays, announcements
app.use("/api/pos", require("./routes/posRoutes"));           // POS sales
app.use("/api/payments/paymongo", require("./routes/paymongoRoutes").router); // automatic online payment (checkout + status)

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