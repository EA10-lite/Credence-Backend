import type { Request, Response, NextFunction } from 'express'

/**
 * Result of incrementing a rate-limit counter.
 * Used to decide whether the request is allowed and to set Retry-After.
 */
export interface RateLimitResult {
  /** Current request count in this window (after increment). */
  count: number
  /** Remaining time in the current window, in milliseconds. */
  ttlMs: number
}

/**
 * Store backend for rate limit state.
 * Implementations may use in-memory storage or Redis for distributed state.
 */
export interface RateLimitStore {
  /**
   * Increment the counter for the given key and return the new count and remaining TTL.
   * If the key does not exist or the window has expired, a new window is started.
   *
   * @param key - Unique key per client and scope (e.g. endpoint or tier).
   * @param windowMs - Window length in milliseconds.
   * @returns The count after increment and remaining TTL in ms.
   */
  increment(key: string, windowMs: number): Promise<RateLimitResult>
}

/**
 * In-memory rate limit store.
 * Suitable for single-instance deployments; use Redis for multi-instance.
 */
export class MemoryStore implements RateLimitStore {
  private readonly entries = new Map<
    string,
    { count: number; resetAt: number }
  >()

  /**
   * @param key - Key identifying the client/scope.
   * @param windowMs - Window length in milliseconds.
   */
  async increment(key: string, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now()
    let entry = this.entries.get(key)

    if (!entry || entry.resetAt <= now) {
      entry = { count: 1, resetAt: now + windowMs }
      this.entries.set(key, entry)
      return { count: 1, ttlMs: windowMs }
    }

    entry.count += 1
    const ttlMs = Math.max(0, entry.resetAt - now)
    return { count: entry.count, ttlMs }
  }

  /** Clear all entries (useful for tests). */
  clear(): void {
    this.entries.clear()
  }
}

/**
 * Per-request rate limit configuration (window and max requests).
 */
export interface RateLimitConfig {
  /** Maximum number of requests per window. */
  maxPerWindow: number
  /** Window length in milliseconds. */
  windowMs: number
}

/**
 * Options for the rate limit middleware.
 * Either set fixed limits (maxPerWindow, windowMs) or use getConfig for per-endpoint/tier limits.
 */
export interface RateLimitOptions {
  /** Maximum number of requests per window (used when getConfig is not provided). */
  maxPerWindow: number
  /** Window length in milliseconds (used when getConfig is not provided). */
  windowMs: number
  /**
   * Optional: resolve limits per request (e.g. by path or tier).
   * When provided, overrides maxPerWindow and windowMs for that request.
   */
  getConfig?: (req: Request) => RateLimitConfig
  /**
   * Store for rate limit state. Defaults to in-memory if not provided.
   * When REDIS_URL is set, a Redis store can be used for distributed limiting.
   */
  store?: RateLimitStore
  /**
   * Function to derive a unique key per client. Defaults to IP or X-API-Key.
   * @param req - Express request.
   * @returns Client identifier string.
   */
  keyGenerator?: (req: Request) => string
}

const defaultKeyGenerator = (req: Request): string => {
  const apiKey = req.headers['x-api-key']
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return `key:${apiKey}`
  }
  const ip =
    (req as Request & { ip?: string }).ip ??
    req.socket?.remoteAddress ??
    'unknown'
  return `ip:${ip}`
}

/**
 * Create a rate limit store: Redis when REDIS_URL is set, otherwise in-memory.
 * Caller may pass a custom store in middleware options to override.
 *
 * @returns Promise resolving to a RateLimitStore (Redis or Memory).
 */
export async function createRateLimitStore(): Promise<RateLimitStore> {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    try {
      const { RedisStore } = await import('./rateLimitRedis.js')
      const client = await RedisStore.connect(redisUrl)
      return new RedisStore(client)
    } catch {
      // Fallback to in-memory if Redis is unavailable
      return new MemoryStore()
    }
  }
  return new MemoryStore()
}

/**
 * Express middleware that enforces a rate limit per client (IP or API key).
 * When the limit is exceeded, responds with 429 and a Retry-After header.
 *
 * @param options - maxPerWindow, windowMs, and optional store/keyGenerator.
 * @returns Express middleware.
 *
 * @example
 * // Global default: 100 requests per minute per IP
 * app.use(rateLimit({ windowMs: 60_000, maxPerWindow: 100 }))
 *
 * @example
 * // Stricter limit for a specific route
 * app.post('/api/attestations', rateLimit({ windowMs: 60_000, maxPerWindow: 10 }), handler)
 */
export function rateLimit(options: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => void {
  const {
    maxPerWindow: defaultMax,
    windowMs: defaultWindowMs,
    getConfig,
    store = new MemoryStore(),
    keyGenerator = defaultKeyGenerator,
  } = options

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const config = getConfig ? getConfig(req) : { maxPerWindow: defaultMax, windowMs: defaultWindowMs }
    const { maxPerWindow, windowMs } = config

    const key = keyGenerator(req)
    const scopeKey = `rl:${key}:${req.method}:${req.path}`

    try {
      const { count, ttlMs } = await store.increment(scopeKey, windowMs)

      if (count > maxPerWindow) {
        const retryAfterSec = Math.ceil(ttlMs / 1000)
        res.setHeader('Retry-After', String(retryAfterSec))
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please retry after the Retry-After period.',
          retryAfter: retryAfterSec,
        })
        return
      }

      next()
    } catch (err) {
      // On store failure, allow the request (fail open)
      next()
    }
  }
}
