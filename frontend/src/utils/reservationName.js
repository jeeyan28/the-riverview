export function reservationNameParts(name) {
  const fullName = String(name || '').trim().replace(/\s+/g, ' ');
  const commaIndex = fullName.indexOf(',');
  if (commaIndex > 0 && commaIndex < fullName.length - 1) {
    return {
      firstName: fullName.slice(commaIndex + 1).trim(),
      lastName: fullName.slice(0, commaIndex).trim(),
    };
  }
  const spaceIndex = fullName.lastIndexOf(' ');
  return spaceIndex < 0
    ? { firstName: fullName, lastName: '' }
    : { firstName: fullName.slice(0, spaceIndex), lastName: fullName.slice(spaceIndex + 1) };
}

export function reservationDisplayName(name) {
  const { lastName, firstName } = reservationNameParts(name);
  return lastName ? `${lastName}, ${firstName}` : firstName || '—';
}
