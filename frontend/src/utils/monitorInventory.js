export function filterMonitorInventory(monitorRooms, facilities) {
  const catalogByName = new Map(facilities.map((facility) => [facility.name.trim().toLowerCase(), facility]));

  return monitorRooms.filter((room) => {
    if (room.status !== 'Inactive') return true;
    if (room.isTemporary) return false;

    const facility = catalogByName.get(String(room.facilityName || '').trim().toLowerCase());
    const variant = facility?.variants?.find((entry) => entry.label === room.roomName);
    const number = Number(room.roomNumber);
    const count = Math.max(1, Number(variant?.roomCount) || 1);
    return !!variant && Number.isInteger(number) && number >= 1 && number <= count;
  });
}

export function getBookingRoomTarget(booking, rooms) {
  const bookedFacility = booking.room?.name || booking.roomLabel;
  if (!bookedFacility) return null;
  const bookedRoom = booking.variantLabel || bookedFacility;
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const matchingRooms = rooms.filter((room) => !room.isTemporary && ['Available', 'Occupied'].includes(room.status) && normalize(room.facilityName) === normalize(bookedFacility) && normalize(room.roomName) === normalize(bookedRoom));
  if (!matchingRooms.length) return null;
  return {
    facilityName: matchingRooms[0].facilityName,
    roomName: matchingRooms[0].roomName,
    startingRoomNumber: 1,
    roomCount: matchingRooms.length,
  };
}
