// Shared password policy for every password-entry flow (Registration,
// Forgot/Reset Password). Single source of truth so client-side validation
// and the requirements checklist UI can never drift out of sync with each
// other. Must match the password validation in BackEnd/routes/auth.js.
//
// Each rule is checked independently and its `label` is shown as-is
// whenever `test` fails, so multiple messages can be visible at once.
export const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'Password must be at least 8 characters.', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'Password must contain at least one uppercase letter.', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower', label: 'Password must contain at least one lowercase letter.', test: (p) => /[a-z]/.test(p) },
  { key: 'number', label: 'Password must contain at least one number.', test: (p) => /[0-9]/.test(p) },
];

export function getPasswordChecks(password) {
  return PASSWORD_REQUIREMENTS.map((req) => ({ ...req, met: req.test(password) }));
}

export function isPasswordStrongEnough(password) {
  return PASSWORD_REQUIREMENTS.every((req) => req.test(password));
}