const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs"); // matches the package used in model/user.js
const router = express.Router();

const User = require("../model/user");
const { loginLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { sendPasswordResetEmail } = require("../utils/mailer");
const { verifyGoogleIdToken } = require("../utils/googleVerify");
const { isAdminRole, getEffectivePermissions } = require("../utils/permissions");

// Fixed bcrypt hash of a random value, used only to burn CPU time when a user
// doesn't exist, so login response time doesn't reveal whether the email is
// registered. Generate your own once with `bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10)`
// and hardcode the result here (do NOT regenerate it per-process).
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8i8U6vJXd8yGdIeYbFqOZ2P0zqhkbG";

function sanitizeUser(user) {
  return {
    _id: user._id,
    firstname: user.firstname,
    lastname: user.lastname,
    email: user.email,
    phone: user.phone,
    role: user.role,
    permissions: isAdminRole(user.role) ? getEffectivePermissions(user) : undefined,
  };
}

// Minimum password policy shared by register + reset, so the two paths can't drift.
function isPasswordStrongEnough(password) {
  return typeof password === "string" && password.length >= 8;
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

// ── Register a new (customer) user — unchanged behavior, still role: "user"
router.post("/register", async (req, res) => {
  try {
    const { firstname, lastname, phone, password } = req.body;
    const emailLower = (req.body.email || "").toLowerCase();

    if (!firstname || !lastname || !phone || !emailLower || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    if (!isPasswordStrongEnough(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const existing = await User.findOne({ email: emailLower });
    if (existing) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const user = new User({
      firstname,
      lastname,
      phone,
      email: emailLower,
      password
    });
    await user.save();

    res.status(201).json({ message: "Account created successfully." });
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
      user = await User.create({
        firstname: profile.firstname || "Guest",
        lastname: profile.lastname || "",
        phone: "",
        email: profile.email,
        googleId: profile.googleId,
        role: "user",
      });
    } else {
      if (!user.isActive) {
        return res.status(403).json({ message: "This account has been deactivated." });
      }
      if (!user.googleId) user.googleId = profile.googleId;
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

// ── Forgot password
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required." });

  const user = await User.findOne({ email: String(email).toLowerCase() });

  // Always the same response, so this can't be used to find out which emails exist.
  const generic = { message: "If an account exists for that email, a reset link has been sent." };
  if (!user || !user.isActive) return res.json(generic);

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.resetPasswordToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await user.save();

  const resetUrl = `${process.env.APP_BASE_URL}/reset-password.html?token=${rawToken}`;
  try {
    await sendPasswordResetEmail(user, resetUrl);
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }

  res.json(generic);
});

// ── Reset password
// Reuses forgotPasswordLimiter as cheap defense-in-depth against abuse; swap in a
// dedicated resetPasswordLimiter in middleware/rateLimiter.js if you want different
// thresholds (token is 32 random bytes, so brute force isn't the real concern here).
router.post("/reset-password/:token", forgotPasswordLimiter, async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!isPasswordStrongEnough(password)) {
    return res.status(400).json({ message: "Password must be at least 8 characters." });
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() },
    isActive: true, // don't let a reset go through for an account deactivated after the token was issued
  }).select("+resetPasswordToken +resetPasswordExpires");

  if (!user) {
    return res.status(400).json({ message: "Reset link is invalid or has expired." });
  }

  user.password = password; // re-hashed by the pre-save hook in model/user.js
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  user.lockUntil = undefined;
  user.failedLoginAttempts = 0;
  await user.save();

  res.json({ message: "Password updated. You can now log in." });
});

// ── Current session user (used on page load to confirm still logged in + get role)
router.get("/me", ensureAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.userId);

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  res.json({ user: sanitizeUser(user) });
});
// ── Logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out." });
  });
});

module.exports = router;