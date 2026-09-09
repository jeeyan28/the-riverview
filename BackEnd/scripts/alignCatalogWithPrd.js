// Idempotently align active catalog and operating settings with context/PRD.md
// while preserving media, inventory counts, announcements, and closures.
const dns = require("node:dns");
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require("dotenv").config();
const fs = require("node:fs/promises");
const path = require("node:path");
const mongoose = require("mongoose");
const Room = require("../model/room");
const { MonitorRoom } = require("../model/monitoring");
const Settings = require("../model/settings");
const { syncRoomInventory } = require("../utils/syncRoomInventory");

const APPLY = process.argv.includes("--apply");

const CATALOG = {
  Billiards: {
    description: "Choose from shared, solo, and VIP billiards rooms.",
    variants: [
      { label: "Shared Room", aliases: ["shared"], price: 150, features: ["Shared billiards space"] },
      { label: "Solo Regular", aliases: ["solo regular", "regular"], price: 200, features: ["Private billiards table"] },
      { label: "Solo Big Room", aliases: ["solo big", "big room"], price: 250, features: ["Larger private billiards room"] },
      {
        label: "VIP",
        aliases: ["vip"],
        price: 400,
        pax: "Max 10 pax",
        includedGuests: 0,
        extraGuestFee: 50,
        features: ["KTV + Pool", "Maximum 10 guests", "+₱50 per guest"],
      },
    ],
  },
  KTV: {
    description: "Private KTV rooms for groups and celebrations.",
    variants: [
      { label: "Standard Room", aliases: ["standard", "ktv"], price: 300, features: ["Private KTV room"] },
    ],
  },
  Court: {
    description: "Court rentals for casual play and official games.",
    variants: [
      {
        label: "Standard",
        aliases: ["standard"],
        price: 350,
        pricingMode: "time-based",
        eveningPrice: 400,
        eveningStartTime: "17:00",
        features: ["₱350/hr from 7 AM–5 PM", "₱400/hr from 5 PM–12 AM"],
      },
      {
        label: "Official Games",
        aliases: ["official", "premium"],
        price: 500,
        features: ["Scoreboard", "Timer", "Sound system"],
      },
    ],
  },
};

const OPERATING_HOURS = Object.freeze({
  openTime: "07:00",
  closeTime: "00:00",
  openDays: [0, 1, 2, 3, 4, 5, 6],
  minOnlineDurationHours: 1,
  maxOnlineDurationHours: 5,
});

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function findExistingVariant(variants, definition) {
  const aliases = [definition.label, ...(definition.aliases || [])].map(normalized);
  return variants.find((variant) => aliases.some((alias) => normalized(variant.label).includes(alias)));
}

function mergeFeatures(existing = [], canonical = []) {
  return [...new Set([...canonical, ...existing].map((item) => String(item).trim()).filter(Boolean))];
}

function buildVariant(definition, existing, fallback) {
  const source = existing || fallback || {};
  return {
    label: definition.label,
    price: definition.price,
    pax: definition.pax ?? source.pax ?? "",
    startingRoomNumber: Math.max(1, Number(source.startingRoomNumber) || 1),
    roomCount: Math.max(1, Number(source.roomCount) || 1),
    status: source.status || "Available",
    image: source.image || "",
    description: source.description || "",
    features: mergeFeatures(source.features, definition.features),
    pricingMode: definition.pricingMode || "flat",
    eveningPrice: definition.pricingMode === "time-based" ? definition.eveningPrice : null,
    eveningStartTime: definition.eveningStartTime || "17:00",
    includedGuests: definition.includedGuests || 0,
    extraGuestFee: definition.extraGuestFee || 0,
  };
}

async function alignFacility(name, definition, session) {
  const roomQuery = Room.findOne({ name: new RegExp(`^${name}$`, "i") });
  const room = await (session ? roomQuery.session(session) : roomQuery);
  if (!room) {
    console.log(`${name}: missing; add it through Room Management to upload facility images.`);
    return;
  }

  const previousFacilityName = room.name;
  const existingVariants = room.variants?.map((variant) => variant.toObject()) || [];
  const fallback = existingVariants[0] || {};
  room.name = name;
  room.description = definition.description;
  room.variants = definition.variants.map((variant) => (
    buildVariant(variant, findExistingVariant(existingVariants, variant), fallback)
  ));
  room.price = Math.min(...room.variants.map((variant) => Number(variant.price)));

  console.log(`${name}: ${room.variants.map((variant) => `${variant.label} ₱${variant.price}`).join(", ")}`);
  if (!APPLY) return;

  await room.save({ session });
  await syncRoomInventory(room, previousFacilityName, session);
}

async function alignOperatingHours(session) {
  const settingsQuery = Settings.findById("global");
  let settings = await (session ? settingsQuery.session(session) : settingsQuery);
  const current = settings?.operatingHours?.toObject?.() || settings?.operatingHours || null;
  console.log(`Operating hours: ${current?.openTime || "missing"}–${current?.closeTime || "missing"}, ${current?.openDays?.length || 0} open day(s) -> 07:00–00:00, open daily, 1–5 hour online bookings`);
  if (!APPLY) return;

  if (!settings) settings = new Settings({ _id: "global" });
  settings.operatingHours = { ...OPERATING_HOURS };
  settings.updatedAt = new Date();
  await settings.save({ session });
}

async function writeBackup() {
  const facilityPatterns = Object.keys(CATALOG).map((name) => new RegExp(`^${name}$`, "i"));
  const [rooms, monitorRooms, settings] = await Promise.all([
    Room.find({ name: { $in: facilityPatterns } }).lean(),
    MonitorRoom.find({ facilityName: { $in: facilityPatterns } }).lean(),
    Settings.findById("global").lean(),
  ]);
  const backupDirectory = path.join(__dirname, "..", ".prd-backups");
  await fs.mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `project-data-before-${stamp}.json`);
  await fs.writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), rooms, monitorRooms, settings }, null, 2));
  console.log(`Backup written to ${backupPath}`);
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required.");
  await mongoose.connect(process.env.MONGO_URI);
  if (APPLY) {
    await writeBackup();
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const [name, definition] of Object.entries(CATALOG)) {
          await alignFacility(name, definition, session);
        }
        await alignOperatingHours(session);
      });
    } finally {
      await session.endSession();
    }
  } else {
    for (const [name, definition] of Object.entries(CATALOG)) {
      await alignFacility(name, definition);
    }
    await alignOperatingHours();
  }
  await mongoose.disconnect();
  console.log(APPLY
    ? "Catalog, monitoring inventory, and operating hours now match context/PRD.md."
    : "Dry run only. Re-run with --apply after reviewing the plan.");
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
