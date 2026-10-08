const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { assertIsolatedDatabase } = require('../../utils/isolatedDatabase');

async function startDatabase() {
  let replica;
  const uri = process.env.TEST_MONGO_URI || (await (async () => {
    replica = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION || '8.2.6' }, replSet: { count: 1, storageEngine: 'wiredTiger' }, instanceOpts: [{ dbName: 'riverview_test_integration' }] });
    return replica.getUri('riverview_test_integration');
  })());
  try {
    assertIsolatedDatabase(uri, 'test');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  } catch (error) {
    await mongoose.disconnect();
    if (replica) await replica.stop();
    throw error;
  }
  return async () => {
    try {
      assertIsolatedDatabase(uri, 'test');
      await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
      if (replica) await replica.stop();
    }
  };
}
module.exports = { startDatabase };
