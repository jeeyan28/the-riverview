function normalizedRoomName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\brooms?\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function catalogVariantForMonitorRoom(monitorRoom, catalogRoom) {
  if (!catalogRoom || String(catalogRoom.name).toLowerCase() !== String(monitorRoom.facilityName).toLowerCase()) return null;
  const name = normalizedRoomName(monitorRoom.roomName);
  if (!name) return null;
  const matches = (catalogRoom.variants || []).filter((variant) => normalizedRoomName(variant.label) === name);
  return matches.length === 1 && Number(matches[0].price) > 0 ? matches[0] : null;
}

function pricedMonitorRoom(monitorRoom, catalogRoom) {
  const room = monitorRoom.toObject ? monitorRoom.toObject() : { ...monitorRoom };
  if (Number(room.price) > 0) return room;
  const variant = catalogVariantForMonitorRoom(room, catalogRoom);
  if (!variant) return room;
  return {
    ...room,
    price: Number(variant.price),
    pricingMode: variant.pricingMode || "flat",
    eveningPrice: variant.eveningPrice ?? null,
    eveningStartTime: variant.eveningStartTime || "17:00",
    includedGuests: Number(variant.includedGuests) || 0,
    extraGuestFee: Number(variant.extraGuestFee) || 0,
    pax: variant.pax || room.pax,
  };
}

module.exports = { pricedMonitorRoom };
