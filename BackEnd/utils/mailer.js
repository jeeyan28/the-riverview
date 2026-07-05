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

async function sendPasswordResetEmail(user, resetUrl) {
  await transporter.sendMail({
    from: `"The Riverview" <${process.env.GMAIL_USER}>`,
    to: user.email,
    subject: "Reset your Riverview password",
    html: `
      <p>Hi ${user.firstname},</p>
      <p>We received a request to reset your password. This link expires in 1 hour:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you didn't request this, you can ignore this email — your password will not change.</p>
    `,
  });
}

module.exports = { sendPasswordResetEmail };  