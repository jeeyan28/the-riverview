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

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// Sets baseline security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc).
app.use(helmet());

// ── Connect to MongoDB (cached across serverless invocations, since each
// invocation may run in a fresh/frozen instance and re-dialing every
// request would be slow and eventually exhaust connections). Registered
// before ANY route — including the webhook below — so every request path
// is guaranteed to have a DB connection in flight.
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(process.env.MONGO_URI);
  isConnected = true;
  console.log("✅ Connected to MongoDB");
}

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    res.status(500).json({ message: "Database connection failed" });
  }
});

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

const monitoringRoutes = require("./routes/monitoringRoutes");
app.use("/api/monitor-rooms", monitoringRoutes.roomsRouter);
app.use("/api/room-sessions", monitoringRoutes.sessionsRouter);

app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/login-history", require("./routes/loginHistoryRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes")); // operating hours, holidays, announcements
app.use("/api/forecast", require("./routes/forecastRoutes")); // Owner-only demand/revenue forecasting
app.use("/api/payments/paymongo", require("./routes/paymongoRoutes").router); // automatic online payment (checkout + status)

// ── Centralized error handler (catches multer file-type/size errors, etc.)
app.use((err, req, res, next) => {
  if (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || "Something went wrong." });
  }
  next();
});

// Only run a persistent listening server for local dev (`node server.js`).
// On Vercel, this file is imported by api/index.js and the app is invoked
// per-request instead — app.listen() must not run there.
if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error("MongoDB connection failed:", err.message);
      process.exit(1);
    });
}

module.exports = app;