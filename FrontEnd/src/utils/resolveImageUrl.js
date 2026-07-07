// resolveImageUrl — replaces the duplicated resolveImageUrl() found in the
// original js/index.js, js/admin.js, and js/admin-profile.js (per the plan
// in utils/README.md). Takes an image value from the API and returns it
// unchanged if it's already a full http(s) URL (e.g. Cloudinary), otherwise
// prefixes it with SERVER_ORIGIN (relative path case, e.g. a local /uploads
// path). This exact branching is preserved on purpose — do not simplify it
// away, since Cloudinary URLs must never be prefixed.
//
// SERVER_ORIGIN is still hardcoded here, matching every other page's
// hardcoded API_BASE_URL (see Login.jsx). Phase 9 (Backend Integration)
// will centralize this into src/services/api.js.
const SERVER_ORIGIN = 'http://localhost:3000';

export function resolveImageUrl(image) {
  if (!image) return '';
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${SERVER_ORIGIN}${image}`;
}
