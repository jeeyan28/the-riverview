const { randomUUID } = require('node:crypto');
const JobLease = require('../model/jobLease');

async function claimLease(name, { now = new Date(), leaseMs = 60000, owner = randomUUID() } = {}) {
  try {
    return await JobLease.findOneAndUpdate({ _id: name, expiresAt: { $lte: now } }, {
      $set: { owner, expiresAt: new Date(now.getTime() + leaseMs), startedAt: now, status: 'running' },
      $inc: { version: 1 },
    }, { upsert: true, returnDocument: 'after' });
  } catch (error) {
    if (error.code === 11000) return null;
    throw error;
  }
}
function fence(lease) { return { _id: lease._id, owner: lease.owner, version: lease.version }; }
async function renewLease(lease, { now = new Date(), leaseMs = 60000 } = {}) {
  const result = await JobLease.updateOne({ ...fence(lease), expiresAt: { $gt: now } }, { $set: { expiresAt: new Date(now.getTime() + leaseMs) } });
  return result.modifiedCount === 1;
}
async function releaseLease(lease, { now = new Date(), counts = {}, failedStages = [] } = {}) {
  return JobLease.updateOne({ ...fence(lease), expiresAt: { $gt: now } }, { $set: {
    expiresAt: now, completedAt: now, counts, failedStages,
    status: failedStages.length ? 'partial_failure' : 'completed',
    [failedStages.length ? 'lastFailureAt' : 'lastSuccessAt']: now,
  } });
}
module.exports = { claimLease, renewLease, releaseLease };
