const express = require("express");
const router = express.Router();
const Room = require("../model/room");
const Booking = require("../model/booking");

// ── List all bookings (optionally filter by status/category)
router.get("/", async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;

    const bookings = await Booking.find(filter).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Create a booking (guest booking flow + admin Manual Booking modal)
router.post("/", async (req, res) => {
  try {
    const { guestName, guestContact, roomId, date, timeIn, duration, paymentMethod, status } = req.body;

    if (!guestName || !roomId || !date || !timeIn || !duration) {
      return res.status(400).json({ message: "guestName, roomId, date, timeIn and duration are required." });
    }

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Selected room does not exist." });

    const booking = new Booking({
      guestName,
      guestContact: guestContact || "",
      room: room._id,
      roomLabel: room.roomNumber || room.name,
      category: room.category,
      date,
      timeIn,
      duration,
      amount: room.price * duration,
      status: status || "Pending",
      paymentMethod: paymentMethod || "Cash"
    });

    await booking.save();
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Update a booking (e.g. change status to Active/Done/Overdue)
router.put("/:id", async (req, res) => {
  try {
    const { status, duration, paymentMethod } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (duration !== undefined) update.duration = duration;
    if (paymentMethod !== undefined) update.paymentMethod = paymentMethod;

    const booking = await Booking.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Delete/cancel a booking
router.delete("/:id", async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    res.json({ message: "Booking deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;