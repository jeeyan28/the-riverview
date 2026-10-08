const path = require('node:path');
const { spawn } = require('node:child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { assertDemoEnvironment, assertIsolatedDatabase } = require('../utils/isolatedDatabase');

let replica;
async function main() {
  process.env.APP_MODE = 'demo';
  if (!process.env.DEMO_MONGO_URI) {
    replica = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION || '8.2.6' }, instanceOpts: [{ port: 27028 }], replSet: { count: 1, name: 'riverview-demo', storageEngine: 'wiredTiger' } });
    process.env.DEMO_MONGO_URI = replica.getUri('riverview_demo_local');
  }
  assertIsolatedDatabase(process.env.DEMO_MONGO_URI, 'demo');
  assertDemoEnvironment();
  const accounts = await require('./seedDemo').seedDemo();
  const env = { ...process.env, MONGO_URI: process.env.DEMO_MONGO_URI, NODE_ENV: 'development', PORT: process.env.DEMO_API_PORT || '3000', APP_BASE_URL: 'http://localhost:5501,http://127.0.0.1:5501', SESSION_SECRET: 'synthetic-local-demo-session-secret-only', CRON_SECRET: 'synthetic-local-demo-cron-only', VITE_DEMO_MODE: 'true', VITE_API_URL: '', VITE_GOOGLE_CLIENT_ID: '', VITE_PAYMONGO_API_BASE: '' };
  const backend = spawn(process.execPath, [path.join(__dirname, '../server.js')], { env, stdio: 'inherit', windowsHide: true });
  const frontend = spawn(process.execPath, [path.join(__dirname, '../../frontend/node_modules/vite/bin/vite.js'), ...(process.env.DEMO_FRONTEND === 'preview' ? ['preview'] : []), '--host', '127.0.0.1'], { env, cwd: path.join(__dirname, '../../frontend'), stdio: 'inherit', windowsHide: true });
  console.log('Synthetic demo: http://127.0.0.1:5501');
  console.log('Demo URI (seed/reset commands only):', process.env.DEMO_MONGO_URI);
  console.log('Demo accounts:', accounts);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true; backend.kill('SIGTERM'); frontend.kill('SIGTERM');
    if (replica) await replica.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  backend.once('exit', () => { if (!stopping) stop(); }); frontend.once('exit', () => { if (!stopping) stop(); });
}
main().catch(async error => { console.error('Demo could not start:', error.message); if (replica) await replica.stop(); process.exitCode = 1; });
