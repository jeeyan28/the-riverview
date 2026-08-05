ngrok http --url=https://childcare-pucker-blitz.ngrok-free.dev 3000

tree /F /A > structure.txt



### CHANGE THE EXPIRY OF CODE IN AUTH

## BackEnd/utils/otp.js
    const OTP_TTL_MS = 10 * 60 * 1000;

## Frontend/src/utils/otp.js

    export const OTP_EXPIRY_SECONDS = 10 * 60;

## Notes for future work
- **OTP config (backend, source of truth):** `BackEnd/utils/otp.js` exports `OTP_LENGTH`, `OTP_TTL_MS`, `RESEND_COOLDOWN_MS`, `OTP_REQUEST_WINDOW_MS`, `MAX_OTP_REQUESTS_PER_WINDOW`, `MAX_OTP_VERIFY_ATTEMPTS`, `PENDING_REGISTRATION_EXPIRY_MS`, plus `generateOtp`/`hashOtp`/`hashesMatch`/`checkAndBumpOtpRequestWindow`. `BackEnd/model/pendingRegistration.js`'s TTL index now derives from `PENDING_REGISTRATION_EXPIRY_MS`.
- **OTP config (frontend, mirrors backend):** `Frontend/src/utils/otp.js` exports `OTP_LENGTH`, `OTP_EXPIRY_SECONDS`, `RESEND_COOLDOWN_SECONDS`, `MAX_RESEND_ATTEMPTS`, `MAX_VERIFY_ATTEMPTS`, `formatCountdown()`. No shared package between BackEnd/Frontend — values must be kept in sync manually.
- Used by `/forgot-password`/`/verify-otp`, `/register`/`/register/resend-otp`/`/register/verify-otp`, and `/resend-verification`/`/verify-account-otp`.
- `BackEnd/utils/mailer.js`'s `sendOtpEmail(user, otp, purpose)` takes `purpose` `"reset"` or `"verify"`.
- `BackEnd/model/pendingRegistration.js`: staged signups (email unique, TTL from config). Deleted once verified.
- `BackEnd/model/user.js`: `isVerified` gates `/login` and `/forgot-password`. `verifyOtpHash`/`verifyOtpExpires` (select:false) mirror `resetOtpHash`/`resetOtpExpires`. `resetOtpAttempts`/`verifyOtpAttempts` (select:false) mirror `PendingRegistration.otpAttempts`; cap `/verify-otp` and `/verify-account-otp` respectively at `MAX_OTP_VERIFY_ATTEMPTS`. `otpWindowStart`/`otpResendCount` (select:false) mirror `PendingRegistration`'s same-named fields, letting `/resend-verification` reuse `checkAndBumpOtpRequestWindow` unmodified for its 5/hour cap.
- `BackEnd/routes/auth.js`: `/login` rejects unverified accounts (`403 unverified: true`); `/forgot-password` folds unverified into the generic non-response; `/google` sets/backfills `isVerified: true`; `/resend-verification` + `/verify-account-otp` handle verification for existing unverified `User` docs with no `PendingRegistration` left.
- `BackEnd/middleware/rateLimiter.js`: separate IP-based limiters (`loginLimiter`, `forgotPasswordLimiter`, `registerOtpLimiter`) — defense-in-depth alongside the per-email caps above, intentionally not merged into the OTP config.
- `BackEnd/scripts/backfillVerifiedUsers.js`: one-time migration marking pre-existing `User` docs verified. Already run.
- Frontend: `LoginForm.jsx` shows a "Resend Verification Code" flow on `unverified: true`, reusing `OtpInput`, `useCountdownClock`, and `utils/otp.js` constants. `AuthContext.jsx` has `resendAccountVerification(email)` / `verifyAccountOtp(email, otp)`.
- `RegisterForm.jsx`'s main fields are styled under `.rf-scope` (register.css); its OTP stage renders unscoped using login.css classes.
- `ForgotPasswordModal.jsx`'s `DEFAULT_SENT_COPY` (shown before the server's own message arrives) derives its minute count from `OTP_EXPIRY_SECONDS`. `RegisterForm.jsx`/`LoginForm.jsx` already used `formatCountdown` dynamically — no hardcoded copy there.

- `.login-card` in `login.css`: `max-width` widened 440px → 480px (applies to both Login and Register since RegisterForm reuses this class).

