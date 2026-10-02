const nodemailer = require("nodemailer");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { OTP_TTL_MS } = require("./otp");
const { EMAIL_RE } = require("./constants");

const OTP_TTL_MINUTES = Math.round(OTP_TTL_MS / 60000);
const notificationLogo = readFileSync(path.join(__dirname, "../assets/riverview-logo.png"));

function reservationActionUrl(booking, action) {
  const origins = (process.env.APP_BASE_URL || '').split(',').map((origin) => origin.trim());
  const configured = process.env.APP_PUBLIC_URL || origins.find((origin) => /^https:\/\//i.test(origin)) || origins[0];
  try {
    const url = new URL(configured || 'http://localhost:5500');
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.pathname = '/';
    url.search = new URLSearchParams({ reservation: String(booking.reservationCode || booking._id || ''), action }).toString();
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 10000,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatHour(h) {
  const hh = ((Number(h) % 24) + 24) % 24;
  const period = hh >= 12 ? "PM" : "AM";
  let display = hh % 12;
  if (display === 0) display = 12;
  return `${display}:00 ${period}`;
}

const COPY = {
  reset: {
    eyebrow: "Account Recovery",
    heading: "Your verification code",
    intro: () =>
      `Use the code below to reset the password on your Riverview account. This code expires in <strong style="color:#ffffff;">${OTP_TTL_MINUTES} minutes</strong>.`,
    textIntro: () =>
      `Use this code to reset the password on your Riverview account (expires in ${OTP_TTL_MINUTES} minutes):`,
    subject: "Your Riverview verification code",
    footnote: "If you didn't request this, you can safely ignore this email — your password will not change.",
  },
  verify: {
    eyebrow: "Verify Your Email",
    heading: "Confirm your email address",
    intro: () =>
      `Use the code below to finish creating your Riverview account. This code expires in <strong style="color:#ffffff;">${OTP_TTL_MINUTES} minutes</strong>.`,
    textIntro: () =>
      `Use this code to finish creating your Riverview account (expires in ${OTP_TTL_MINUTES} minutes):`,
    subject: "Verify your email for Riverview",
    footnote: "If you didn't request this, you can safely ignore this email — no account will be created.",
  },
};

async function sendOtpEmail(user, otp, purpose = "reset") {
  const copy = COPY[purpose] || COPY.reset;
  const fullName = escapeHtml(`${user.firstName} ${user.lastName}`.trim());

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${copy.heading}</title>
  </head>
  <body style="margin:0; padding:0; background-color:#ffffff; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#0f1e35; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.08);">


            <tr>
              <td style="padding:32px 40px 24px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="font-family:Georgia, 'Times New Roman', serif; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:.02em;">The Riverview</span>
              </td>
            </tr>


            <tr>
              <td style="padding:40px;">
                <p style="margin:0 0 6px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#00C9A7;">${copy.eyebrow}</p>
                <h1 style="margin:0 0 20px; font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.25; color:#ffffff; font-weight:700;">${copy.heading}</h1>

                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#c9d3e0;">Hi ${fullName},</p>
                <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:#c9d3e0;">
                  ${copy.intro()}
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                  <tr>
                    <td align="center" style="border-radius:10px; background-color:#00C9A7; padding:16px 36px;">
                      <span style="font-family:Georgia, 'Times New Roman', serif; font-size:32px; font-weight:700; letter-spacing:.3em; color:#0A1628;">${otp}</span>
                    </td>
                  </tr>
                </table>

                <p style="margin:0; padding-top:20px; border-top:1px solid rgba(255,255,255,0.08); font-size:13px; line-height:1.6; color:#8A9BB0;">
                  ${copy.footnote}
                </p>
              </td>
            </tr>


            <tr>
              <td style="padding:20px 40px 32px; text-align:center;">
                <p style="margin:0; font-size:12px; color:#4a5d72;">© ${new Date().getFullYear()} The Riverview</p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const text = `Hi ${fullName},\n\n${copy.textIntro()}\n${otp}\n\n${copy.footnote}`;

  await transporter.sendMail({
    from: `"The Riverview" <${process.env.GMAIL_USER}>`,
    to: user.email,
    subject: copy.subject,
    text,
    html,
  });
}

function buildReceiptEmail(booking) {
  const fullName = booking.guestName || "—";
  const contact = booking.guestContact && !String(booking.guestContact).includes("@") ? booking.guestContact : "N/A";
  const email = booking.guestEmail || "—";
  const dateLabel = booking.date
    ? new Date(`${booking.date}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
    : "—";
  const bookedOnLabel = booking.createdAt
    ? new Date(booking.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
    : "—";
  const amount = Math.max(0, Number(booking.amount || 0));
  const paid = Math.max(0, Number(booking.paidAmount || 0), Number(booking.downPayment || 0));
  const paidOnline = Math.max(0, Number(booking.downPayment || 0));
  const paidLater = Math.max(0, paid - paidOnline);
  const remaining = Math.max(0, amount - paid);
  const startHour = parseInt(String(booking.timeIn || "0").split(":")[0], 10) || 0;
  const durationHours = Number(booking.duration) || 0;
  const timeLabel = `${formatHour(startHour)} – ${formatHour(startHour + durationHours)}`;
  const facility = booking.roomLabel || "—";
  const roomName = booking.variantLabel || booking.roomLabel || "—";
  const rescheduleUrl = reservationActionUrl(booking, 'reschedule');
  const cancelUrl = reservationActionUrl(booking, 'cancel');
  const actionLink = (url, label) => url ? `<a href="${escapeHtml(url)}" style="color:#075f55; font-weight:700; text-decoration:underline;">${label}</a>` : label;

  const rows = [
    ["Reservation Code", booking.reservationCode || "—"],
    ["Reserved by", fullName],
    ["Contact no.", contact],
    ["Email", email],
    ["Room", roomName],
    ["Guests", String(booking.guestCount || 1)],
    ["Reservation date", dateLabel],
    ["Time", `${timeLabel} (${durationHours} hour${durationHours === 1 ? "" : "s"})`],
    ["Reserved on", bookedOnLabel],
  ];

  const costRows = [
    ["Total amount", amount],
    ["Paid online", paidOnline],
    ...(paidLater > 0 ? [["Paid later", paidLater]] : []),
    ["Remaining balance", remaining],
  ];
  const venueDiscount = booking.paymentChoice === 'deposit' ? Math.max(0, Number(booking.eligibleDiscount || 0)) : 0;
  const venueDiscountNote = venueDiscount > 0
    ? durationHours === 1
      ? `Room discount ₱${venueDiscount.toLocaleString('en-PH')} is due back to the guest at the facility. Staff: verify this receipt before settling it.`
      : `Room discount ₱${venueDiscount.toLocaleString('en-PH')} is due against the guest's remaining balance at the facility. Staff: verify this receipt before settling it.`
    : '';

  const infoPairs = [
    [rows[1], rows[2]],
    [rows[3]],
    [rows[4], rows[5]],
    [rows[6], rows[7]],
    [rows[8]],
  ];
  const infoHtml = infoPairs.map((pair) => `<tr>${pair.map(([label, value]) => `<td width="50%" valign="top" style="padding:11px 16px 9px 0; vertical-align:top;"><div style="margin-bottom:8px; color:#667085; font-size:10px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;">${escapeHtml(label)}</div><div style="color:#172b35; font-size:15px; font-weight:600; line-height:1.35; overflow-wrap:anywhere;">${escapeHtml(value)}</div></td>`).join("")}${pair.length === 1 ? '<td width="50%"></td>' : ''}</tr>`).join("");
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reservation Receipt</title>
  </head>
  <body style="margin:0; padding:0; background-color:#f4f8f7; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f8f7; padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#ffffff; border:1px solid #dce8e4; border-radius:14px; overflow:hidden;">
            <tr>
              <td style="padding:30px 30px 22px; background-color:#0b7067; color:#ffffff;">
                <div style="color:#dcfff7; font-size:13px; font-weight:700; letter-spacing:.08em;">THE RIVERVIEW</div>
                <h1 style="margin:25px 0 12px; color:#ffffff; font-size:27px; line-height:1.2;">Reservation Confirmed</h1>
                <p style="margin:0 0 18px; color:#ffffff; font-size:14px; line-height:1.4;">Your reservation has been successfully created.</p>
                <div style="color:#ffffff; font-size:13px; font-weight:700;">${escapeHtml(facility)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:19px 30px 14px; background-color:#e9f8f5;">
                <div style="color:#496963; font-size:11px; font-weight:700; letter-spacing:.04em;">RESERVATION CODE</div>
                <div style="margin-top:8px; color:#075f55; font-size:18px; font-weight:700;">${escapeHtml(booking.reservationCode || "—")}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:27px 30px 32px; background-color:#ffffff;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${infoHtml}</table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 24px; background-color:#f1f6f5;">
                  ${costRows.map(([label, value]) => `<tr><td style="padding:11px 16px; font-size:14px; color:#52626a;">${escapeHtml(label)}</td><td align="right" style="padding:11px 16px; font-size:16px; color:${label === "Remaining balance" ? "#a15f08" : "#0b7067"}; font-weight:700; white-space:nowrap;">₱${Number(value || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}</td></tr>`).join("")}
                </table>
                ${venueDiscountNote ? `<p style="margin:0 0 20px; padding:12px 14px; background-color:#e9f8f5; color:#075f55; font-size:13px; font-weight:700; line-height:1.5;">${escapeHtml(venueDiscountNote)}</p>` : ''}
                <div style="padding-top:20px; border-top:1px solid #dce8e4; color:#52626a; font-size:13px; line-height:1.6;">
                  <h2 style="margin:0 0 10px; color:#172b35; font-size:16px;">Reservation Policy &amp; Important Reminder</h2>
                  <p style="margin:0 0 10px;">Please keep this receipt as proof of your confirmed reservation and present your Reservation Code when requesting assistance.</p>
                  <p style="margin:0 0 10px;">Guests who wish to ${actionLink(rescheduleUrl, 'reschedule')} must submit a request at least 24 hours before the scheduled reservation time through The Riverview’s official Facebook Page, support email, or the online reservation system. Rescheduling is subject to the availability of the requested new schedule and must not conflict with an existing confirmed reservation.</p>
                  <p style="margin:0 0 10px;">For ${actionLink(cancelUrl, 'cancellations')} or no-shows, the first-hour rental deposit is non-refundable. If the full reservation amount was paid, any amount exceeding the first-hour rate may be refunded upon approval. Full refunds or full rescheduling may be considered in cases of serious medical emergencies, accidents, verified system/payment errors, or cancellations made by The Riverview, subject to the required proof and approval.</p>
                  <p style="margin:0 0 10px;">Guests are expected to follow their reserved schedule since reservations are arranged consecutively. A brief 2–3 minute preparation period may occur between sessions for cleaning and preparation of the room or equipment.</p>
                  <p style="margin:0;">For rescheduling, refund requests, or billing concerns, please contact The Riverview’s official Facebook Page or <a href="mailto:support@theriverview.com" style="color:#075f55;">support@theriverview.com</a>.</p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  const text = `Reservation Confirmed\n\nYour reservation has been successfully created.\nFacility: ${facility}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${costRows.map(([label, value]) => `${label}: ₱${Number(value || 0).toLocaleString()}`).join("\n")}\n\nReservation Policy & Important Reminder\nPlease keep this receipt as proof of your confirmed reservation and present your Reservation Code when requesting assistance.\nGuests who wish to reschedule must submit a request at least 24 hours before the scheduled reservation time. Rescheduling depends on availability and must not conflict with a confirmed reservation.\nReschedule online: ${rescheduleUrl}\nFor cancellations or no-shows, the first-hour rental deposit is non-refundable. If the full reservation amount was paid, any amount exceeding the first-hour rate may be refunded upon approval. Full refunds or full rescheduling may be considered for serious medical emergencies, accidents, verified system/payment errors, or cancellations made by The Riverview, subject to proof and approval.\nRequest cancellation online: ${cancelUrl}\nGuests should follow their reserved schedule because reservations are arranged consecutively. A 2–3 minute preparation period may occur between sessions for cleaning and preparation.\nFor rescheduling, refund requests, or billing concerns, contact The Riverview's official Facebook Page or support@theriverview.com.`;

  return { html, text: venueDiscountNote ? `${text}\n\n${venueDiscountNote}` : text };
}

async function sendReceiptEmail(booking) {
  const { html, text } = buildReceiptEmail(booking);

  const recipients = new Set();
  if (booking.guestEmail && EMAIL_RE.test(booking.guestEmail)) recipients.add(booking.guestEmail);
  if (process.env.GMAIL_USER) recipients.add(process.env.GMAIL_USER);
  if (recipients.size === 0) return;

  await transporter.sendMail({
    from: `"The Riverview" <${process.env.GMAIL_USER}>`,
    to: Array.from(recipients).join(", "),
    subject: `Your Riverview Receipt — ${booking.reservationCode || ""}`,
    text,
    html,
  });
}

function buildNotificationEmail(notification) {
  const url = reservationActionUrl(notification, "closure");
  const details = notification.details || {};
  const variants = {
    closure: { label: "Venue closure", title: "Your reservation date is closed", action: "Choose reschedule or refund" },
    rescheduled: { label: "Schedule updated", action: "View updated reservation" },
    reopened: { label: "Venue reopened", action: "View reservation" },
    refund_processing: { label: "Refund update", action: "View refund status" },
    refund_completed: { label: "Refund processed", action: "View reservation" },
  };
  const variant = variants[notification.type] || { label: "Reservation update", action: "View reservation" };
  const title = variant.title || notification.title;
  const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(`${value}T12:00:00+08:00`))
    ? new Date(`${value}T12:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }) : value || "";
  const timeLabel = /^\d{2}:\d{2}$/.test(details.timeIn || "")
    ? `${formatHour(details.timeIn.split(":")[0]).replace(":00", `:${details.timeIn.split(":")[1]}`)}${details.duration ? ` · ${details.duration} hour${details.duration === 1 ? "" : "s"}` : ""}` : "";
  const amount = details.refundAmount === undefined || details.refundAmount === null ? "" : `₱${Number(details.refundAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
  const rows = [
    ["Reservation", notification.reservationCode],
    ["Facility", [details.roomLabel, details.variantLabel].filter(Boolean).join(" · ")],
    ["Date", dateLabel(details.date)], ["Time (Philippine time)", timeLabel],
    [notification.type === "closure" ? "Full refund available" : "Refund amount", amount],
    ["Payment method", details.paymentMethod],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  const paragraphs = notification.type === "closure" && details.closureName
    ? [`We’re closed on ${dateLabel(details.closureDate)} for ${details.closureName}.${details.closureNote ? ` ${details.closureNote}` : ""}`, "Your reservation is affected. Choose to reschedule or cancel for a full refund of any payment collected. No first-hour charge will be kept."]
    : String(notification.message || "").split(/\n\s*\n/);
  const options = notification.type === "closure" ? `<h2 style="margin:26px 0 10px;font-size:17px;line-height:1.4;color:#14243b">Your options</h2><p style="margin:0 0 10px;font-size:15px;line-height:1.7;color:#44556a"><strong style="color:#14243b">Reschedule.</strong> Choose a future, available slot. The normal cutoff and two-change limit do not apply to this closure.</p><p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#44556a"><strong style="color:#14243b">${Number(details.refundAmount) > 0 ? "Full refund." : "Cancel."}</strong> ${Number(details.refundAmount) > 0 ? "Cancel and return the payment through the original online method. Staff handles cash or manual payments." : "Cancel the reservation; any payment collected remains eligible for a full closure refund."}</p>` : "";
  const contactUrl = url ? new URL("/contact", url).toString() : "";
  const actionHtml = url ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 14px"><tr><td style="background:#126c63;border-radius:8px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:15px 22px;font-size:14px;line-height:1.4;font-weight:700;color:#ffffff;text-decoration:none">${escapeHtml(variant.action)}</a></td></tr></table><p style="margin:0;font-size:13px;line-height:1.7;color:#637287">Sign in to view your reservation. <a href="${escapeHtml(contactUrl)}" style="color:#126c63;text-decoration:underline">Contact the venue</a> if you need help or staff booked for you.</p>` : "";
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>@media only screen and (max-width:600px){.rv-email-shell{padding:16px 8px!important}.rv-email-content{padding:26px 22px!important}.rv-email-header{padding:22px!important}.rv-email-title{font-size:26px!important}}</style></head>
<body style="margin:0;padding:0;background:#f6f3ed;font-family:Arial,Helvetica,sans-serif;color:#14243b">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(notification.title)} · ${escapeHtml(notification.reservationCode)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ed"><tr><td class="rv-email-shell" align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe1e6;border-radius:16px;overflow:hidden">
<tr><td class="rv-email-header" style="padding:24px 32px;background:#14243b"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td width="76" valign="middle"><img src="cid:riverview-notification-logo" width="60" height="60" alt="The Riverview logo" style="display:block;width:60px;height:60px;border:0"></td><td valign="middle"><p style="margin:0 0 5px;font-size:20px;font-weight:700;letter-spacing:.01em;color:#ffffff">The Riverview</p><p style="margin:0;font-size:13px;color:#c7d5e5">Reservation &amp; payment updates</p></td></tr></table></td></tr>
<tr><td class="rv-email-content" style="padding:32px"><p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#126c63">${escapeHtml(variant.label)}</p><h1 class="rv-email-title" style="margin:0 0 20px;font-size:30px;line-height:1.2;letter-spacing:-.02em;color:#14243b">${escapeHtml(title)}</h1>
${details.guestName ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#44556a">Hi ${escapeHtml(details.guestName)},</p>` : ""}
${paragraphs.map(paragraph => `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#44556a">${escapeHtml(paragraph)}</p>`).join("")}
${actionHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-top:1px solid #dbe1e6;border-bottom:1px solid #dbe1e6">${rows.map(([label, value]) => `<tr><td valign="top" style="padding:10px 8px 10px 0;width:45%;font-size:13px;line-height:1.5;color:#637287">${escapeHtml(label)}</td><td valign="top" align="right" style="padding:10px 0;font-size:14px;line-height:1.5;font-weight:700;color:#14243b;word-break:break-word">${escapeHtml(value)}</td></tr>`).join("")}</table>
${options}
</td></tr><tr><td style="padding:18px 32px;background:#f3f6f8;border-top:1px solid #dbe1e6"><p style="margin:0;font-size:12px;line-height:1.6;color:#637287">This update is about your Riverview reservation. Keep your reservation code when contacting staff.</p></td></tr>
</table><p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#637287">© ${new Date().getFullYear()} The Riverview</p>
</td></tr></table></body></html>`;
  return {
    html,
    text: `${title}\n\n${paragraphs.join("\n\n")}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\n${url ? `${variant.action}: ${url}\nSign in to view your reservation. Contact the venue if staff booked for you: ${contactUrl}\n` : ""}`,
    attachments: [{ filename: "riverview-logo.png", content: notificationLogo, cid: "riverview-notification-logo", contentType: "image/png" }],
  };
}

async function sendNotificationEmail(notification) {
  if (notification.type === "refund_attention") return;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error("SMTP_NOT_CONFIGURED");
  if (!EMAIL_RE.test(notification.email || "")) throw new Error("INVALID_RECIPIENT");
  await transporter.sendMail({
    from: `"The Riverview" <${process.env.GMAIL_USER}>`, to: notification.email,
    subject: `${notification.title} — ${notification.reservationCode}`, ...buildNotificationEmail(notification),
  });
}

module.exports = { sendOtpEmail, sendReceiptEmail, buildReceiptEmail, sendNotificationEmail, buildNotificationEmail };
