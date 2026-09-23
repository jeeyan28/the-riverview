const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require("dotenv").config();
const mongoose = require("mongoose");
const Room = require("../model/room");
const { syncRoomInventory } = require("../utils/syncRoomInventory");

async function run() {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const collection = mongoose.connection.db.collection("rooms");
    const rooms = await collection.find({ "variants.0": { $exists: true } }).toArray();
    let changed = 0;

    for (const room of rooms) {
      const needsUpdate = room.variants.some((variant) =>
        Number(variant.startingRoomNumber) !== 1 || Object.hasOwn(variant, "roomNumber"));
      if (!needsUpdate) continue;

      const variants = room.variants.map((variant) => {
        const { roomNumber, ...rest } = variant;
        return { ...rest, startingRoomNumber: 1 };
      });
      changed++;
      console.log(`${room.name}: reset room numbering to 1 for ${variants.length} room type(s)`);
      if (!apply) continue;

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await collection.updateOne({ _id: room._id }, { $set: { variants } }, { session });
          const updatedRoom = await Room.findById(room._id).session(session);
          await syncRoomInventory(updatedRoom, null, session);
        });
      } finally {
        await session.endSession();
      }
    }

    console.log(`${apply ? "Updated" : "Would update"} ${changed} facility/facilities.`);
    if (!apply && changed) console.log("Run with --apply to update the catalog and monitoring inventory.");
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
