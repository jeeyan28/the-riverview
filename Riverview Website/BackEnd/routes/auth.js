const express = require("express");
const router = express.Router();
const User = require("../model/user");

// ── Register a new user
router.post("/register", async (req, res) => {
  try {
    const { firstname, lastname, phone, email, password } = req.body;

    if (!firstname || !lastname || !phone || !email || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const user = new User({ firstname, lastname, phone, email, password });
    await user.save();

    res.status(201).json({ message: "Account created successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    res.json({
      message: "Login successful.",
      user: {
        id:        user._id,
        firstname: user.firstname,
        lastname:  user.lastname,
        email:     user.email,
        role:      user.role,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;