const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const collection = mongoose.connection.db.collection("rooms");

  const rooms = await collection.find({ "variants.0": { $exists: true } }).toArray();
  console.log(`Found ${rooms.length} facility/facilities with room types to check.`);

  let updatedFacilities = 0;
  let updatedVariants = 0;

  for (const room of rooms) {
    const newVariants = room.variants.map((variant) => {
      const legacy = variant.roomNumber;
      const parsed = parseInt(legacy, 10);
      const startingRoomNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      updatedVariants++;
      console.log(`  ${room.name} / ${variant.label || "(untitled)"}: roomNumber="${legacy ?? ""}" -> startingRoomNumber=${startingRoomNumber}`);
      const { roomNumber, ...rest } = variant;
      return { ...rest, startingRoomNumber };
    });

    await collection.updateOne({ _id: room._id }, { $set: { variants: newVariants }, $unset: { status: "" } });
    updatedFacilities++;
  }

  console.log(`Done. Updated ${updatedVariants} room type(s) across ${updatedFacilities} facility/facilities.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});