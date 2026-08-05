// One-off migration: backfill Booking.roomLabel with the facility NAME for
// existing bookings that were saved with the old bug (roomLabel was set to
// room.roomNumber instead of room.name — see PROJECT_PROGRESS.md, 2026-07-30).
//
// Mirrors the pattern in scripts/migrateMonitorRoomNames.js.
//
// Usage:
//   node scripts/migrateBookingFacilityNames.js           # dry run, prints what would change
//   node scripts/migrateBookingFacilityNames.js --apply   # actually writes the changes
//
// Safe to re-run: bookings whose roomLabel already matches their room's
// current name are skipped.

require("dotenv").config();
const mongoose = require("mongoose");
const Booking = require("../model/booking");
const Room = require("../model/room");

const APPLY = process.argv.includes("--apply");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no changes will be saved)"}`);

  const bookings = await Booking.find({}).select("_id reservationCode roomLabel room");
  console.log(`Found ${bookings.length} booking(s) to check.\n`);

  let toUpdate = 0;
  let updated = 0;
  let missingRoom = 0;
  let skippedNoName = 0;

  for (const booking of bookings) {
    const room = await Room.findById(booking.room).select("name roomNumber");
    if (!room) {
      missingRoom++;
      console.log(`  [skip] ${booking.reservationCode || booking._id} — room ${booking.room} no longer exists.`);
      continue;
    }

    const correctLabel = room.name || room.roomNumber;
    if (!correctLabel) {
      skippedNoName++;
      console.log(`  [skip] ${booking.reservationCode || booking._id} — room ${room._id} has neither a name nor a roomNumber.`);
      continue;
    }

    if (booking.roomLabel === correctLabel) continue; // already correct

    toUpdate++;
    console.log(`  ${booking.reservationCode || booking._id}: "${booking.roomLabel}" -> "${correctLabel}"`);

    if (APPLY) {
      await Booking.updateOne({ _id: booking._id }, { $set: { roomLabel: correctLabel } });
      updated++;
    }
  }

  console.log(`\n${toUpdate} booking(s) need updating.`);
  if (APPLY) {
    console.log(`${updated} booking(s) updated.`);
  } else {
    console.log(`Dry run only — re-run with --apply to write these changes.`);
  }
  if (missingRoom) console.log(`${missingRoom} booking(s) skipped (room no longer exists).`);
  if (skippedNoName) console.log(`${skippedNoName} booking(s) skipped (room has no name or roomNumber).`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});