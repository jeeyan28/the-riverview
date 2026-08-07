const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require("dotenv").config();
const mongoose = require("mongoose");
const Booking = require("../model/booking");
const { TIME_ZONE } = require("../utils/constants");

const APPLY = process.argv.includes("--apply");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no changes will be saved)"}`);

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
  console.log(`\nToday (${TIME_ZONE}): ${todayKey}`);

  const stale = await Booking.find({
    date: { $lt: todayKey },
    status: {
      $in: [
        Booking.BOOKING_STATUS.PENDING,
        Booking.BOOKING_STATUS.PENDING_PAYMENT_VERIFICATION,
        Booking.BOOKING_STATUS.AWAITING_ONLINE_PAYMENT,
        Booking.BOOKING_STATUS.CONFIRMED,
        Booking.BOOKING_STATUS.ONGOING,
      ],
    },
  }).select("_id reservationCode date status");
  console.log(`Found ${stale.length} booking(s) from a past date that never reached Done.`);

  for (const b of stale) {
    console.log(`  ${b.reservationCode || b._id} (${b.date}): "${b.status}" -> "${Booking.BOOKING_STATUS.OVERDUE}"`);
  }

  if (APPLY && stale.length) {
    await Booking.updateMany({ _id: { $in: stale.map((b) => b._id) } }, { status: Booking.BOOKING_STATUS.OVERDUE });
    console.log(`\n${stale.length} booking(s) updated.`);
  } else if (!APPLY) {
    console.log(`\nDry run only — re-run with --apply to write these changes.`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});