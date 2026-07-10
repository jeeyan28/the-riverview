import { getPasswordChecks } from '../utils/password';

// Password requirements checklist — shared by every password-entry screen
// (Registration, Reset/Forgot Password, Admin Profile, Add User, Customer
// Profile) so the pattern can't drift between them.
//
// Shows once the user starts typing. Every requirement is listed (not just
// the unmet ones) and stays visible even once all are met; each item flips
// from an unmet ✕ to a met check as its rule is satisfied.
function PasswordRequirementsList({ password }) {
  if (!password) return null;

  return (
    <ul className="password-requirements">
      {getPasswordChecks(password).map((req) => (
        <li key={req.key} className={req.met ? 'met' : 'unmet'}>
          <span className="requirement-icon">{req.met ? '✓' : '✕'}</span>
          {req.label}
        </li>
      ))}
    </ul>
  );
}

export default PasswordRequirementsList;