// One-time migration: splits the legacy `fullName` field into `firstName`
// + `lastName` on User and PendingRegistration documents, then removes
// `fullName`. Run this ONCE, before deploying the schema/route changes
// that replace fullName with firstName/lastName (see FEATURE_REQUESTS.md —
// "Replace Full Name with First Name and Last Name").
//
// Usage:
//   node BackEnd/scripts/splitFullName.js
//
// Safe to re-run: documents that already have firstName set are skipped,
// and documents already flagged (see below) are re-checked each run so
// they're picked up automatically once fixed.
//
// Data integrity: a single-word name (e.g. "Madonna") has no lastName to
// split out. Since firstName/lastName are both required on the new schema,
// this script does NOT migrate those documents or write an empty
// lastName — that would silently create a record that fails validation on
// its next unrelated save() (see PROJECT_PROGRESS.md). Instead it leaves
// `fullName` untouched and reports the record so it can be fixed by hand
// before deployment.
require("dotenv").config();
const mongoose = require("mongoose");

function splitName(fullName) {
  const normalized = String(fullName || "").trim().replace(/\s+/g, " ");
  const spaceIndex = normalized.indexOf(" ");
  if (spaceIndex === -1) {
    return { firstName: normalized, lastName: "" };
  }
  return {
    firstName: normalized.slice(0, spaceIndex),
    lastName: normalized.slice(spaceIndex + 1),
  };
}

async function migrateCollection(name) {
  const coll = mongoose.connection.collection(name);
  const cursor = coll.find({
    firstName: { $exists: false },
    fullName: { $exists: true },
  });

  let migrated = 0;
  const needsReview = [];

  for await (const doc of cursor) {
    const { firstName, lastName } = splitName(doc.fullName);

    if (!lastName) {
      // Single-word name — skip. fullName is left in place untouched so
      // the record is neither migrated nor left in a broken required-field
      // state, and so this same query picks it up again on the next run.
      needsReview.push({
        _id: doc._id,
        email: doc.email || "(no email)",
        fullName: doc.fullName,
      });
      continue;
    }

    await coll.updateOne(
      { _id: doc._id },
      { $set: { firstName, lastName }, $unset: { fullName: "" } }
    );
    migrated += 1;
  }

  console.log(`${name}: migrated ${migrated} document(s).`);
  if (needsReview.length) {
    console.log(`${name}: ${needsReview.length} record(s) need manual review (single-word name, NOT migrated):`);
    for (const r of needsReview) {
      console.log(`  - _id=${r._id}  email=${r.email}  fullName="${r.fullName}"`);
    }
  }

  return needsReview;
}

async function main() {
  // NOTE: assumes the same env var name server.js uses to connect —
  // server.js wasn't part of this task's files, so verify/adjust
  // process.env.MONGO_URI against your actual connection code before running.
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected. Starting migration...");

  const usersReview = await migrateCollection("users");
  const pendingReview = await migrateCollection("pendingregistrations");

  const totalReview = usersReview.length + pendingReview.length;
  console.log("Done.");
  if (totalReview > 0) {
    console.log(
      `\n${totalReview} record(s) still need manual review before deploying the firstName/lastName schema change. ` +
      `Fix each one's firstName/lastName by hand (e.g. directly in MongoDB), then re-run this script to pick them up — ` +
      `it will only touch documents that still have firstName missing.`
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});