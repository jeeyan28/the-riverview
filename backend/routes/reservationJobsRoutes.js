const express = require("express");
const { timingSafeEqual } = require("node:crypto");
const { runReservationJobs } = require("../utils/reservationJobs");
const router = express.Router();

router.get("/", async (req, res) => {
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : "";
  const actual = req.get("Authorization") || "";
  const left = Buffer.from(expected), right = Buffer.from(actual);
  if (!expected || left.length !== right.length || !timingSafeEqual(left, right)) return res.status(401).json({ message: "Unauthorized." });
  res.json(await runReservationJobs());
});
module.exports = { router, runReservationJobs };
