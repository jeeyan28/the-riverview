const { MonitorRoom } = require("../model/monitoring");

function monitorStatus(variantStatus) {
  if (variantStatus === "Maintenance") return "Under Maintenance";
  if (variantStatus === "Unavailable") return "Inactive";
  return "Available";
}

function inventoryKey(facilityName, roomName, roomNumber) {
  return `${facilityName}\u0000${roomName}\u0000${roomNumber}`;
}

async function syncRoomInventory(room, previousFacilityName, session) {
  const facilityName = room.name;
  const desired = [];
  for (const variant of room.variants || []) {
    const start = Math.max(1, Number(variant.startingRoomNumber) || 1);
    const count = Math.max(1, Number(variant.roomCount) || 1);
    for (let offset = 0; offset < count; offset += 1) {
      desired.push({
        facilityName,
        roomName: variant.label,
        roomNumber: String(start + offset),
        price: Number(variant.price) || 0,
        pax: variant.pax || "",
        pricingMode: variant.pricingMode || "flat",
        eveningPrice: variant.eveningPrice ?? null,
        eveningStartTime: variant.eveningStartTime || "17:00",
        includedGuests: Number(variant.includedGuests) || 0,
        extraGuestFee: Number(variant.extraGuestFee) || 0,
        desiredStatus: monitorStatus(variant.status),
      });
    }
  }

  const facilityNames = [...new Set([facilityName, previousFacilityName].filter(Boolean))];
  const existingQuery = MonitorRoom.find({ facilityName: { $in: facilityNames } });
  const existing = await (session ? existingQuery.session(session) : existingQuery);
  const availableByKey = new Map();
  existing.forEach((entry) => {
    const key = inventoryKey(entry.facilityName, entry.roomName, entry.roomNumber);
    if (!availableByKey.has(key)) availableByKey.set(key, []);
    availableByKey.get(key).push(entry);
  });

  const retainedIds = new Set();
  for (const target of desired) {
    const key = inventoryKey(target.facilityName, target.roomName, target.roomNumber);
    const match = availableByKey.get(key)?.shift();
    const values = {
      facilityName: target.facilityName,
      roomName: target.roomName,
      roomNumber: target.roomNumber,
      price: target.price,
      pax: target.pax,
      pricingMode: target.pricingMode,
      eveningPrice: target.eveningPrice,
      eveningStartTime: target.eveningStartTime,
      includedGuests: target.includedGuests,
      extraGuestFee: target.extraGuestFee,
      isTemporary: false,
    };

    if (match) {
      Object.assign(match, values);
      if (match.status !== "Occupied") match.status = target.desiredStatus;
      await match.save(session ? { session } : undefined);
      retainedIds.add(String(match._id));
    } else {
      const [created] = await MonitorRoom.create(
        [{ ...values, status: target.desiredStatus }],
        session ? { session } : undefined
      );
      retainedIds.add(String(created._id));
    }
  }

  const stale = existing.filter((entry) => !retainedIds.has(String(entry._id)) && entry.status !== "Occupied");
  if (stale.length) {
    await MonitorRoom.updateMany(
      { _id: { $in: stale.map((entry) => entry._id) } },
      { $set: { status: "Inactive" } },
      session ? { session } : undefined
    );
  }
}

async function deactivateRoomInventory(facilityName) {
  await MonitorRoom.updateMany(
    { facilityName, status: { $ne: "Occupied" } },
    { $set: { status: "Inactive" } }
  );
}

module.exports = { syncRoomInventory, deactivateRoomInventory };
