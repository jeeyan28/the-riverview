const dns = require('node:dns');
// Windows SRV lookup bug (nodejs/node#64428); Vercel's runtime refuses public resolvers.
if (process.platform === 'win32') dns.setServers(['1.1.1.1', '8.8.8.8']);

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const { STAFF_SESSION_MS, CUSTOMER_SESSION_MS } = require("./utils/sessionPolicy");
const { MongoStore } = require("connect-mongo");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { startReservationScheduler } = require('./utils/reservationScheduler');

const app = express();
const PORT = process.env.PORT || 3000;
for (const name of ["MONGO_URI", "SESSION_SECRET"]) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
if (process.env.NODE_ENV === "production" && (!process.env.APP_BASE_URL || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("Production requires APP_BASE_URL and a SESSION_SECRET of at least 32 characters.");
}

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

let connectionPromise;
async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGO_URI)
      .then(() => console.log("Connected to MongoDB"))
      .finally(() => { connectionPromise = null; });
  }
  await connectionPromise;
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
const { webhookHandler: xenditWebhookHandler } = require("./routes/xenditRoutes");
app.post("/api/payments/xendit/webhook", express.json({ limit: "100kb" }), xenditWebhookHandler);

app.use(express.json({ limit: "100kb" }));

const allowedOrigins = (process.env.APP_BASE_URL || "http://localhost:5501")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(Object.assign(new Error("Request origin not allowed."), { status: 403 }));
  },
  credentials: true,
}));

const { verifyOrigin } = require("./middleware/csrf");
app.use(verifyOrigin(allowedOrigins));

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGO_URI,
  collectionName: "sessions",
  ttl: CUSTOMER_SESSION_MS / 1000,
  autoRemove: "native",
}).on("error", (err) => {
  console.error("Session store error:", err);
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  name: "connect.sid",

  store: sessionStore,

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STAFF_SESSION_MS,
  },
}));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/rooms", require("./routes/roomRoutes"));

const monitoringRoutes = require("./routes/monitoringRoutes");
app.use("/api/monitor-rooms", monitoringRoutes.roomsRouter);
app.use("/api/room-sessions", monitoringRoutes.sessionsRouter);

app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/login-history", require("./routes/loginHistoryRoutes"));
app.use("/api/settings", require("./routes/settingsRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/jobs/reservations", require("./routes/reservationJobsRoutes").router);
app.use("/api/audit-logs", require("./routes/auditLogRoutes"));
app.use("/api/forecast", require("./routes/forecastRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/payments/paymongo", require("./routes/paymongoRoutes").router);
app.use("/api/payments/xendit", require("./routes/xenditRoutes").router);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err);
  const uploadError = typeof err.code === "string" && err.code.startsWith("LIMIT_");
  let status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (err.code === "LIMIT_FILE_SIZE") status = 413;
  else if (uploadError) status = 400;
  const message = status >= 500 ? "Something went wrong." : status === 413 ? "The uploaded file or request is too large." : err.message || "Invalid request.";
  return res.status(status).json({ message });
});

if (require.main === module) {
  connectDB()
    .then(() => {
      const stopScheduler = startReservationScheduler();
      const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
      let closing = false;
      async function shutdown(signal) {
        if (closing) return;
        closing = true;
        console.log(`Received ${signal}; finishing active work.`);
        const deadline = setTimeout(() => {
          server.closeAllConnections();
          process.exit(1);
        }, 30000);
        deadline.unref();
        try {
          await Promise.all([
            stopScheduler(),
            new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
          ]);
          await sessionStore.close();
          await mongoose.disconnect();
          clearTimeout(deadline);
        } catch (error) {
          console.error('Shutdown failed:', error.message);
          process.exit(1);
        }
      }
      process.once('SIGINT', () => shutdown('SIGINT'));
      process.once('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error("MongoDB connection failed:", err.message);
      process.exit(1);
    });
}

module.exports = app;
