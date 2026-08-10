const User = require("../model/user");
const { GUEST_RECOVERY_WINDOW_DAYS } = require("../utils/constants");

const GUEST_RECOVERY_WINDOW_MS = GUEST_RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

async function purgeExpiredGuests({ dryRun = false } = {}) {
  const cutoff = new Date(Date.now() - GUEST_RECOVERY_WINDOW_MS);
  const expired = await User.find({
    isGuest: true,
    guestDeletedAt: { $ne: null, $lt: cutoff },
  }).select("_id firstName lastName guestDeletedAt");

  if (!dryRun && expired.length) {
    await User.deleteMany({ _id: { $in: expired.map((u) => u._id) } });
  }

  return {
    dryRun,
    cutoff,
    deletedCount: dryRun ? 0 : expired.length,
    candidates: expired.map((u) => ({ id: u._id, name: `${u.firstName} ${u.lastName}`.trim(), guestDeletedAt: u.guestDeletedAt })),
  };
}

if (require.main === module) {
  const dns = require("node:dns");
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
  require("dotenv").config();
  const mongoose = require("mongoose");

  const APPLY = process.argv.includes("--apply");

  (async () => {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected. Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no changes will be saved)"}`);

    const result = await purgeExpiredGuests({ dryRun: !APPLY });
    console.log(`\nCutoff (${GUEST_RECOVERY_WINDOW_DAYS} days ago): ${result.cutoff.toISOString()}`);
    console.log(`Found ${result.candidates.length} expired guest account(s).`);
    for (const c of result.candidates) {
      console.log(`  ${c.name || c.id} (deleted ${c.guestDeletedAt.toISOString()})`);
    }

    if (APPLY) {
      console.log(`\n${result.deletedCount} guest account(s) hard-deleted.`);
    } else {
      console.log(`\nDry run only — re-run with --apply to write these changes.`);
    }

    await mongoose.disconnect();
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { purgeExpiredGuests };
