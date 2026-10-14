/**
 * Fixed-window rate limiting, one bucket table per route family.
 *
 * Windows are wall-clock aligned and the table is swept on a timer so a
 * long-running process does not accumulate keys. A client is identified by its
 * socket address, or by X-Forwarded-For only when TRUST_PROXY=1.
 */
import { logger } from './logger.js';

export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} options.windowMs window length in milliseconds
   * @param {number} options.max requests allowed per window
   * @param {string} options.name bucket name used in logs and headers
   * @param {() => number} [options.now] injectable clock, for tests
   */
  constructor({ windowMs, max, name, now = Date.now }) {
    this.windowMs = windowMs;
    this.max = max;
    this.name = name;
    this.now = now;
    this.buckets = new Map();
  }

  /** @returns {{allowed: boolean, remaining: number, retryAfterSeconds: number, limit: number}} */
  check(key) {
    const now = this.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;
    const existing = this.buckets.get(key);
    let entry = existing;
    if (!entry || entry.windowStart !== windowStart) {
      entry = { windowStart, count: 0 };
      this.buckets.set(key, entry);
    }
    entry.count += 1;
    const allowed = entry.count <= this.max;
    const remaining = Math.max(0, this.max - entry.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + this.windowMs - now) / 1000));
    return { allowed, remaining, retryAfterSeconds, limit: this.max };
  }

  sweep() {
    const now = this.now();
    const currentWindow = Math.floor(now / this.windowMs) * this.windowMs;
    let removed = 0;
    for (const [key, entry] of this.buckets) {
      if (entry.windowStart < currentWindow) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size() {
    return this.buckets.size;
  }
}

/** A set of independent limiters; each route family has its own bucket table. */
export function createLimiters(config, now = Date.now) {
  return {
    ai: new RateLimiter({ windowMs: 60_000, max: config.ai.ratePerMinute, name: 'ai', now }),
    geocode: new RateLimiter({ windowMs: 60_000, max: config.geo.ratePerMinute, name: 'geocode', now })
  };
}

/** Sweep every limiter once a minute; returns a stop function. */
export function startRateLimitSweeper(limiters, intervalMs = 60_000) {
  const timer = setInterval(() => {
    let removed = 0;
    for (const limiter of Object.values(limiters)) removed += limiter.sweep();
    if (removed > 0) logger.debug(`rate-limit sweep removed ${removed} expired bucket(s)`);
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Client address. X-Forwarded-For is honoured only when the operator has
 * declared TRUST_PROXY=1, because the header is trivially spoofable otherwise.
 */
export function clientKey(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const first = Array.isArray(header) ? header[0] : String(header || '').split(',')[0];
    if (first && first.trim()) return first.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}
