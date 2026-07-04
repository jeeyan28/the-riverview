const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Verifies a Google ID token (the `credential` returned by Google Identity
 * Services in the browser) and returns { email, firstname, lastname, googleId }.
 * Throws if the token is invalid/expired/wrong audience.
 */
async function verifyGoogleIdToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    email: (payload.email || "").toLowerCase(),
    firstname: payload.given_name || "",
    lastname: payload.family_name || "",
    googleId: payload.sub,
    emailVerified: !!payload.email_verified,
  };
}

module.exports = { verifyGoogleIdToken };
