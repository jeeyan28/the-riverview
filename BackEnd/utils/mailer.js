const nodemailer = require("nodemailer");
const { OTP_TTL_MS } = require("./otp");

const OTP_TTL_MINUTES = Math.round(OTP_TTL_MS / 60000);

const transporter = nodemailer.createTransport({
  service: "gmail",
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  <body style="margin:0; padding:0; background-color:#0A1628; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A1628; padding:40px 16px;">
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

async function sendReceiptEmail(booking) {
  const fullName = escapeHtml(booking.guestName || "Guest");
  const contact = escapeHtml(booking.guestContact || "—");
  const email = escapeHtml(booking.guestEmail || "—");
  const dateLabel = booking.date
    ? new Date(`${booking.date}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "—";
  const downPayment = Number(booking.downPayment || 0);
  const remaining = Math.max(0, Number(booking.amount || 0) - downPayment);
  const startHour = parseInt(String(booking.timeIn || "0").split(":")[0], 10) || 0;
  const durationHours = Number(booking.duration) || 0;
  const timeLabel = `${formatHour(startHour)} – ${formatHour(startHour + durationHours)}`;

  const rows = [
    ["Reservation Code", booking.reservationCode || "—"],
    ["Booked By", fullName],
    ["Contact No.", contact],
    ["Email", email],
    ["Room", booking.variantLabel || booking.roomLabel || "—"],
    ["Facility", booking.roomLabel || "—"],
    ["Date", dateLabel],
    ["Time", timeLabel],
    ["Duration", `${durationHours} hour(s)`],
    ["Guests", String(booking.guestCount || 1)],
  ];

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Booking Receipt</title>
  </head>
  <body style="margin:0; padding:0; background-color:#0A1628; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A1628; padding:40px 16px;">
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
                <p style="margin:0 0 6px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#00C9A7;">Booking Confirmed</p>
                <h1 style="margin:0 0 20px; font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.25; color:#ffffff; font-weight:700;">Your Booking Receipt</h1>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                  ${rows.map(([label, value]) => `<tr><td style="padding:8px 0; font-size:14px; color:#8A9BB0; border-bottom:1px solid rgba(255,255,255,0.08);">${label}</td><td style="padding:8px 0; font-size:14px; color:#ffffff; text-align:right; font-weight:600; border-bottom:1px solid rgba(255,255,255,0.08);">${escapeHtml(value)}</td></tr>`).join("")}
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                  <tr><td style="padding:8px 0; font-size:14px; color:#8A9BB0;">Downpayment Paid</td><td style="padding:8px 0; font-size:14px; color:#00C9A7; text-align:right; font-weight:700;">₱${downPayment.toLocaleString()}</td></tr>
                  <tr><td style="padding:8px 0; font-size:14px; color:#8A9BB0;">Remaining Balance</td><td style="padding:8px 0; font-size:14px; color:#e0a940; text-align:right; font-weight:700;">₱${remaining.toLocaleString()}</td></tr>
                </table>

                <p style="margin:0; padding-top:20px; border-top:1px solid rgba(255,255,255,0.08); font-size:13px; line-height:1.6; color:#8A9BB0;">
                  Please keep this receipt for your records. The remaining balance is paid upon arrival.
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

  const text = `Booking Receipt\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\nDownpayment Paid: ₱${downPayment.toLocaleString()}\nRemaining Balance: ₱${remaining.toLocaleString()}`;

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

module.exports = { sendOtpEmail, sendReceiptEmail };