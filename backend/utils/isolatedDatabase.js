function assertIsolatedDatabase(uri, kind) {
  if (!uri || !['test', 'demo'].includes(kind)) throw new Error(`An explicit ${kind} database URI is required.`);
  let url;
  try { url = new URL(uri); } catch { throw new Error('Invalid isolated database URI.'); }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol) || !new RegExp(`^riverview_${kind}_[a-z0-9_-]+$`).test(database)) {
    throw new Error(`Database name must begin riverview_${kind}_ and include a suffix.`);
  }
  if (uri === process.env.MONGO_URI && process.env.APP_MODE !== kind) throw new Error('The application database cannot be used for isolated cleanup.');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Isolated test/demo databases must use a local MongoDB replica set.');
  return database;
}
function assertDemoEnvironment(env = process.env) {
  if (env.APP_MODE !== 'demo') return false;
  assertIsolatedDatabase(env.DEMO_MONGO_URI, 'demo');
  const secrets = ['PAYMONGO_SECRET_KEY', 'PAYMONGO_PUBLIC_KEY', 'PAYMONGO_WEBHOOK_SECRET', 'XENDIT_SECRET_KEY', 'XENDIT_WEBHOOK_TOKEN', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  if (secrets.some(name => env[name])) throw new Error('Demo mode refuses external-service credentials.');
  if (env.NODE_ENV === 'production') throw new Error('Local demo mode cannot run as production.');
  return true;
}
module.exports = { assertIsolatedDatabase, assertDemoEnvironment };
