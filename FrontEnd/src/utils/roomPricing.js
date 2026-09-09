export const CORKAGE_FEE = 200;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parseHour(value, fallback = 0) {
  const hour = Number.parseInt(String(value ?? '').split(':')[0], 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

export function roomRateForHour(variant, hour, guestCount = 1) {
  const baseRate = Math.max(0, Number(variant?.price) || 0);
  const hasEveningRate = variant?.eveningPrice !== null && variant?.eveningPrice !== undefined && variant?.eveningPrice !== '';
  const eveningRate = Number(variant?.eveningPrice);
  const eveningStart = parseHour(variant?.eveningStartTime, 17);
  const scheduledRate = variant?.pricingMode === 'time-based' && hasEveningRate && Number.isFinite(eveningRate) && hour >= eveningStart
    ? eveningRate
    : baseRate;

  const guests = Math.max(1, Number(guestCount) || 1);
  const includedGuests = Math.max(0, Number(variant?.includedGuests) || 0);
  const extraGuestFee = Math.max(0, Number(variant?.extraGuestFee) || 0);
  return roundMoney(scheduledRate + Math.max(0, guests - includedGuests) * extraGuestFee);
}

export function calculateBookingPrice({ variant, startHour = 0, duration = 1, guestCount = 1, hasCorkage = false, downPaymentHours = 1 }) {
  const hours = Math.max(1, Number(duration) || 1);
  const hourlyRates = Array.from({ length: hours }, (_, index) => roomRateForHour(variant, (Number(startHour) + index) % 24, guestCount));
  const roomCharge = roundMoney(hourlyRates.reduce((sum, rate) => sum + rate, 0));
  const corkageFee = hasCorkage ? CORKAGE_FEE : 0;
  const downPayment = roundMoney(hourlyRates.slice(0, Math.max(1, Number(downPaymentHours) || 1)).reduce((sum, rate) => sum + rate, 0));
  return { hourlyRates, roomCharge, corkageFee, amount: roundMoney(roomCharge + corkageFee), downPayment };
}

function formatTime(value) {
  const hour = parseHour(value, 17);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 || 12;
  return `${display} ${suffix}`;
}

export function variantRateLabel(variant) {
  const base = `₱${Number(variant?.price || 0).toLocaleString()}/hr`;
  const evening = variant?.pricingMode === 'time-based' && variant?.eveningPrice !== null && variant?.eveningPrice !== undefined && variant?.eveningPrice !== ''
    ? ` · ₱${Number(variant.eveningPrice).toLocaleString()}/hr from ${formatTime(variant.eveningStartTime)}`
    : '';
  const extra = Number(variant?.extraGuestFee) > 0
    ? ` · +₱${Number(variant.extraGuestFee).toLocaleString()}/extra guest/hr${Number(variant?.includedGuests) > 0 ? ` after ${Number(variant.includedGuests)} included` : ''}`
    : '';
  return `${base}${evening}${extra}`;
}
