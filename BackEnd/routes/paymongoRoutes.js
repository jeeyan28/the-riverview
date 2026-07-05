const express = require("express");
const router = express.Router();
const Booking = require("../model/booking");
const Room = require("../model/room");
const { ensureAuthenticated } = require("../middleware/adminAuth");
const { validateAndPriceBooking, computeDownPayment } = require("../utils/bookingHelper");
const { createCheckoutSession, retrieveCheckoutSession, verifyWebhookSignature } = require("../utils/paymongo");
const { isAdminRole } = require("../utils/permissions");

// Where to send the customer back to after PayMongo's hosted checkout page.
// Falls back to the first configured frontend origin (see server.js's CORS
// allowedOrigins) if PAYMONGO_RETURN_BASE_URL isn't set separately.
function getReturnBaseUrl() {
  return (
    process.env.PAYMONGO_RETURN_BASE_URL ||
    (process.env.APP_BASE_URL || "").split(",")[0]?.trim() ||
    "http://localhost:5500"
  );
}

// ── Create an automatic online-payment checkout — logged-in customers only.
//    Mirrors POST /api/bookings (same validation, same down-payment math)
//    but instead of requiring a screenshot upload, it:
//      1. creates the booking as "Awaiting Online Payment" / paymentProvider "paymongo"
//      2. opens a PayMongo Checkout Session for the down payment
//      3. returns the checkout_url for the frontend to redirect the customer to
//    The booking is only ever moved to "Confirmed"/"Paid" automatically, by
//    the webhook below — never by this endpoint, and never by an admin click.
router.post("/checkout", ensureAuthenticated, async (req, res) => {
  try {
    const { guestName, guestContact, guestEmail, guestCount: guestCountRaw, specialRequests, roomId, variantLabel, date, timeIn, duration: durationRaw } = req.body;
    const duration = Number(durationRaw);
    const guestCount = guestCountRaw !== undefined && guestCountRaw !== "" ? Number(guestCountRaw) : 1;

    if (!guestName) {
      return res.status(400).json({ message: "guestName, roomId, date, timeIn and duration are required." });
    }

    let room, amount, unitPrice;
    try {
      ({ room, amount, unitPrice } = await validateAndPriceBooking({ roomId, variantLabel, date, timeIn, duration, isAdminBooking: false, guestCount }));
    } catch (e) {
      return res.status(e.status || 500).json({ message: e.message || "Server error." });
    }

    // Down payment = the first hour's rate, not a percentage of the total —
    // see computeDownPayment() in utils/bookingHelper.js for the single
    // source of truth this mirrors.
    const downPayment = computeDownPayment(unitPrice);

    const booking = new Booking({
      guestName,
      guestContact: guestContact || "",
      guestEmail: guestEmail || "",
      guestCount: Number.isFinite(guestCount) && guestCount > 0 ? guestCount : 1,
      specialRequests: specialRequests || "",
      room: room._id,
      roomLabel: room.roomNumber || room.name,
      variantLabel: variantLabel || null,
      date,
      timeIn,
      duration,
      amount,
      paymentMethod: "PayMongo",
      paymentProvider: "paymongo",
      bookedBy: req.session.userId,
      source: "online",
      status: "Awaiting Online Payment",
      paymentStatus: "Unpaid",
      downPayment,
    });
    await booking.save();

    const base = getReturnBaseUrl();
    let session;
    try {
      session = await createCheckoutSession({
        amountPesos: downPayment,
        description: `Down payment — ${room.roomNumber || room.name} (${date} ${timeIn})`,
        referenceNumber: String(booking._id),
        successUrl: `${base}/index.html?paymongo=success&bookingId=${booking._id}`,
        cancelUrl: `${base}/index.html?paymongo=cancel&bookingId=${booking._id}`,
        customerEmail: guestEmail || undefined,
        customerName: guestName,
      });
    } catch (paymongoErr) {
      // Roll back the booking we just created so a failed PayMongo call
      // (e.g. missing/invalid API key while you're still setting this up)
      // doesn't leave a dangling "Awaiting Online Payment" slot blocking
      // the calendar.
      await Booking.findByIdAndDelete(booking._id);
      console.error("PayMongo checkout session creation failed:", paymongoErr);
      return res.status(502).json({ message: paymongoErr.message || "Could not start online payment. Please try again." });
    }

    booking.paymongoCheckoutSessionId = session.data.id;
    await booking.save();

    res.status(201).json({
      bookingId: booking._id,
      checkoutUrl: session.data.attributes.checkout_url,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Poll a booking's payment status — used by the frontend right after the
//    customer is redirected back from PayMongo's checkout page, in case the
//    webhook hasn't landed yet. Also re-verifies directly against PayMongo's
//    API rather than trusting the redirect alone.
router.get("/status/:bookingId", ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    // Only the guest who made it (or an admin) should be able to poll this.
    if (String(booking.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Not allowed." });
    }

    if (booking.paymentStatus === "Paid" || !booking.paymongoCheckoutSessionId) {
      return res.json({ status: booking.status, paymentStatus: booking.paymentStatus });
    }

    // Not confirmed yet locally — ask PayMongo directly as a fallback in case
    // our webhook is delayed or hasn't been configured yet.
    const session = await retrieveCheckoutSession(booking.paymongoCheckoutSessionId);
    const paymentIntent = session?.data?.attributes?.payment_intent;
    const isPaid = paymentIntent?.attributes?.status === "succeeded" ||
      (Array.isArray(paymentIntent?.attributes?.payments) &&
        paymentIntent.attributes.payments.some(p => p?.attributes?.status === "paid"));

    if (isPaid && booking.paymentStatus !== "Paid") {
      booking.status = "Confirmed";
      booking.paymentStatus = "Paid";
      const paidPayment = paymentIntent?.attributes?.payments?.find(p => p?.attributes?.status === "paid");
      if (paidPayment) booking.paymongoPaymentId = paidPayment.id;
      await booking.save();
    }

    res.json({ status: booking.status, paymentStatus: booking.paymentStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Cancel an unpaid PayMongo checkout — called when the customer lands back
//    on cancel_url (or backs out) so their held slot doesn't stay blocked
//    forever waiting for a payment that isn't coming. No-ops safely if the
//    booking already got paid in the meantime (race with the webhook).
router.post("/cancel/:bookingId", ensureAuthenticated, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found." });

    if (String(booking.bookedBy) !== String(req.user._id) && !isAdminRole(req.user.role)) {
      return res.status(403).json({ message: "Not allowed." });
    }
    if (booking.paymentProvider !== "paymongo") {
      return res.status(400).json({ message: "Not an online-payment booking." });
    }

    if (booking.paymentStatus === "Paid") {
      // Already paid (e.g. webhook landed a moment before this call) — do
      // not cancel a booking that's actually been paid for.
      return res.json({ status: booking.status, paymentStatus: booking.paymentStatus });
    }
    if (booking.status === "Awaiting Online Payment") {
      booking.status = "Cancelled";
      await booking.save();
    }
    res.json({ status: booking.status, paymentStatus: booking.paymentStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ── Webhook receiver — PayMongo calls this automatically the moment a
//    Checkout Session is paid. This is what makes payment "automatic": no
//    admin ever needs to click Approve for a PayMongo booking.
//
//    IMPORTANT: this route is mounted in server.js with express.raw(), NOT
//    express.json(), because signature verification needs the exact raw
//    bytes PayMongo sent — parsing it to an object first and re-stringifying
//    would (almost always) produce different bytes and break the signature
//    check. See webhookHandler below.
async function webhookHandler(req, res) {
  let event;
  try {
    verifyWebhookSignature(req.body.toString("utf8"), req.headers["paymongo-signature"]);
    event = JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    console.error("PayMongo webhook signature check failed:", err.message);
    return res.status(400).json({ message: "Invalid signature." });
  }

  // Always ack quickly with 2xx once verified — PayMongo retries on
  // non-2xx/timeouts, and we don't want retries piling up while we do our
  // own (idempotent) processing below.
  res.status(200).json({ received: true });

  try {
    const eventType = event?.data?.attributes?.type;
    const resource = event?.data?.attributes?.data;

    if (eventType === "checkout_session.payment.paid") {
      const checkoutSessionId = resource?.id;
      if (!checkoutSessionId) return;

      const booking = await Booking.findOne({ paymongoCheckoutSessionId: checkoutSessionId });
      if (!booking) {
        console.warn(`PayMongo webhook: no booking found for checkout session ${checkoutSessionId}`);
        return;
      }
      if (booking.paymentStatus === "Paid") return; // already processed (webhook can be delivered more than once)

      booking.status = "Confirmed";
      booking.paymentStatus = "Paid";
      const paymentIntent = resource?.attributes?.payment_intent;
      const paidPayment = paymentIntent?.attributes?.payments?.find(p => p?.attributes?.status === "paid");
      if (paidPayment) booking.paymongoPaymentId = paidPayment.id;
      booking.reviewedAt = new Date(); // auto-"reviewed" by PayMongo, not an admin — reviewedBy stays unset
      await booking.save();
    }
  } catch (err) {
    console.error("Error processing PayMongo webhook:", err);
  }
}

module.exports = { router, webhookHandler };
