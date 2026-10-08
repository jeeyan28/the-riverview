const { createHash } = require('node:crypto');
const Counter = require('../model/rateLimitCounter');
const AppError = require('./appError');

class MongoRateLimitStore {
  constructor(prefix, { model = Counter, now = () => new Date() } = {}) {
    this.prefix = prefix;
    this.model = model;
    this.now = now;
    this.localKeys = false;
  }
  init(options) { this.windowMs = options.windowMs; }
  key(value) { return `${this.prefix}:${createHash('sha256').update(String(value)).digest('hex')}`; }
  async increment(key) {
    const now = this.now();
    const active = { $gt: ['$expiresAt', now] };
    const update = [{ $set: {
      hits: { $cond: [active, { $add: ['$hits', 1] }, 1] },
      expiresAt: { $cond: [active, '$expiresAt', new Date(now.getTime() + this.windowMs)] },
    } }];
    try {
      let doc;
      try { doc = await this.model.findOneAndUpdate({ _id: this.key(key) }, update, { upsert: true, returnDocument: 'after', updatePipeline: true }); }
      catch (error) {
        if (error.code !== 11000) throw error;
        doc = await this.model.findOneAndUpdate({ _id: this.key(key) }, update, { returnDocument: 'after', updatePipeline: true });
      }
      if (!doc) throw new Error('Counter not available');
      return { totalHits: doc.hits, resetTime: doc.expiresAt };
    } catch {
      const error = new AppError(503, 'We could not process this request right now. Please try again.');
      error.code = 'RATE_LIMIT_UNAVAILABLE';
      throw error;
    }
  }
  async decrement(key) {
    await this.model.updateOne({ _id: this.key(key), hits: { $gt: 0 }, expiresAt: { $gt: this.now() } }, { $inc: { hits: -1 } });
  }
  async resetKey(key) { await this.model.deleteOne({ _id: this.key(key) }); }
}

module.exports = { MongoRateLimitStore };
