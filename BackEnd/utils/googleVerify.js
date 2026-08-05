const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage"
);

function mapGoogleProfile(payload) {
  return {
    email: (payload.email || "").toLowerCase(),
    firstname: payload.given_name || "",
    lastname: payload.family_name || "",
    googleId: payload.sub,
    picture: payload.picture || "",
    emailVerified: !!payload.email_verified,
  };
}

async function verifyGoogleIdToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return mapGoogleProfile(ticket.getPayload());
}

async function exchangeGoogleAuthCode(code) {
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error("Google did not return an ID token.");
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return mapGoogleProfile(ticket.getPayload());
}

module.exports = { verifyGoogleIdToken, exchangeGoogleAuthCode };