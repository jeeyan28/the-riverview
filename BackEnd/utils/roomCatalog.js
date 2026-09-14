const PRESET_SERVICE_NAMES = Object.freeze(["Billiards", "KTV", "Court"]);

function canonicalServiceName(value) {
  const candidate = String(value || "").trim().toLowerCase();
  return PRESET_SERVICE_NAMES.find((name) => name.toLowerCase() === candidate) || null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { PRESET_SERVICE_NAMES, canonicalServiceName, escapeRegExp };
