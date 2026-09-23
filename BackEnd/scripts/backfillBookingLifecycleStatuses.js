const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require("dotenv").config();
const mongoose = require("mongoose");
const Booking = require("../model/booking");
const { TIME_ZONE } = require("../utils/constants");
const { bookingStartMs } = require("../utils/bookingLifecycle");

const APPLY = process.argv.includes("--apply");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no changes will be saved)"}`);

  const now = Date.now();
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date(now));
  console.log(`\nToday (${TIME_ZONE}): ${todayKey}`);

  const confirmed = await Booking.find({
    date: { $lte: todayKey },
    status: Booking.BOOKING_STATUS.CONFIRMED,
    cancellationStatus: { $ne: "Requested" },
  }).select("_id reservationCode date timeIn duration status");
  const noShows = confirmed.filter((booking) => bookingStartMs(booking.date, booking.timeIn) + Number(booking.duration) * 3600000 <= now);
  console.log(`Found ${noShows.length} confirmed booking(s) whose reserved time has ended.`);

  for (const b of noShows) {
    console.log(`  ${b.reservationCode || b._id} (${b.date} ${b.timeIn}): "${b.status}" -> "${Booking.BOOKING_STATUS.NO_SHOW}"`);
  }

  if (APPLY && noShows.length) {
    await Booking.updateMany({ _id: { $in: noShows.map((b) => b._id) }, status: Booking.BOOKING_STATUS.CONFIRMED, cancellationStatus: { $ne: "Requested" } }, { status: Booking.BOOKING_STATUS.NO_SHOW, noShowAt: new Date(now) });
    console.log(`\n${noShows.length} booking(s) updated.`);
  } else if (!APPLY) {
    console.log(`\nDry run only — re-run with --apply to write these changes.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
