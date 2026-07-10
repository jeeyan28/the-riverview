const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs"); // matches the package used in model/user.js
const router = express.Router();

const User = require("../model/user");
const PendingRegistration = require("../model/pendingRegistration");
const { loginLimiter, forgotPasswordLimiter, registerOtpLimiter } = require("../middleware/rateLimiter");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { sendOtpEmail } = require("../utils/mailer");
const {
  OTP_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_OTP_VERIFY_ATTEMPTS,
  generateOtp,
  hashOtp,
  hashesMatch,
  checkAndBumpOtpRequestWindow,
} = require("../utils/otp");
const { verifyGoogleIdToken } = require("../utils/googleVerify");
const { normalizeName, validateName } = require("../utils/nameValidation");
const { isAdminRole, getEffectivePermissions, roleLabel } = require("../utils/permissions");

// Fixed bcrypt hash of a random value, used only to burn CPU time when a user
// doesn't exist, so login response time doesn't reveal whether the email is
// registered. Generate your own once with `bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10)`
// and hardcode the result here (do NOT regenerate it per-process).
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8i8U6vJXd8yGdIeYbFqOZ2P0zqhkbG";

function sanitizeUser(user) {
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    roleLabel: roleLabel(user.role),
    permissions: isAdminRole(user.role) ? getEffectivePermissions(user) : undefined,
    // Lets the client gate profile-detail editing: Google-linked accounts
    // source their name from Google, not a manual edit form (see
    // FEATURE_REQUESTS.md). Boolean only — never send the raw googleId.
    isGoogleAccount: !!user.googleId,
    // Google's photo, shown instead of the letter-avatar for Google
    // accounts. Only ever populated when isGoogleAccount is true.
    profilePicture: user.googleId ? user.googleProfilePicture || "" : "",
  };
}

