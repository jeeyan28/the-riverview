// Password policy mirrors frontend/src/utils/password.js.
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
