const nodemailer = require("nodemailer");

// Uses a Gmail account + App Password (requires 2-Step Verification on that
// Google account): https://myaccount.google.com/apppasswords
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Escape the few characters that matter in an HTML context — user-controlled
// (firstname) so it can't break out of the markup below.
function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function sendPasswordResetEmail(user, resetUrl) {
  const firstname = escapeHtml(user.firstname);

  // Same palette as the site's login/reset-password pages (css/login.css):
  // navy #0A1628, teal #00C9A7, cream #F8F6F1, muted #8A9BB0. Email clients
  // don't reliably load Google Fonts, so Georgia/Helvetica stand in for
  // Playfair Display/Inter while keeping the same look and feel.
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your password</title>
  </head>
  <body style="margin:0; padding:0; background-color:#0A1628; font-family:Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A1628; padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:#0f1e35; border-radius:14px; overflow:hidden; border:1px solid rgba(255,255,255,0.08);">

            <!-- Header / logo -->
            <tr>
              <td style="padding:32px 40px 24px; text-align:center; border-bottom:1px solid rgba(255,255,255,0.08);">
                <span style="font-family:Georgia, 'Times New Roman', serif; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:.02em;">The Riverview</span>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px;">
                <p style="margin:0 0 6px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#00C9A7;">Account Recovery</p>
                <h1 style="margin:0 0 20px; font-family:Georgia, 'Times New Roman', serif; font-size:26px; line-height:1.25; color:#ffffff; font-weight:700;">Reset your password</h1>

                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#c9d3e0;">Hi ${firstname},</p>
                <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:#c9d3e0;">
                  We received a request to reset the password on your Riverview account. Click the button below to choose a new one. This link expires in <strong style="color:#ffffff;">1 hour</strong>.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
                  <tr>
                    <td align="center" style="border-radius:10px; background-color:#00C9A7;">
                      <a href="${resetUrl}" target="_blank" style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:700; color:#0A1628; text-decoration:none; border-radius:10px;">Set a new password</a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 8px; font-size:13px; line-height:1.6; color:#8A9BB0;">
                  Or copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 28px; font-size:13px; line-height:1.6; word-break:break-all;">
                  <a href="${resetUrl}" target="_blank" style="color:#00C9A7; text-decoration:underline;">${resetUrl}</a>
                </p>

                <p style="margin:0; padding-top:20px; border-top:1px solid rgba(255,255,255,0.08); font-size:13px; line-height:1.6; color:#8A9BB0;">
                  If you didn't request this, you can safely ignore this email — your password will not change.
                </p>
              </td>
            </tr>

            <!-- Footer -->
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

  const text = `Hi ${user.firstname},\n\nWe received a request to reset the password on your Riverview account. Reset it here (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password will not change.`;

  await transporter.sendMail({
    from: `"The Riverview" <${process.env.GMAIL_USER}>`,
    to: user.email,
    subject: "Reset your Riverview password",
    text,
    html,
  });
}

module.exports = { sendPasswordResetEmail };  