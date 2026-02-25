import type { Redis } from 'ioredis'
import type { RateLimitStore, RateLimitResult } from './rateLimit.js'

/**
 * Redis-backed rate limit store for distributed rate limiting across instances.
 * Requires the `ioredis` package and REDIS_URL to be set.
 */
export class RedisStore implements RateLimitStore {
  constructor(private readonly client: Redis) {}

  /**
   * Create a Redis client from a URL (e.g. REDIS_URL).
   * Caller must ensure ioredis is installed when using this.
   *
   * @param url - Redis connection URL.
   * @returns Connected Redis client.
   */
  static async connect(url: string): Promise<Redis> {
    const Redis = (await import('ioredis')).default
    const client = new Redis(url, { maxRetriesPerRequest: 1 })
    return new Promise((resolve, reject) => {
      client.once('ready', () => resolve(client))
      client.once('error', (err) => reject(err))
    })
  }

  /**
   * Increment the counter in Redis. Uses INCR and sets EXPIRE on first use in the window.
   *
   * @param key - Unique key per client and scope.
   * @param windowMs - Window length in milliseconds.
   */
  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const count = await this.client.incr(key)
    const windowSec = Math.ceil(windowMs / 1000)

    if (count === 1) {
      await this.client.expire(key, windowSec)
    }

    const ttlSec = await this.client.ttl(key)
    const ttlMs = ttlSec > 0 ? ttlSec * 1000 : 0

    return { count, ttlMs }
  }
}
