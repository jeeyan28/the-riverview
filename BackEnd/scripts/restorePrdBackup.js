const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require("dotenv").config();
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const Room = require("../model/room");
const { MonitorRoom } = require("../model/monitoring");
const Settings = require("../model/settings");

const APPLY = process.argv.includes("--apply");
const BACKUP_DIRECTORY = path.resolve(__dirname, "..", ".prd-backups");
const FACILITIES = ["Billiards", "KTV", "Court"];

async function resolveBackupPath() {
  const option = process.argv.find((argument) => argument.startsWith("--backup="));
  let candidate;
  if (option) {
    const requested = option.slice("--backup=".length);
    candidate = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(BACKUP_DIRECTORY, requested);
  } else {
    const entries = (await fs.readdir(BACKUP_DIRECTORY))
      .filter((name) => /^project-data-before-.+\.json$/.test(name))
      .sort();
    if (!entries.length) throw new Error("No PRD migration backup was found.");
    candidate = path.join(BACKUP_DIRECTORY, entries[entries.length - 1]);
  }

  if (!candidate.startsWith(`${BACKUP_DIRECTORY}${path.sep}`)) {
    throw new Error("The backup must be inside BackEnd/.prd-backups.");
  }
  return candidate;
}

function validateBackup(data) {
  if (!data || !Array.isArray(data.rooms) || !Array.isArray(data.monitorRooms) || !data.createdAt) {
    throw new Error("The selected file is not a valid PRD migration backup.");
  }
}

async function restore(data) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const room of data.rooms) {
        await Room.replaceOne({ _id: room._id }, room, { upsert: true, session });
      }

      const currentMonitorRooms = await MonitorRoom.find({ facilityName: { $in: FACILITIES } }).session(session).lean();
      const currentById = new Map(currentMonitorRooms.map((room) => [String(room._id), room]));
      const backupIds = new Set(data.monitorRooms.map((room) => String(room._id)));

      for (const room of data.monitorRooms) {
        const current = currentById.get(String(room._id));
        const restored = current?.status === "Occupied" ? { ...room, status: "Occupied" } : room;
        await MonitorRoom.replaceOne({ _id: room._id }, restored, { upsert: true, session });
      }

      const addedIdleIds = currentMonitorRooms
        .filter((room) => !backupIds.has(String(room._id)) && room.status !== "Occupied")
        .map((room) => room._id);
      if (addedIdleIds.length) {
        await MonitorRoom.updateMany({ _id: { $in: addedIdleIds } }, { $set: { status: "Inactive" } }, { session });
      }

      if (data.settings) {
        await Settings.replaceOne({ _id: data.settings._id || "global" }, data.settings, { upsert: true, session });
      } else {
        await Settings.deleteOne({ _id: "global" }).session(session);
      }
    });
  } finally {
    await session.endSession();
  }
}

async function run() {
  const backupPath = await resolveBackupPath();
  const data = JSON.parse(await fs.readFile(backupPath, "utf8"));
  validateBackup(data);
  console.log(`Backup: ${backupPath}`);
  console.log(`Created: ${data.createdAt}`);
  console.log(`Would restore ${data.rooms.length} facilities, ${data.monitorRooms.length} monitor units, and ${data.settings ? "the settings singleton" : "an absent settings singleton"}.`);
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to restore this backup.");
    return;
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
  await mongoose.connect(process.env.MONGO_URI);
  await restore(data);
  await mongoose.disconnect();
  console.log("PRD migration backup restored. Occupied monitor units were preserved.");
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
