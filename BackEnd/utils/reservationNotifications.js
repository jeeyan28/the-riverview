const Notification = require("../model/notification");
const Booking = require("../model/booking");
const User = require("../model/user");
const { EMAIL_RE } = require("./constants");
const { sendNotificationEmail } = require("./mailer");
const { refundTiming, outstandingClosureRefund, REFUND_PROCESSING_ESTIMATE } = require("./closurePolicy");

async function customerForBooking(booking, session) {
  const candidateId = booking.venueClosure?.customerUserId || (booking.source === "walk-in" ? null : booking.bookedBy);
  let user = candidateId ? await User.findById(candidateId).session(session || null) : null;
  // Staff-created reservations belong to the verified guest, never the staff
  // member who entered them. Exact email ownership is required for bell access.
  if (!user && EMAIL_RE.test(booking.guestEmail || "")) {
    user = await User.findOne({ email: booking.guestEmail.toLowerCase().trim(), isVerified: true }).session(session || null);
  }
  return { userId: user?._id, email: user?.email || booking.guestEmail || "" };
}

async function linkUnassignedReservationNotifications(user) {
  const owners = [{ source: { $ne: "walk-in" }, bookedBy: user._id, "venueClosure.customerUserId": null }, { "venueClosure.customerUserId": user._id }];
  if (user.isVerified && EMAIL_RE.test(user.email || "")) owners.push({ source: "walk-in", guestEmail: user.email.toLowerCase().trim(), "venueClosure.customerUserId": null });
  const bookings = await Booking.find({ "venueClosure.holidayId": { $exists: true }, $or: owners }).select("_id").lean();
  if (!bookings.length) return;
  // Repair legacy ownership without changing read state or resending email.
  await Notification.updateMany({ booking: { $in: bookings.map(booking => booking._id) }, user: null }, { $set: { user: user._id } });
}

