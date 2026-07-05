const express = require("express");
const router = express.Router();
const Sale = require("../model/sale");
const { requirePermission } = require("../middleware/adminAuth");
const { PERMISSIONS } = require("../utils/permissions");

// ── List sales — supports the POS "today's transactions" list and Reports.
//    ?date=YYYY-MM-DD filters to that calendar day (server-local time).
router.get("/sales", requirePermission(PERMISSIONS.POS_ACCESS), async (req, res) => {
  try {
    const filter = {};
    if (req.query.date) {
      const start = new Date(`${req.query.date}T00:00:00`);
      const end = new Date(`${req.query.date}T23:59:59.999`);
      filter.createdAt = { $gte: start, $lte: end };
    }
    const sales = await Sale.find(filter).sort({ createdAt: -1 }).limit(500).populate("cashier", "firstname lastname");
    res.json(sales);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Ring up a sale — any POS-access role (staff/manager/super_admin).
router.post("/sales", requirePermission(PERMISSIONS.POS_ACCESS), async (req, res) => {
  try {
    const { items, discount, paymentMethod, room, booking, note } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required." });
    }

    const cleanItems = items.map(it => ({
      name: String(it.name || "").trim(),
      price: Number(it.price),
      quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
    }));

    if (cleanItems.some(it => !it.name || !Number.isFinite(it.price) || it.price < 0)) {
      return res.status(400).json({ message: "Every item needs a name and a valid non-negative price." });
    }

    const subtotal = cleanItems.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const discountAmount = Math.max(0, Number(discount) || 0);
    const total = Math.max(0, subtotal - discountAmount);

    const sale = await Sale.create({
      items: cleanItems,
      subtotal,
      discount: discountAmount,
      total,
      paymentMethod: paymentMethod || "Cash",
      room: room || null,
      booking: booking || null,
      note: note || "",
      cashier: req.user._id,
    });

    res.status(201).json(sale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Void a completed sale — requires the stronger POS_REFUND permission
//    (manager/super_admin), never plain staff.
router.put("/sales/:id/void", requirePermission(PERMISSIONS.POS_REFUND), async (req, res) => {
  try {
    const sale = await Sale.findByIdAndUpdate(
      req.params.id,
      { status: "Voided", voidedBy: req.user._id, voidedAt: new Date() },
      { new: true }
    );
    if (!sale) return res.status(404).json({ message: "Sale not found." });
    res.json(sale);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;
