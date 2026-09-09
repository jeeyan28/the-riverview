const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const router = express.Router();

const User = require("../model/user");
const LoginHistory = require("../model/loginHistory");
const PendingRegistration = require("../model/pendingRegistration");
const { loginLimiter, forgotPasswordLimiter, registerOtpLimiter, guestCreationLimiter, guestRecoveryLoginLimiter } = require("../middleware/rateLimiter");
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
const { exchangeGoogleAuthCode } = require("../utils/googleVerify");
const { normalizeName, validateName } = require("../utils/nameValidation");
const { isAdminRole, getEffectivePermissions, roleLabel } = require("../utils/permissions");
const { isPasswordStrongEnough, PASSWORD_POLICY_MESSAGE } = require("../utils/passwordPolicy");
const { GUEST_EMAIL_DOMAIN } = require("../utils/constants");
const { validate } = require("../middleware/validate");
const {
  registerSchema,
  emailSchema,
  emailOtpSchema,
  otpSchema,
  guestSchema,
  guestRecoveryLoginSchema,
  claimEmailStartSchema,
  googleCodeSchema,
  loginSchema,
  resetPasswordSchema,
  emptyBodySchema,
} = require("../validation/authSchemas");

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
    isGoogleAccount: !!user.googleId,
    isGuest: !!user.isGuest,
    profilePicture: user.googleId ? user.googleProfilePicture || "" : "",
  };
}

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

async function logLoginAttempt(req, { user, email, status, reason = "", method = "password" }) {
  try {
    await LoginHistory.create({
      user: user ? user._id : undefined,
      name: user ? `${user.firstName} ${user.lastName}`.trim() : "",
      email: (user ? user.email : email || "").toLowerCase(),
      role: user ? user.role : "user",
      method,
      status,
      reason,
      ip: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });
  } catch (err) {
    console.error("Failed to record login history:", err);
  }
}