function notificationCopy(booking, type) {
  const code = booking.reservationCode;
  const closure = booking.venueClosure || {};
  const timing = booking.paymentProvider === "xendit"
    ? "Your bank or wallet determines when the returned money appears."
    : refundTiming(booking.paymentMethod);
  const amount = Number(booking.closureRefund?.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
  const processed = Number(booking.closureRefund?.processedAmount || 0);
  const gatewayAmount = Math.min(Number(booking.closureRefund?.amount || 0), Math.max(0, Number(booking.downPayment ?? booking.closureRefund?.amount ?? 0) - Number(booking.closureRefund?.baseRefundedAmount || 0)));
  const manualRemainder = Number(booking.closureRefund?.amount || 0) - gatewayAmount;
  const online = ["paymongo", "xendit"].includes(booking.closureRefund?.provider || booking.paymentProvider) && gatewayAmount > 0;
  const returnRoute = manualRemainder > 0
    ? `₱${gatewayAmount.toLocaleString("en-PH", { minimumFractionDigits: 2 })} will be returned through your original ${booking.paymentMethod || "online payment"} method. The venue will arrange the remaining ₱${manualRemainder.toLocaleString("en-PH", { minimumFractionDigits: 2 })} paid separately and confirm its return timing with you.`
    : `Your online payment will be returned to your original ${booking.paymentMethod || "payment"} method.`;
  const requestedMessage = online
    ? `We received your request for a full ₱${amount} refund. ${returnRoute}\n\n${REFUND_PROCESSING_ESTIMATE}${manualRemainder > 0 ? " This applies to the online portion." : ""} We’ll notify you again by email and in your notification bell when the full refund is processed.\n\n${timing} This is separate from the processing estimate above.`
    : `We received your request for a full ₱${amount} refund. The venue will arrange the return of your cash or manually recorded payment and confirm the timing with you. You do not need to submit another request. We’ll notify you by email and in your notification bell after the payment is returned.`;
  const completedMessage = processed > 0
    ? processed < Number(booking.closureRefund?.amount) ? `₱${processed.toLocaleString("en-PH")} was sent through your original online payment method; staff recorded the remaining payment as returned. ${timing}` : `The payment was sent back through your original payment method. ${timing}`
    : "Staff has recorded the payment as returned.";
  const copies = {
    closure: {
      title: `Venue closed on ${closure.date}`,
      message: `We're closed for ${closure.name}. Your reservation ${code} (${booking.roomLabel}, ${booking.date} at ${booking.timeIn}) is affected.${closure.note ? ` ${closure.note}` : ""} You can reschedule without using your usual allowance${outstandingClosureRefund(booking) > 0 ? ", or cancel for a full refund of the amount paid" : ", or cancel"}. No first-hour charge will be kept for this closure.`,
    },
    rescheduled: { title: "Reservation rescheduled", message: `${code} is now booked for ${booking.date} at ${booking.timeIn}. This venue closure change did not use your usual reschedule allowance.` },
    reopened: { title: "Venue date reopened", message: `The closure affecting ${code} has been removed. Your original reservation on ${booking.date} at ${booking.timeIn} remains confirmed.` },
    refund_processing: { title: Number(booking.closureRefund?.amount) > 0 ? "Refund requested" : "Reservation cancelled", message: `Your reservation ${code} has been cancelled because of the venue closure.${Number(booking.closureRefund?.amount) > 0 ? `\n\n${requestedMessage}` : " There is no payment to refund."}` },
    refund_completed: { title: "Refund processed", message: `The full ₱${amount} refund for ${code} has been processed. ${completedMessage}` },
    refund_attention: { title: "Refund needs staff assistance", message: `Your reservation ${code} is cancelled and remains eligible for a full refund. ${Number(booking.closureRefund?.processedAmount) > 0 ? `₱${Number(booking.closureRefund.processedAmount).toLocaleString("en-PH")} has been processed online. ` : ""}Staff needs to arrange or verify the remaining refund. You do not need to submit another refund request.` },
  };
  return copies[type];
}

async function notifyReservation(booking, type, { session, suffix = "" } = {}) {
  const recipient = await customerForBooking(booking, session);
  const copy = notificationCopy(booking, type);
  const eventKey = `${booking.venueClosure?.holidayId}:${booking._id}:${type}:${suffix || booking.closureRefund?.requestId || ""}`;
  await Notification.findOneAndUpdate({ eventKey }, { $setOnInsert: {
    eventKey, user: recipient.userId, email: recipient.email,
    booking: booking._id, reservationCode: booking.reservationCode, type, ...copy,
    details: {
      guestName: booking.guestName, roomLabel: booking.roomLabel, variantLabel: booking.variantLabel,
      date: booking.date, timeIn: booking.timeIn, duration: booking.duration,
      closureDate: booking.venueClosure?.date, closureName: booking.venueClosure?.name, closureNote: booking.venueClosure?.note,
      refundAmount: type === "closure" ? outstandingClosureRefund(booking) : booking.closureRefund?.amount,
      paymentMethod: booking.paymentMethod,
    },
    emailStatus: type !== "refund_attention" && EMAIL_RE.test(recipient.email) ? "pending" : "skipped",
  } }, { upsert: true, returnDocument: "after", runValidators: true, session });
}

async function deliverNotificationEmails({ limit = 10, now = new Date() } = {}) {
  await Notification.updateMany({ type: "refund_attention", emailStatus: { $in: ["pending", "sending"] } }, { $set: { emailStatus: "skipped" } });
  // A lease lets failed SMTP deliveries survive server restarts. Sending is
  // at least once: a crash after SMTP acceptance can cause a delivery retry.
  const jobs = [];
  for (let i = 0; i < limit; i++) {
    const job = await Notification.findOneAndUpdate({
      emailStatus: { $in: ["pending", "sending"] }, emailRetryAt: { $lte: now },
      type: { $ne: "refund_attention" },
    }, { $set: { emailStatus: "sending", emailRetryAt: new Date(now.getTime() + 120000) }, $inc: { emailAttempts: 1 } }, { returnDocument: "after", sort: { createdAt: 1 } });
    if (!job) break;
    jobs.push(job);
  }
  await Promise.all(jobs.map(async job => {
    try {
      await sendNotificationEmail(job);
      await Notification.updateOne({ _id: job._id, emailStatus: "sending", emailAttempts: job.emailAttempts }, { $set: { emailStatus: "sent", emailSentAt: new Date(), emailLastError: "" } });
    } catch (error) {
      console.error(`Reservation email ${job._id} failed:`, error.code || error.name);
      const delay = Math.min(3600000, 60000 * 2 ** Math.min(job.emailAttempts, 6));
      await Notification.updateOne({ _id: job._id, emailStatus: "sending", emailAttempts: job.emailAttempts }, { $set: { emailStatus: "pending", emailRetryAt: new Date(Date.now() + delay), emailLastError: error.code || error.name || "SMTP error" } });
    }
  }));
  return jobs.length;
}

module.exports = { customerForBooking, linkUnassignedReservationNotifications, notificationCopy, notifyReservation, deliverNotificationEmails };