- `Frontend/src/pages/Admin/Reports.jsx`: entirely static/mock — `REPORT_ITEMS` (names, fake dates) and the date-range inputs' `defaultValue`s aren't wired to real report data; Export/Generate Report buttons have no handlers. Not a duplicate-config issue, just unfinished. Flagged, not touched.
- `Frontend/src/pages/Admin/Analytics.jsx`: entirely static/mock — revenue/room-split/hourly-traffic numbers are hardcoded, not fetched. Same pattern as Reports.jsx. Flagged, not touched.
- **Hardcoded, duplicates existing config:** `Dashboard.jsx`, `Forecasting.jsx`, `BookingModal.jsx` each locally redeclare `const API_BASE_URL = 'http://localhost:3000'` instead of importing the shared one from `services/api.js` (already used by `ForgotPasswordModal.jsx`, per Final Audit Critical #1). Flagged, not changed.
- `.login-card` in `login.css`: `max-width` widened 440px → 480px (applies to both Login and Register).




## Hardcoded Values Found (not modified — logged only)

| File | Location | Value | Purpose | Duplicate? | Dependents |
|---|---|---|---|---|---|
| `BackEnd/routes/auth.js` | `DUMMY_HASH` const | fixed bcrypt hash string | timing-attack mitigation on login | No | `/login` only |
| `BackEnd/routes/auth.js` | `/reset-password` session expiry | `10 * 60 * 1000` (10 min) inline | reset-session token TTL | Similar pattern to `OTP_TTL_MS` in `utils/otp.js` but not sourced from it — candidate to centralize | Forgot-password flow only |
| `BackEnd/model/user.js` | `MAX_ATTEMPTS`, `LOCK_TIME_MS` | `5`, `15 * 60 * 1000` | login lockout policy | No, but not in a shared config module | Login flow only |
| `Frontend/src/pages/Admin/Profile.jsx` | top of file | `const API_BASE_URL = 'http://localhost:3000';` | API base URL | **Yes — duplicates `services/api.js`'s `API_BASE_URL`.** `AuthContext.jsx` imports it from there; these files redeclare it locally instead. Real risk: breaks in any non-localhost deployment. | `ProfileModal.jsx`, `BookingModal.jsx` (below) have the identical duplicate |
| `Frontend/src/components/ProfileModal.jsx` | top of file | `const API_BASE_URL = 'http://localhost:3000';` | API base URL | Same as above | `Profile.jsx`, `BookingModal.jsx` |
| `Frontend/src/components/BookingModal.jsx` | top of file | `const API_BASE_URL = 'http://localhost:3000';` | API base URL | Same as above — found while reviewing this file for Task 8 | `Profile.jsx`, `ProfileModal.jsx` |
| `BackEnd/routes/userRoutes.js` | `POST /`, `PUT /:id/password` | `password.length < 8` | admin-created-user / password-change minimum length | Partial duplicate — `routes/auth.js`'s `isPasswordStrongEnough()` enforces the same 8-char minimum plus upper/lower/digit composition, but isn't exported/reused here. Frontend now enforces the full policy (Task 7); backend still the weaker check. | `routes/auth.js` `/register`, `/reset-password` |
| `BackEnd/routes/userRoutes.js` | `GET /` | `.limit(500)` | max rows returned to the Manage Users panel | No | "Manage Users" panel only |
| `BackEnd/utils/mailer.js` | `COPY.reset`/`COPY.verify` intro text | literal `"10 minutes"` in the email copy | human-readable OTP expiry | Duplicates `OTP_TTL_MS` in `utils/otp.js` in spirit — if that constant ever changes, this string won't update with it | Registration + password-reset emails |

## Edge Cases Flagged for Product Review
- `routes/auth.js` `/google`: a Google profile with no `family_name` now gets `lastName: "-"` (schema requires it non-empty). No product decision was made on the right fallback — review before shipping.
- See Task 8's "Behavior change" note above re: network-failure handling in `ProfileModal.jsx`/`BookingModal.jsx`.



### Hardcoded Values Review
When reviewing or modifying any file, identify hardcoded values that may be candidates for centralization.

For each one found:
* Record it in `PROJECT_PROGRESS.md`.
* Include the file, location, the hardcoded value, and its purpose.
* Note whether it appears to duplicate an existing configuration, constant, utility, helper, or environment variable.
* Identify any other files or features that may depend on the same value.
* Do **not** replace the value unless it is part of the current task or explicitly requested.

### TASK 
Update the Booking Modal room cards.

UI Changes:
- Remove the floating "AVAILABLE" badge above the room list.
- Every room card should display its own availability badge.
- The badge should be placed inside the room card, preferably in the top-right corner or below the room name, and update dynamically for every room.

Availability should be calculated from:
Free Rooms = Total Rooms - Booked Rooms

Display:

🟢 If 3 or more rooms are free:
- "3 of 5 Rooms Available"

🟡 If only 2 or less room is free:
- "Only 1 of 5 Room Left"

🔴 If no rooms are free:
- "Fully Booked"
- Disable selecting that room card.
- Reduce opacity and change cursor to not-allowed.

Requirements:
- This must work automatically for every facility/room type (Billiards, KTV, Basketball Court, etc.).
- The badge must be generated dynamically from the existing booking availability logic.
- Do not hardcode values.
- Do not change backend APIs or booking logic.
- Preserve the existing room card layout, spacing, colors, and responsive behavior. Only replace the old availability indicator with the new per-room availability badge.