// Minimum password policy shared by register + reset, so the two paths can't drift.
function isPasswordStrongEnough(password) {
  if (typeof password !== "string" || password.length < 8) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

// Promise wrapper so we can `await` session regeneration/save cleanly below.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}
function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

// ── Register a new (customer) user — Part 3: stages the signup as a
// PendingRegistration and emails an OTP; the User document itself isn't
// created until that OTP is verified (Part 5/7).
router.post("/register", registerOtpLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const emailLower = (req.body.email || "").toLowerCase();

    const firstNameNormalized = normalizeName(req.body.firstName);
    const lastNameNormalized = normalizeName(req.body.lastName);
    const firstNameError = validateName(req.body.firstName, "First name");
    const lastNameError = validateName(req.body.lastName, "Last name");

    if (!emailLower || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (firstNameError) {
      return res.status(400).json({ message: firstNameError, field: "firstName" });
    }
    if (lastNameError) {
      return res.status(400).json({ message: lastNameError, field: "lastName" });
    }

    if (!isPasswordStrongEnough(password)) {
      return res.status(400).json({
        message: "Password must be at least 8 characters and include uppercase, lowercase, and a number.",
      });
    }

    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Reuse an existing pending signup for this email instead of creating a
    // second one — just refresh its data and OTP, per FEATURE_REQUESTS.md.
    let pending = await PendingRegistration.findOne({ email: emailLower });
    if (pending) {
      pending.firstName = firstNameNormalized;
      pending.lastName = lastNameNormalized;
      pending.passwordHash = passwordHash;
    } else {
      pending = new PendingRegistration({
        firstName: firstNameNormalized,
        lastName: lastNameNormalized,
        email: emailLower,
        passwordHash,
        otpHash: "",       // set below, before save
        otpExpires: new Date(0), // set below, before save
      });
    }

    // Both a brand-new signup and a resubmission for an existing pending
    // record count against the same per-email hourly cap — otherwise
    // someone could bypass /register/resend-otp's limit just by resubmitting
    // the registration form instead.
    const windowCheck = checkAndBumpOtpRequestWindow(pending);
    if (!windowCheck.allowed) {
      return res.status(429).json({
        message: "Too many verification codes requested for this email. Please try again later.",
        retryAfterSeconds: windowCheck.retryAfterSeconds,
      });
    }

    const otp = generateOtp();
    pending.otpHash = hashOtp(otp);
    pending.otpExpires = new Date(Date.now() + OTP_TTL_MS);
    pending.otpAttempts = 0;
    await pending.save();

    try {
      await sendOtpEmail(pending, otp, "verify");
    } catch (err) {
      console.error("Failed to send registration OTP email:", err);
    }

    res.status(200).json({
      message: "Verification code sent.",
      email: emailLower,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Resend registration OTP — Part 6. Shares the same per-email hourly cap
// as /register (checkAndBumpOtpRequestWindow) plus a 60s cooldown, and
// resets otpAttempts the same way a fresh OTP always does.
router.post("/register/resend-otp", registerOtpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const emailLower = String(email).toLowerCase();
    const pending = await PendingRegistration.findOne({ email: emailLower });

    if (!pending) {
      return res.status(400).json({ message: "No pending registration found for that email." });
    }

    const lastIssuedAt = pending.otpExpires.getTime() - OTP_TTL_MS;
    const msSinceIssued = Date.now() - lastIssuedAt;
    if (msSinceIssued < RESEND_COOLDOWN_MS) {
      return res.status(429).json({
        message: "Please wait before requesting another code.",
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - msSinceIssued) / 1000),
      });
    }

    const windowCheck = checkAndBumpOtpRequestWindow(pending);
    if (!windowCheck.allowed) {
      return res.status(429).json({
        message: "Too many verification codes requested for this email. Please try again later.",
        retryAfterSeconds: windowCheck.retryAfterSeconds,
      });
    }

    const otp = generateOtp();
    pending.otpHash = hashOtp(otp);
    pending.otpExpires = new Date(Date.now() + OTP_TTL_MS);
    pending.otpAttempts = 0;
    await pending.save();

    try {
      await sendOtpEmail(pending, otp, "verify");
    } catch (err) {
      console.error("Failed to send registration OTP email:", err);
    }

    res.json({ message: "A new verification code has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Verify registration OTP — Part 5 + Part 7 combined: consumes the
// PendingRegistration and creates the real, verified User in one step
// (there's no valid intermediate state between "OTP confirmed" and
// "account exists" to split these into two requests). Also enforces
// Part 6's max-verification-attempts cap.
router.post("/register/verify-otp", registerOtpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and code are required." });
    }

    const emailLower = String(email).toLowerCase();
    const pending = await PendingRegistration.findOne({ email: emailLower });

    const incorrect = { message: "Incorrect verification code." };
    const expired = { message: "That code has expired. Request a new one." };
    const tooManyAttempts = { message: "Too many incorrect attempts. Please request a new code." };

    // Covers both "never registered" and "already verified" (the pending
    // record is deleted on success, so a replayed/reused code lands here).
    if (!pending) {
      return res.status(400).json(incorrect);
    }
    if (pending.otpExpires.getTime() < Date.now()) {
      return res.status(400).json(expired);
    }
    if (pending.otpAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
      return res.status(429).json(tooManyAttempts);
    }

    const candidateHash = hashOtp(otp);
    if (!hashesMatch(candidateHash, pending.otpHash)) {
      pending.otpAttempts += 1;
      await pending.save();
      if (pending.otpAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
        return res.status(429).json(tooManyAttempts);
      }
      return res.status(400).json(incorrect);
    }

    // Guard a race where a second signup/verification for this email
    // completed between /register and now.
    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const user = new User({
      firstName: pending.firstName,
      lastName: pending.lastName,
      email: pending.email,
      password: pending.passwordHash, // already bcrypt-hashed — see model/user.js's skipPasswordHash guard
      role: "user",
      isVerified: true,
    });
    user.$locals.skipPasswordHash = true;
    await user.save();

    await PendingRegistration.deleteOne({ _id: pending._id });

    res.json({ message: "Your account has been created successfully. You can now sign in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Resend verification code — Part 8. For an existing User whose account
// isn't verified (e.g. created outside the registration OTP flow, so
// there's no PendingRegistration left to resend from). Reuses the same OTP
// primitives/email purpose as registration; stores the OTP on the User
// document itself, mirroring resetOtpHash/resetOtpExpires's pattern above.
router.post("/resend-verification", registerOtpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const emailLower = String(email).toLowerCase();
    const user = await User.findOne({ email: emailLower, isActive: true }).select(
      "+verifyOtpExpires +otpWindowStart +otpResendCount"
    );

    // Generic response either way — don't reveal whether the account exists.
    const generic = { message: "If that account needs verification, a code has been sent." };
    if (!user || user.isVerified) return res.json(generic);

    if (user.verifyOtpExpires) {
      const lastIssuedAt = user.verifyOtpExpires.getTime() - OTP_TTL_MS;
      const msSinceIssued = Date.now() - lastIssuedAt;
      if (msSinceIssued < RESEND_COOLDOWN_MS) {
        return res.status(429).json({
          message: "Please wait before requesting another code.",
          retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - msSinceIssued) / 1000),
        });
      }
    }

    // Same per-email hourly cap PendingRegistration enforces on registration
    // resends, reused unmodified — User has the same otpWindowStart/
    // otpResendCount fields checkAndBumpOtpRequestWindow expects.
    const windowCheck = checkAndBumpOtpRequestWindow(user);
    if (!windowCheck.allowed) {
      return res.status(429).json({
        message: "Too many verification codes requested for this email. Please try again later.",
        retryAfterSeconds: windowCheck.retryAfterSeconds,
      });
    }

    const otp = generateOtp();
    user.verifyOtpHash = hashOtp(otp);
    user.verifyOtpExpires = new Date(Date.now() + OTP_TTL_MS);
    user.verifyOtpAttempts = 0;
    await user.save();

    try {
      await sendOtpEmail(user, otp, "verify");
    } catch (err) {
      console.error("Failed to send verification OTP email:", err);
    }

    res.json(generic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Verify an existing account's OTP — Part 8's counterpart to
// /register/verify-otp, for accounts that already exist but aren't
// verified yet. Does not log the user in; they sign in normally afterward.
router.post("/verify-account-otp", registerOtpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and code are required." });
    }

    const emailLower = String(email).toLowerCase();
    const user = await User.findOne({ email: emailLower, isActive: true }).select(
      "+verifyOtpHash +verifyOtpExpires +verifyOtpAttempts"
    );

    const incorrect = { message: "Incorrect verification code." };
    const expired = { message: "That code has expired. Request a new one." };
    const tooManyAttempts = { message: "Too many incorrect attempts. Please request a new code." };

    if (!user || user.isVerified || !user.verifyOtpHash || !user.verifyOtpExpires) {
      return res.status(400).json(incorrect);
    }
    if (user.verifyOtpExpires.getTime() < Date.now()) {
      return res.status(400).json(expired);
    }
    if (user.verifyOtpAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
      return res.status(429).json(tooManyAttempts);
    }

    const candidateHash = hashOtp(otp);
    if (!hashesMatch(candidateHash, user.verifyOtpHash)) {
      user.verifyOtpAttempts += 1;
      await user.save();
      if (user.verifyOtpAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
        return res.status(429).json(tooManyAttempts);
      }
      return res.status(400).json(incorrect);
    }

    user.isVerified = true;
    user.verifyOtpHash = undefined;
    user.verifyOtpExpires = undefined;
    user.verifyOtpAttempts = 0;
    await user.save();

    res.json({ message: "Your email has been verified. You can now sign in." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Login (customers AND staff/manager/super_admin all use this same endpoint)
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() }).select("+password");

    if (!user) {
      // Burn roughly the same amount of time as a real bcrypt compare would,
      // so "no such user" and "wrong password" aren't distinguishable by timing.
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      return res.status(423).json({
        message: "Account temporarily locked due to repeated failed attempts. Try again in a few minutes.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "This account has been deactivated." });
    }

    // Part 8: unverified accounts can't sign in. Checked before the password
    // compare (same as isActive above) so the frontend can offer a resend
    // button without first requiring a correct password.
    if (!user.isVerified) {
      return res.status(403).json({
        message: "Please verify your email before signing in.",
        unverified: true,
      });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      await user.registerFailedLogin();
      return res.status(401).json({ message: "Invalid email or password." });
    }

    await user.registerSuccessfulLogin();

    // Regenerate the session on privilege change (anonymous -> authenticated) to
    // prevent session fixation: an attacker who set a session ID before login
    // must not be able to ride the victim's post-login session.
    await regenerateSession(req);

    req.session.userId = user._id.toString();
    req.session.role = user.role;
    await saveSession(req);

    res.json({ message: "Login successful.", user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Google sign-in (customers get created on the fly; staff/manager/super_admin
//    must already exist — Google can never grant someone admin access by itself)
router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "Missing Google credential." });

    const profile = await verifyGoogleIdToken(idToken);
    if (!profile.email || !profile.emailVerified) {
      return res.status(401).json({ message: "Google account email is not verified." });
    }

    let user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email }] });

    if (!user) {
      // New Google sign-in with no existing account → create as a regular customer.
      // lastName is required at the schema level (model/user.js); Google
      // almost always returns family_name, but a "-" fallback avoids a
      // save() failure on the rare profile that omits it. Flagged in
      // PROJECT_PROGRESS.md for review — no product decision was made here.
      user = await User.create({
        firstName: profile.firstname || "Guest",
        lastName: profile.lastname || "-",
        phone: "",
        email: profile.email,
        googleId: profile.googleId,
        googleProfilePicture: profile.picture || "",
        role: "user",
        // Google already confirmed profile.emailVerified above, so this
        // account is verified from creation — no OTP step needed.
        isVerified: true,
      });
    } else {
      if (!user.isActive) {
        return res.status(403).json({ message: "This account has been deactivated." });
      }
      if (!user.googleId) user.googleId = profile.googleId;
      // Google is the source of truth for a Google-linked account's name —
      // refresh it from the fresh profile on every login rather than only
      // at first sign-in, so a name changed on Google is reflected here too.
      if (profile.firstname) user.firstName = profile.firstname;
      if (profile.lastname) user.lastName = profile.lastname;
      if (profile.picture) user.googleProfilePicture = profile.picture;
      // Part 8: Google has already confirmed this email (checked above),
      // so linking/signing in with Google supersedes any prior unverified
      // state — an account should never be Google-locked-out.
      if (!user.isVerified) user.isVerified = true;
      await user.registerSuccessfulLogin();
    }

    // Same reasoning as /login: regenerate on privilege change to avoid session fixation.
    await regenerateSession(req);

    req.session.userId = user._id.toString();
    req.session.role = user.role;
    await saveSession(req);

    res.json({ message: "Login successful.", user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Google sign-in failed." });
  }
});

// ── Forgot password — sends a 6-digit OTP instead of a reset link.
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });

  const user = await User.findOne({ email: String(email).toLowerCase() });

  // Always the same response, so this can't be used to find out which emails exist.
  const generic = { message: "If an account exists for that email, a verification code has been sent." };
  // Part 8: unverified accounts can't use Forgot Password either — folded
  // into the same generic non-response as inactive/nonexistent accounts.
  if (!user || !user.isActive || !user.isVerified) return res.json(generic);

  // 6-digit OTP, uniformly distributed (avoids the modulo bias of % 1000000).
  const otp = generateOtp();

  // Overwriting the previous hash/expiry is what invalidates any prior OTP —
  // only the most recently issued code can ever verify.
  user.resetOtpHash = hashOtp(otp);
  user.resetOtpExpires = Date.now() + OTP_TTL_MS;
  user.resetOtpAttempts = 0;
  await user.save();

  try {
    await sendOtpEmail(user, otp, "reset");
  } catch (err) {
    console.error("Failed to send OTP email:", err);
  }

  res.json(generic);
});

// ── Verify OTP — consumes the OTP and issues a short-lived reset-session
// token that Part 5's password-reset step will require.
router.post("/verify-otp", forgotPasswordLimiter, async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ message: "Email and code are required." });
  }

  const user = await User.findOne({
    email: String(email).toLowerCase(),
    isActive: true,
  }).select("+resetOtpHash +resetOtpExpires +resetOtpAttempts");

  const incorrect = { message: "Incorrect verification code." };
  const expired = { message: "That code has expired. Request a new one." };
  const tooManyAttempts = { message: "Too many incorrect attempts. Please request a new code." };

  if (!user || !user.resetOtpHash || !user.resetOtpExpires) {
    return res.status(400).json(incorrect);
  }
  if (user.resetOtpExpires.getTime() < Date.now()) {
    return res.status(400).json(expired);
  }
  if (user.resetOtpAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
    return res.status(429).json(tooManyAttempts);
  }

  const candidateHash = hashOtp(otp);
  if (!hashesMatch(candidateHash, user.resetOtpHash)) {
    user.resetOtpAttempts += 1;
    await user.save();
    if (user.resetOtpAttempts >= MAX_OTP_VERIFY_ATTEMPTS) {
      return res.status(429).json(tooManyAttempts);
    }
    return res.status(400).json(incorrect);
  }

  const rawSessionToken = crypto.randomBytes(32).toString("hex");
  user.resetOtpHash = undefined;
  user.resetOtpExpires = undefined;
  user.resetOtpAttempts = 0;
  user.resetSessionTokenHash = crypto.createHash("sha256").update(rawSessionToken).digest("hex");
  user.resetSessionTokenExpires = Date.now() + 10 * 60 * 1000; // window to complete the password reset
  await user.save();

  res.json({ message: "Code verified.", resetSessionToken: rawSessionToken });
});


