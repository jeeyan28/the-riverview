// One-time migration: MonitorRoom docs created before the facilityName/
// roomName split only have the old `name` field (which held the facility).
// This backfills facilityName from it and sets a placeholder roomName —
// edit each room afterward via Room Monitoring's Edit button to replace the
// placeholder with a real name.
//
// Same DNS override as server.js — mongodb+srv:// needs an SRV lookup that
// this network's default DNS can't resolve, so force public resolvers first.
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

// Run once: node scripts/migrateMonitorRoomNames.js
require("dotenv").config();
const mongoose = require("mongoose");
const { MonitorRoom } = require("../model/monitoring");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const rooms = await mongoose.connection.db
    .collection("monitorrooms")
    .find({ $or: [{ facilityName: { $exists: false } }, { roomName: { $exists: false } }] })
    .toArray();

  console.log(`Found ${rooms.length} room(s) to migrate.`);

  for (const r of rooms) {
    const facilityName = r.facilityName || r.name || "Unassigned";
    const roomName = r.roomName || `Room ${r.roomNumber ?? ""}`.trim();

    await mongoose.connection.db.collection("monitorrooms").updateOne(
      { _id: r._id },
      { $set: { facilityName, roomName }, $unset: { name: "" } }
    );
    console.log(`  ${r._id} -> facilityName="${facilityName}" roomName="${roomName}"`);
  }

  console.log("Done.");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});