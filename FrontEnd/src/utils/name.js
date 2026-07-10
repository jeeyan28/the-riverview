// Shared name policy, reused for both First Name and Last Name (identical
// rules for each — see FEATURE_REQUESTS.md). Mirrors
// BackEnd/utils/nameValidation.js — keep both in sync.

const NAME_PATTERN = /^[A-Za-z\s'.-]+$/;
const HAS_LETTER = /[A-Za-z]/;

// Trims and collapses internal whitespace runs to a single space.
export function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

// Returns '' when valid, or the matching user-facing error message.
// `label` (e.g. "First name", "Last name") is interpolated into the
// message so one function serves both fields without duplicating logic.
export function validateName(name, label = 'Name') {
  const normalized = normalizeName(name);
  if (!normalized) return `${label} is required.`;
  if (normalized.length < 3 || normalized.length > 100) {
    return `${label} must be between 3 and 100 characters.`;
  }
  if (!NAME_PATTERN.test(normalized)) {
    return `${label} can only contain letters, spaces, apostrophes ('), hyphens (-), and periods (.).`;
  }
  if (!HAS_LETTER.test(normalized)) return `${label} must contain at least one letter.`;
  return '';
} 