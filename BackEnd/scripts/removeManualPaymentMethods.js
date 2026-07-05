// One-off migration: removes the manual QR payment methods (GCash/Maya, or
// whatever an admin has configured under Settings > Payment Methods) that
// were previously auto-seeded/added, now that checkout is automatic through
// PayMongo. This does NOT touch:
//   - past bookings, their paymentScreenshot, paymentMethod, or history
//   - the paymentMethods schema / admin CRUD endpoints (an admin can still
//     add a manual method back later from the admin UI any time)
//
// Run once, from the Backend/ folder:
//   node scripts/removeManualPaymentMethods.js
//
// Requires the same .env (MONGO_URI) the server itself uses.

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Settings = require("../model/settings");

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set (check your .env). Aborting.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const settings = await Settings.getSingleton();
  const before = settings.paymentMethods.length;

  if (before === 0) {
    console.log("No payment methods configured — nothing to remove.");
  } else {
    console.log(`Removing ${before} payment method(s):`, settings.paymentMethods.map(pm => pm.name).join(", "));
    settings.paymentMethods = [];
    await settings.save();
    console.log("Done. Payment methods list is now empty.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