// ── Reset password (uses the resetSessionToken issued by /verify-otp)
router.post("/reset-password", forgotPasswordLimiter, async (req, res) => {
  const { resetSessionToken, password } = req.body;

  if (!resetSessionToken || !password) {
    return res.status(400).json({ message: "Missing reset session or password." });
  }

  if (!isPasswordStrongEnough(password)) {
    return res.status(400).json({
      message: "Password must be at least 8 characters and include uppercase, lowercase, and a number.",
    });
  }

  const hashedToken = crypto.createHash("sha256").update(resetSessionToken).digest("hex");
  const user = await User.findOne({
    resetSessionTokenHash: hashedToken,
    resetSessionTokenExpires: { $gt: Date.now() },
    isActive: true, // don't let a reset go through for an account deactivated after verification
  }).select("+resetSessionTokenHash +resetSessionTokenExpires");

  if (!user) {
    return res.status(400).json({ message: "Reset session has expired. Please verify your email again." });
  }

  user.password = password; // re-hashed by the pre-save hook in model/user.js
  user.resetSessionTokenHash = undefined;
  user.resetSessionTokenExpires = undefined;
  user.lockUntil = undefined;
  user.failedLoginAttempts = 0;
  await user.save();

  res.json({ message: "Password updated. You can now log in." });
});

// ── Current session user (used on page load to confirm still logged in + get role)
router.get("/me", ensureAuthenticated, async (req, res) => {
  // req.user was already loaded and confirmed active by ensureAuthenticated —
  // no need to hit the database again for the same document.
  res.json({ user: sanitizeUser(req.user) });
});
// ── Logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out." });
  });
});

module.exports = router;