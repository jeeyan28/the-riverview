// resolveImageUrl — replaces the duplicated resolveImageUrl() found in the
// original js/index.js, js/admin.js, and js/admin-profile.js (per the plan
// in utils/README.md). Takes an image value from the API and returns it
// unchanged for full http(s) URLs (e.g. Cloudinary) and local blob/data
// previews; otherwise prefixes it with SERVER_ORIGIN for /uploads paths.
//
import { API_BASE_URL as SERVER_ORIGIN } from '../services/api';

export function resolveImageUrl(image) {
  if (!image) return '';
  if (image.startsWith('blob:') || image.startsWith('data:')) return image;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${SERVER_ORIGIN}${image}`;
}
