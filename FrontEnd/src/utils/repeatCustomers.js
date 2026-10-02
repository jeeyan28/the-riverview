import { reservationDisplayName } from './reservationName.js';

const normalize = (value) => String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const roomId = (booking) => String(booking.room?._id || booking.room || '');
const phone = (booking) => {
  const value = String(booking.guestContact || '').trim();
  return value.replace(/\D/g, '').length >= 7 ? value : '';
};
const email = (booking) => {
  const value = String(booking.guestEmail || (String(booking.guestContact || '').includes('@') ? booking.guestContact : '')).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '';
};

function mostFrequent(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    const current = counts.get(key);
    counts.set(key, current ? { ...current, count: current.count + 1 } : { item, count: 1 });
  }
  return [...counts.values()].reduce((best, current) => current.count > (best?.count || 0) ? current : best, null)?.item || null;
}

export function repeatCustomerLookupTerm(name) {
  return normalize(name).split(' ').sort((a, b) => b.length - a.length)[0] || '';
}

export function repeatCustomerSuggestions(bookings, query, rooms, minDuration = 1, maxDuration = 5) {
  const tokens = normalize(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const availableRooms = new Map(rooms.map((room) => [String(room._id), room]));
  const availableRoomsByName = new Map(rooms.map((room) => [normalize(room.name), room]));
  const currentRoom = (booking) => availableRooms.get(roomId(booking))
    || availableRoomsByName.get(normalize(booking.room?.name || booking.roomLabel));
  const groups = new Map();
  const matching = (Array.isArray(bookings) ? bookings : [])
    .filter((booking) => {
      const name = normalize(reservationDisplayName(booking.guestName));
      return name && tokens.every((token) => name.includes(token));
    })
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));

  for (const booking of matching) {
    const name = reservationDisplayName(booking.guestName);
    const contact = phone(booking).replace(/\D/g, '') || email(booking).toLowerCase() || 'unknown';
    const key = `${normalize(name)}|${contact}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }

  return [...groups].map(([key, history]) => {
    const usable = history
      .filter((booking) => !['Cancelled', 'Rejected'].includes(booking.status))
      .map((booking) => ({ booking, room: currentRoom(booking) }))
      .filter(({ room }) => room && room.status !== 'Unavailable' && (!room.variants?.length || room.variants.some((variant) => variant.status !== 'Unavailable')));
    const typicalRoom = mostFrequent(usable, ({ room }) => String(room._id));
    const sameRoom = typicalRoom
      ? usable.filter(({ room }) => String(room._id) === String(typicalRoom.room._id)).map(({ booking }) => booking)
      : [];
    const selectableVariants = typicalRoom?.room.variants?.filter((variant) => variant.status !== 'Unavailable') || [];
    const typicalVariant = mostFrequent(sameRoom.filter((booking) => selectableVariants.some((variant) => normalize(variant.label) === normalize(booking.variantLabel))), (booking) => normalize(booking.variantLabel));
    const variant = selectableVariants.find((candidate) => normalize(candidate.label) === normalize(typicalVariant?.variantLabel)) || selectableVariants[0];
    const typicalDuration = mostFrequent(sameRoom.filter((booking) => Number.isInteger(Number(booking.duration)) && Number(booking.duration) >= minDuration && Number(booking.duration) <= maxDuration), (booking) => String(booking.duration));
    const typicalGuests = mostFrequent(sameRoom.filter((booking) => Number.isInteger(Number(booking.guestCount)) && Number(booking.guestCount) >= 1), (booking) => String(booking.guestCount));
    const room = typicalRoom?.room;

    return {
      key,
      name: reservationDisplayName(history[0].guestName),
      phone: history.map(phone).find(Boolean) || '',
      email: history.map(email).find(Boolean) || '',
      reservationCount: history.length,
      lastReservedAt: Date.parse(history[0].createdAt) || 0,
      preference: room ? {
        roomId: String(room._id),
        roomName: room.name,
        variantLabel: variant?.label || '',
        duration: Number(typicalDuration?.duration) || minDuration,
        guestCount: Number(typicalGuests?.guestCount) || 1,
      } : null,
    };
  }).sort((a, b) => b.reservationCount - a.reservationCount || b.lastReservedAt - a.lastReservedAt).slice(0, 6);
}
