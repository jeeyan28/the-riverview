// Minimum password policy shared by every account-creation/password-change
// route: auth.js's /register + /reset-password, and userRoutes.js's
// admin-create-user (POST /) and password-change (PUT /:id/password).
// Mirrors Frontend/src/utils/password.js's PASSWORD_REQUIREMENTS (same
// rules, same order: length, uppercase, lowercase, number) — keep both in sync.
function isPasswordStrongEnough(password) {
  if (typeof password !== "string" || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

const PASSWORD_POLICY_MESSAGE =
  "Password must be at least 8 characters and include uppercase, lowercase, and a number.";

module.exports = { isPasswordStrongEnough, PASSWORD_POLICY_MESSAGE };