router.post("/register", registerOtpLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { password } = req.body;
    const emailRaw = String(req.body.email || "").trim();
    const emailLower = emailRaw.toLowerCase();

    const firstNameNormalized = normalizeName(req.body.firstName);
    const lastNameNormalized = normalizeName(req.body.lastName);
    const firstNameError = validateName(req.body.firstName, "First name");
    const lastNameError = validateName(req.body.lastName, "Last name");

    if (firstNameError) {
      return res.status(400).json({ message: firstNameError, field: "firstName" });
    }
    if (lastNameError) {
      return res.status(400).json({ message: lastNameError, field: "lastName" });
    }
    if (!emailRaw && !password) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (!emailRaw) {
      return res.status(400).json({ message: "Email is required.", field: "email" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return res.status(400).json({ message: "Enter a valid email address.", field: "email" });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required.", field: "password" });
    }
    if (!isPasswordStrongEnough(password)) {
      return res.status(400).json({
        message: PASSWORD_POLICY_MESSAGE,
        field: "password",
      });
    }

    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, User.SALT_ROUNDS);

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
        otpHash: "",
        otpExpires: new Date(0),
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

    res.status(200).json({
      message: "Verification code sent.",
      email: emailLower,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/register/resend-otp", registerOtpLimiter, validate(emailSchema), async (req, res) => {
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

router.post("/register/verify-otp", registerOtpLimiter, validate(emailOtpSchema), async (req, res) => {
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

    const existingUser = await User.findOne({ email: emailLower });
    if (existingUser) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const user = new User({
      firstName: pending.firstName,
      lastName: pending.lastName,
      email: pending.email,
      password: pending.passwordHash,
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

router.post("/resend-verification", registerOtpLimiter, validate(emailSchema), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    const emailLower = String(email).toLowerCase();
    const user = await User.findOne({ email: emailLower, isActive: true }).select(
      "+verifyOtpExpires +otpWindowStart +otpResendCount"
    );

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

router.post("/verify-account-otp", registerOtpLimiter, validate(emailOtpSchema), async (req, res) => {
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

router.post("/guest", guestCreationLimiter, validate(guestSchema), async (req, res) => {
  try {
    const firstNameError = validateName(req.body.firstName, "First name");
    const lastNameError = validateName(req.body.lastName, "Last name");
    if (firstNameError || lastNameError) {
      return res.status(400).json({ message: firstNameError || lastNameError, field: firstNameError ? "firstName" : "lastName" });
    }

    const user = await User.create({
      firstName: normalizeName(req.body.firstName),
      lastName: normalizeName(req.body.lastName),
      phone: "",
      email: `guest_${crypto.randomUUID()}@${GUEST_EMAIL_DOMAIN}`,
      role: "user",
      isGuest: true,
      isVerified: true,
      isActive: true,
    });

    await logLoginAttempt(req, { user, status: "success", method: "guest" });

    await regenerateSession(req);

    req.session.userId = user._id.toString();
    req.session.role = user.role;
    await saveSession(req);

    res.status(201).json({ message: "Guest session started.", user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// GUEST_ACCOUNT_PLAN.md Section 2: the customer-facing counterpart to
// POST /api/users/:id/recover (routes/userRoutes.js). Verifies the one-time
// temp email/password an admin relayed to the customer. This is the only
// place a soft-deleted guest is considered restored — issuing the temp
// credentials (the admin side) does not clear guestDeletedAt on its own.
router.post("/guest-recovery-login", guestRecoveryLoginLimiter, validate(guestRecoveryLoginSchema), async (req, res) => {
  try {
    const { tempEmail, tempPassword } = req.body;
    if (!tempEmail || !tempPassword) {
      return res.status(400).json({ message: "Temporary email and password are required." });
    }

    const invalid = { message: "Invalid or expired recovery credentials." };

    const user = await User.findOne({
      guestRecoveryEmailHash: hashOtp(String(tempEmail).trim()),
      isGuest: true,
    }).select("+guestRecoveryPasswordHash +guestRecoveryExpiresAt");

    if (!user || !user.guestRecoveryExpiresAt || user.guestRecoveryExpiresAt.getTime() < Date.now()) {
      await logLoginAttempt(req, { email: tempEmail, status: "failed", reason: "Invalid or expired guest recovery credentials", method: "guest-recovery" });
      return res.status(400).json(invalid);
    }

    if (!hashesMatch(hashOtp(String(tempPassword)), user.guestRecoveryPasswordHash)) {
      await logLoginAttempt(req, { user, status: "failed", reason: "Wrong recovery password", method: "guest-recovery" });
      return res.status(400).json(invalid);
    }

    user.guestDeletedAt = null;
    user.isActive = true;
    user.guestRecoveryEmailHash = undefined;
    user.guestRecoveryPasswordHash = undefined;
    user.guestRecoveryExpiresAt = undefined;
    await user.save();

    await logLoginAttempt(req, { user, status: "success", method: "guest-recovery" });

    await regenerateSession(req);

    req.session.userId = user._id.toString();
    req.session.role = user.role;
    await saveSession(req);

    res.json({ message: "Welcome back! Your account has been restored.", user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

function requireGuest(req, res, next) {
  if (!req.user.isGuest) {
    return res.status(403).json({ message: "Only guest accounts can be claimed." });
  }
  next();
}

router.post("/guest/claim/email/start", registerOtpLimiter, ensureAuthenticated, requireGuest, validate(claimEmailStartSchema), async (req, res) => {
  try {
    const { password } = req.body;
    const emailRaw = String(req.body.email || "").trim();
    const emailLower = emailRaw.toLowerCase();

    if (!emailRaw) {
      return res.status(400).json({ message: "Email is required.", field: "email" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return res.status(400).json({ message: "Enter a valid email address.", field: "email" });
    }
    if (!password) {
      return res.status(400).json({ message: "Password is required.", field: "password" });
    }
    if (!isPasswordStrongEnough(password)) {
      return res.status(400).json({ message: PASSWORD_POLICY_MESSAGE, field: "password" });
    }

    const existingUser = await User.findOne({ email: emailLower, _id: { $ne: req.user._id } });
    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists.", field: "email" });
    }

    const passwordHash = await bcrypt.hash(password, User.SALT_ROUNDS);

    const user = await User.findById(req.user._id).select(
      "+verifyOtpHash +verifyOtpExpires +verifyOtpAttempts +otpWindowStart +otpResendCount"
    );

    const windowCheck = checkAndBumpOtpRequestWindow(user);
    if (!windowCheck.allowed) {
      return res.status(429).json({
        message: "Too many verification codes requested. Please try again later.",
        retryAfterSeconds: windowCheck.retryAfterSeconds,
      });
    }

    const otp = generateOtp();
    user.pendingClaimEmail = emailLower;
    user.pendingClaimPasswordHash = passwordHash;
    user.verifyOtpHash = hashOtp(otp);
    user.verifyOtpExpires = new Date(Date.now() + OTP_TTL_MS);
    user.verifyOtpAttempts = 0;
    await user.save();

    try {
      await sendOtpEmail({ email: emailLower, firstName: user.firstName, lastName: user.lastName }, otp, "verify");
    } catch (err) {
      console.error("Failed to send claim OTP email:", err);
    }

    res.json({ message: "Verification code sent.", email: emailLower });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/guest/claim/email/resend-otp", registerOtpLimiter, ensureAuthenticated, requireGuest, validate(emptyBodySchema), async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      "+pendingClaimEmail +verifyOtpExpires +otpWindowStart +otpResendCount"
    );

    if (!user.pendingClaimEmail) {
      return res.status(400).json({ message: "No pending claim request. Start again." });
    }

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

    const windowCheck = checkAndBumpOtpRequestWindow(user);
    if (!windowCheck.allowed) {
      return res.status(429).json({
        message: "Too many verification codes requested. Please try again later.",
        retryAfterSeconds: windowCheck.retryAfterSeconds,
      });
    }

    const otp = generateOtp();
    user.verifyOtpHash = hashOtp(otp);
    user.verifyOtpExpires = new Date(Date.now() + OTP_TTL_MS);
    user.verifyOtpAttempts = 0;
    await user.save();

    try {
      await sendOtpEmail({ email: user.pendingClaimEmail, firstName: user.firstName, lastName: user.lastName }, otp, "verify");
    } catch (err) {
      console.error("Failed to send claim OTP email:", err);
    }

    res.json({ message: "A new verification code has been sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/guest/claim/email/verify-otp", registerOtpLimiter, ensureAuthenticated, requireGuest, validate(otpSchema), async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "Code is required." });
    }

    const user = await User.findById(req.user._id).select(
      "+pendingClaimEmail +pendingClaimPasswordHash +verifyOtpHash +verifyOtpExpires +verifyOtpAttempts"
    );

    const incorrect = { message: "Incorrect verification code." };
    const expired = { message: "That code has expired. Request a new one." };
    const tooManyAttempts = { message: "Too many incorrect attempts. Please request a new code." };

    if (!user.pendingClaimEmail || !user.verifyOtpHash || !user.verifyOtpExpires) {
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

    const existingUser = await User.findOne({ email: user.pendingClaimEmail, _id: { $ne: user._id } });
    if (existingUser) {
      user.pendingClaimEmail = undefined;
      user.pendingClaimPasswordHash = undefined;
      user.verifyOtpHash = undefined;
      user.verifyOtpExpires = undefined;
      user.verifyOtpAttempts = 0;
      await user.save();
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    user.email = user.pendingClaimEmail;
    user.password = user.pendingClaimPasswordHash;
    user.isGuest = false;
    user.pendingClaimEmail = undefined;
    user.pendingClaimPasswordHash = undefined;
    user.verifyOtpHash = undefined;
    user.verifyOtpExpires = undefined;
    user.verifyOtpAttempts = 0;
    user.$locals.skipPasswordHash = true;
    await user.save();

    res.json({ message: "Your account has been saved.", user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

router.post("/guest/claim/google", ensureAuthenticated, requireGuest, validate(googleCodeSchema), async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Missing Google credential." });

    const profile = await exchangeGoogleAuthCode(code);
    if (!profile.email || !profile.emailVerified) {
      return res.status(401).json({ message: "Google account email is not verified." });
    }

    const existingUser = await User.findOne({
      $or: [{ googleId: profile.googleId }, { email: profile.email }],
      _id: { $ne: req.user._id },
    });
    if (existingUser) {
      return res.status(409).json({ message: "That Google account is already linked to another user." });
    }

    const user = await User.findById(req.user._id);
    user.email = profile.email;
    user.googleId = profile.googleId;
    user.googleProfilePicture = profile.picture || "";
    if (profile.firstname) user.firstName = profile.firstname;
    if (profile.lastname) user.lastName = profile.lastname;
    user.isGuest = false;
    user.isVerified = true;
    await user.save();

    res.json({ message: "Your account has been saved.", user: sanitizeUser(user) });
  } catch (err) {
    console.error(err);
    res.status(401).json({ message: "Google sign-in failed." });
  }
});

router.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() }).select("+password");

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      await logLoginAttempt(req, { email, status: "failed", reason: "No account found" });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      await logLoginAttempt(req, { user, status: "failed", reason: "Account locked" });
      return res.status(423).json({
        message: "Account temporarily locked due to repeated failed attempts. Try again in a few minutes.",
      });
    }

    if (!user.isActive) {
      await logLoginAttempt(req, { user, status: "failed", reason: "Account deactivated" });
      return res.status(403).json({ message: "This account has been deactivated." });
    }

    if (!user.isVerified) {
      await logLoginAttempt(req, { user, status: "failed", reason: "Email not verified" });
      return res.status(403).json({
        message: "Please verify your email before signing in.",
        unverified: true,
      });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      await user.registerFailedLogin();
      await logLoginAttempt(req, { user, status: "failed", reason: "Wrong password" });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    await user.registerSuccessfulLogin();
    await logLoginAttempt(req, { user, status: "success" });

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

router.post("/google", validate(googleCodeSchema), async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: "Missing Google credential." });

    const profile = await exchangeGoogleAuthCode(code);
    if (!profile.email || !profile.emailVerified) {
      return res.status(401).json({ message: "Google account email is not verified." });
    }

    let user = await User.findOne({ $or: [{ googleId: profile.googleId }, { email: profile.email }] });

    if (!user) {
      user = await User.create({
        firstName: profile.firstname || "Guest",
        lastName: profile.lastname || "-",
        phone: "",
        email: profile.email,
        googleId: profile.googleId,
        googleProfilePicture: profile.picture || "",
        role: "user",
        isVerified: true,
      });
    } else {
      if (!user.isActive) {
        await logLoginAttempt(req, { user, status: "failed", reason: "Account deactivated", method: "google" });
        return res.status(403).json({ message: "This account has been deactivated." });
      }
      if (!user.googleId) user.googleId = profile.googleId;
      if (profile.firstname) user.firstName = profile.firstname;
      if (profile.lastname) user.lastName = profile.lastname;
      if (profile.picture) user.googleProfilePicture = profile.picture;
      if (!user.isVerified) user.isVerified = true;
      await user.registerSuccessfulLogin();
    }

    await logLoginAttempt(req, { user, status: "success", method: "google" });

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

router.post("/forgot-password", forgotPasswordLimiter, validate(emailSchema), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });

  const user = await User.findOne({ email: String(email).toLowerCase() });

  const generic = { message: "If an account exists for that email, a verification code has been sent." };
  if (!user || !user.isActive || !user.isVerified) return res.json(generic);

  const otp = generateOtp();

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

router.post("/verify-otp", forgotPasswordLimiter, validate(emailOtpSchema), async (req, res) => {
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
  user.resetSessionTokenExpires = Date.now() + 10 * 60 * 1000;
  await user.save();

  res.json({ message: "Code verified.", resetSessionToken: rawSessionToken });
});

router.post("/reset-password", forgotPasswordLimiter, validate(resetPasswordSchema), async (req, res) => {
  const { resetSessionToken, password } = req.body;

  if (!resetSessionToken || !password) {
    return res.status(400).json({ message: "Missing reset session or password." });
  }

  if (!isPasswordStrongEnough(password)) {
    return res.status(400).json({
      message: PASSWORD_POLICY_MESSAGE,
    });
  }

  const hashedToken = crypto.createHash("sha256").update(resetSessionToken).digest("hex");
  const user = await User.findOne({
    resetSessionTokenHash: hashedToken,
    resetSessionTokenExpires: { $gt: Date.now() },
    isActive: true,
  }).select("+resetSessionTokenHash +resetSessionTokenExpires");

  if (!user) {
    return res.status(400).json({ message: "Reset session has expired. Please verify your email again." });
  }

  user.password = password;
  user.resetSessionTokenHash = undefined;
  user.resetSessionTokenExpires = undefined;
  user.lockUntil = undefined;
  user.failedLoginAttempts = 0;
  await user.save();

  res.json({ message: "Password updated. You can now log in." });
});

router.get("/me", ensureAuthenticated, async (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});
router.post("/logout", validate(emptyBodySchema), async (req, res) => {
  try {
    if (req.session && req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user && user.isGuest) {
        user.isActive = false;
        user.guestDeletedAt = new Date();
        await user.save();
      }
    }
  } catch (err) {
    console.error(err);
  }
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out." });
  });
});

module.exports = router;
