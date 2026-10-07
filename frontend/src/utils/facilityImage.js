import { resolveImageUrl } from './resolveImageUrl';

export function facilityImage(image, _facilityName = '', _roomName = '', coverImage = '') {
  if (image) return resolveImageUrl(image);
  if (coverImage) return resolveImageUrl(coverImage);
  return '';
}
