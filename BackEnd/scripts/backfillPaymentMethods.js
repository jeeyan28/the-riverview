const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const Booking = require("../model/booking");
const {
  getPaymongoPaymentMethodLabel,
  resolvePaymongoPaymentMethodType,
  retrievePaymentIntent,
} = require("../utils/paymongo");

const APPLY = process.argv.includes("--apply");
const rollbackIndex = process.argv.indexOf("--rollback");
const rollbackFile = rollbackIndex >= 0 ? process.argv[rollbackIndex + 1] : "";
const GENERIC_METHODS = ["PayMongo", "paymongo", "Online payment", ""];

async function rollback(filePath) {
  if (!filePath) throw new Error("Pass the backup file path after --rollback.");
  const entries = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  if (!Array.isArray(entries)) throw new Error("Rollback backup must contain an array.");

  const operations = entries.map((entry) => ({
    updateOne: {
      filter: { _id: entry.id, paymentMethod: entry.newMethod },
      update: { $set: { paymentMethod: entry.oldMethod } },
    },
  }));
  const result = operations.length ? await Booking.bulkWrite(operations, { ordered: false }) : null;
  console.log(`Rollback restored ${result?.modifiedCount || 0} of ${entries.length} booking(s).`);
}

async function collectChanges() {
  const bookings = await Booking.find({
    paymentProvider: "paymongo",
    paymentMethod: { $in: GENERIC_METHODS },
    paymongoPaymentIntentId: { $type: "string", $ne: "" },
  }).select("_id reservationCode paymentMethod paymongoPaymentIntentId").lean();

  const changes = [];
  const failures = [];

  for (const booking of bookings) {
    try {
      const intent = await retrievePaymentIntent(booking.paymongoPaymentIntentId);
      const payments = intent?.data?.attributes?.payments;
      const paidPayment = Array.isArray(payments)
        ? payments.find((payment) => payment?.attributes?.status === "paid")
        : null;
      const methodType = resolvePaymongoPaymentMethodType(paidPayment);
      if (!methodType) {
        failures.push({ reservationCode: booking.reservationCode, reason: "payment method unavailable" });
        continue;
      }
      changes.push({
        id: String(booking._id),
        reservationCode: booking.reservationCode,
        oldMethod: booking.paymentMethod || "",
        newMethod: getPaymongoPaymentMethodLabel(methodType),
      });
    } catch (error) {
      failures.push({ reservationCode: booking.reservationCode, reason: error.message });
    }
  }

  return { scanned: bookings.length, changes, failures };
}

function writeBackup(changes) {
  const backupDirectory = path.join(__dirname, "..", "..", ".payment-method-backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `payment-methods-${timestamp}.json`);
  fs.writeFileSync(backupPath, `${JSON.stringify(changes, null, 2)}\n`, "utf8");
  return backupPath;
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
  await mongoose.connect(process.env.MONGO_URI);

  if (rollbackIndex >= 0) {
    await rollback(rollbackFile);
    return;
  }

  const { scanned, changes, failures } = await collectChanges();
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`Scanned ${scanned} generic PayMongo booking(s); resolved ${changes.length}.`);
  for (const change of changes) {
    console.log(`  ${change.reservationCode || change.id}: ${change.oldMethod || "(blank)"} -> ${change.newMethod}`);
  }
  for (const failure of failures) {
    console.warn(`  Skipped ${failure.reservationCode || "unknown booking"}: ${failure.reason}`);
  }

  if (!APPLY || !changes.length) {
    if (!APPLY) console.log("Dry run only; use --apply after reviewing these changes.");
    return;
  }

  const backupPath = writeBackup(changes);
  const operations = changes.map((change) => ({
    updateOne: {
      filter: { _id: change.id, paymentMethod: change.oldMethod },
      update: { $set: { paymentMethod: change.newMethod } },
    },
  }));
  const result = await Booking.bulkWrite(operations, { ordered: false });
  console.log(`Updated ${result.modifiedCount} booking(s).`);
  console.log(`Rollback backup: ${backupPath}`);
}

run()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
