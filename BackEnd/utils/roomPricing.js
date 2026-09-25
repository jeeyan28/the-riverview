const { CORKAGE_FEE } = require("./constants");
const AppError = require("./appError");

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function parsePaxCapacity(value) {
  if (!value) return null;
  const text = String(value);
  const paxMatches = [...text.matchAll(/(\d+)\s*(?:pax|guests?|people)/gi)].map((match) => Number(match[1]));
  const matches = paxMatches.length ? paxMatches : (text.match(/\d+/g) || []).map(Number);
  const capacity = matches.length ? Math.max(...matches) : 0;
  return capacity > 0 ? capacity : null;
}

function parseHour(value, fallback = 0) {
  const hour = Number.parseInt(String(value || "").split(":")[0], 10);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

function rateForHour(variant, hour, guestCount = 1) {
  const baseRate = Number(variant?.price);
  if (!Number.isFinite(baseRate) || baseRate < 0) {
    throw new AppError(400, "Could not determine a valid rate for this room.");
  }

  const hasEveningRate = variant?.eveningPrice !== null && variant?.eveningPrice !== undefined && variant?.eveningPrice !== "";
  const eveningRate = Number(variant?.eveningPrice);
  const eveningStart = parseHour(variant?.eveningStartTime, 17);
  const scheduledRate = variant?.pricingMode === "time-based" && hasEveningRate && Number.isFinite(eveningRate) && hour >= eveningStart
    ? eveningRate
    : baseRate;

  const guests = Math.max(1, Number(guestCount) || 1);
  const includedGuests = Math.max(0, Number(variant?.includedGuests) || 0);
  const extraGuestFee = Math.max(0, Number(variant?.extraGuestFee) || 0);
  const guestSurcharge = Math.max(0, guests - includedGuests) * extraGuestFee;
  return roundMoney(scheduledRate + guestSurcharge);
}

function calculateBookingPrice({ variant, basePrice, timeIn, duration, guestCount = 1, hasCorkage = false }) {
  const hours = Number(duration);
  const startHour = parseHour(timeIn, NaN);
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isInteger(startHour)) {
    throw new AppError(400, "A valid hourly schedule is required to calculate the price.");
  }

  const pricingVariant = variant || { price: basePrice };
  const hourlyRates = [];
  let roomCharge = 0;
  let remainingHours = hours;
  let index = 0;
  while (remainingHours > 0) {
    const rate = rateForHour(pricingVariant, (startHour + index) % 24, guestCount);
    const segment = Math.min(1, remainingHours);
    hourlyRates.push(rate);
    roomCharge += rate * segment;
    remainingHours -= segment;
    index += 1;
  }
  roomCharge = roundMoney(roomCharge);
  const corkageFee = hasCorkage ? CORKAGE_FEE : 0;

  return {
    hourlyRates,
    roomCharge,
    corkageFee,
    amount: roundMoney(roomCharge + corkageFee),
    unitPrice: hourlyRates[0],
  };
}

function computeDownPayment(hourlyRatesOrPrice, hours = 1) {
  const requestedHours = Math.max(1, Number(hours) || 1);
  if (Array.isArray(hourlyRatesOrPrice)) {
    return roundMoney(hourlyRatesOrPrice.slice(0, requestedHours).reduce((sum, rate) => sum + Number(rate || 0), 0));
  }
  return roundMoney(Math.max(0, Number(hourlyRatesOrPrice) || 0) * requestedHours);
}

function quoteOnlineBooking({ room, variant, basePrice, paymentChoice = "deposit", claimDiscount = false, selectedAddOns = [] }) {
  const roomCharge = Number(basePrice.roomCharge) || 0;
  const ownDiscount = variant?.discountPercent;
  const discountPercent = claimDiscount ? Math.max(0, Math.min(99, Number(ownDiscount === null || ownDiscount === undefined || ownDiscount === "" ? room.discountPercent : ownDiscount) || 0)) : 0;
  const eligibleDiscount = roundMoney(roomCharge * discountPercent / 100);
  const discountAmount = paymentChoice === "full" ? eligibleDiscount : 0;
  const names = selectedAddOns || [];
  if (new Set(names).size !== names.length) throw new AppError(400, "Choose each optional service only once.");
  const addOns = names.map((name) => {
    const item = (room.addOns || []).find((service) => service.name === name);
    if (!item) throw new AppError(400, "An optional service is no longer available. Please review your booking.");
    return { name: item.name, fee: Number(item.fee) };
  });
  const addOnFee = roundMoney(addOns.reduce((sum, item) => sum + item.fee, 0));
  const amount = roundMoney(roomCharge - discountAmount + addOnFee + Number(basePrice.corkageFee || 0));
  const downPayment = paymentChoice === "full" ? amount : Math.min(amount, computeDownPayment(basePrice.hourlyRates, 1));
  return { discountPercent, eligibleDiscount, discountAmount, addOns, addOnFee, amount, downPayment };
}

function repriceExistingBooking(basePrice, booking) {
  const roomCharge = Number(basePrice.roomCharge) || 0;
  const discountPercent = Math.max(0, Math.min(99, Number(booking.discountPercent) || 0));
  const eligibleDiscount = roundMoney(roomCharge * discountPercent / 100);
  const discountAmount = booking.paymentChoice === "full" ? eligibleDiscount : 0;
  const addOnFee = roundMoney((booking.addOns || []).reduce((sum, item) => sum + Number(item.fee || 0), 0));
  return {
    eligibleDiscount,
    discountAmount,
    addOnFee,
    amount: roundMoney(roomCharge - discountAmount + addOnFee + Number(basePrice.corkageFee || 0)),
  };
}

function calculateSessionExtension({ session, room, addedHours, startHour }) {
  const existingRates = Array.isArray(session.hourlyRates) ? session.hourlyRates.map(Number) : [];
  if (!existingRates.length && Number.isInteger(Number(session.duration))) {
    existingRates.push(...Array(Number(session.duration)).fill(Number(session.rate) || 0));
  }
  const fallbackRate = existingRates.at(-1) || Number(session.rate) || 0;
  const variant = room && !room.isTemporary && Number(room.price) > 0 ? room : { price: fallbackRate };
  const addedRates = Array.from({ length: addedHours }, (_, index) =>
    rateForHour(variant, (startHour + Number(session.duration) + index) % 24, session.guestCount)
  );
  return {
    amount: roundMoney(Number(session.amount) + addedRates.reduce((sum, rate) => sum + rate, 0)),
    hourlyRates: [...existingRates, ...addedRates],
  };
}

module.exports = {
  CORKAGE_FEE,
  calculateBookingPrice,
  computeDownPayment,
  quoteOnlineBooking,
  repriceExistingBooking,
  calculateSessionExtension,
  parsePaxCapacity,
  rateForHour,
};
