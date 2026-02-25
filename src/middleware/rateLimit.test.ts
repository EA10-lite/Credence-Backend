import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import type { RateLimitStore, RateLimitResult } from './rateLimit.js'
import {
  rateLimit,
  MemoryStore,
  createRateLimitStore,
} from './rateLimit.js'
import type { RateLimitConfig } from './rateLimit.js'

describe('rateLimit middleware', () => {
  const mockNext = vi.fn<NextFunction>()
  const mockStatus = vi.fn()
  const mockJson = vi.fn()
  const mockSetHeader = vi.fn()
  const res = {
    status: mockStatus,
    json: mockJson,
    setHeader: mockSetHeader,
  } as unknown as Response

  beforeEach(() => {
    vi.clearAllMocks()
    mockStatus.mockReturnValue(res)
    mockJson.mockReturnValue(res)
  })

  it('calls next() when request count is under the limit', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 1, ttlMs: 60_000 }),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 10,
      store,
    })
    const req = {
      method: 'GET',
      path: '/api/health',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    } as Request

    await middleware(req, res, mockNext)

    expect(store.increment).toHaveBeenCalledWith(
      'rl:ip:127.0.0.1:GET:/api/health',
      60_000,
    )
    expect(mockNext).toHaveBeenCalledOnce()
    expect(mockStatus).not.toHaveBeenCalled()
  })

  it('returns 429 with Retry-After when limit exceeded', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 11, ttlMs: 45_000 }),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 10,
      store,
    })
    const req = {
      method: 'GET',
      path: '/api/trust/0xabc',
      headers: {},
      socket: { remoteAddress: '192.168.1.1' },
    } as Request

    await middleware(req, res, mockNext)

    expect(mockNext).not.toHaveBeenCalled()
    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', '45')
    expect(mockStatus).toHaveBeenCalledWith(429)
    expect(mockJson).toHaveBeenCalledWith({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please retry after the Retry-After period.',
      retryAfter: 45,
    })
  })

  it('rounds Retry-After up to nearest second', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 2, ttlMs: 1500 }),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 1,
      store,
    })
    const req = {
      method: 'GET',
      path: '/',
      headers: {},
      socket: { remoteAddress: '1.2.3.4' },
    } as Request

    await middleware(req, res, mockNext)

    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', '2')
    expect(mockStatus).toHaveBeenCalledWith(429)
  })

  it('uses X-API-Key for client key when present', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 1, ttlMs: 60_000 }),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 10,
      store,
    })
    const req = {
      method: 'POST',
      path: '/api/attestations',
      headers: { 'x-api-key': 'secret-key-123' },
      socket: { remoteAddress: '10.0.0.1' },
    } as Request

    await middleware(req, res, mockNext)

    expect(store.increment).toHaveBeenCalledWith(
      'rl:key:secret-key-123:POST:/api/attestations',
      60_000,
    )
    expect(mockNext).toHaveBeenCalledOnce()
  })

  it('falls back to IP when X-API-Key is empty string', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 1, ttlMs: 60_000 }),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 10,
      store,
    })
    const req = {
      method: 'GET',
      path: '/api/health',
      headers: { 'x-api-key': '' },
      socket: { remoteAddress: '127.0.0.1' },
    } as Request

    await middleware(req, res, mockNext)

    expect(store.increment).toHaveBeenCalledWith(
      'rl:ip:127.0.0.1:GET:/api/health',
      60_000,
    )
  })

  it('uses custom keyGenerator when provided', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 1, ttlMs: 60_000 }),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 10,
      store,
      keyGenerator: (r) => `custom:${(r.headers['x-client-id'] as string) ?? 'anon'}`,
    })
    const req = {
      method: 'GET',
      path: '/api/health',
      headers: { 'x-client-id': 'client-99' },
      socket: {},
    } as Request

    await middleware(req, res, mockNext)

    expect(store.increment).toHaveBeenCalledWith(
      'rl:custom:client-99:GET:/api/health',
      60_000,
    )
  })

  it('uses getConfig for per-endpoint limits', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 3, ttlMs: 30_000 }),
    }
    const getConfig = vi.fn((req: Request): RateLimitConfig => {
      if (req.path === '/api/attestations') {
        return { windowMs: 60_000, maxPerWindow: 5 }
      }
      return { windowMs: 60_000, maxPerWindow: 100 }
    })
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 100,
      store,
      getConfig,
    })
    const req = {
      method: 'POST',
      path: '/api/attestations',
      headers: {},
      socket: { remoteAddress: '1.2.3.4' },
    } as Request

    await middleware(req, res, mockNext)

    expect(getConfig).toHaveBeenCalledWith(req)
    expect(store.increment).toHaveBeenCalledWith(
      expect.any(String),
      60_000,
    )
    expect(mockNext).toHaveBeenCalledOnce()
  })

  it('returns 429 when per-endpoint limit is exceeded', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 6, ttlMs: 20_000 }),
    }
    const getConfig = vi.fn((): RateLimitConfig => ({
      windowMs: 60_000,
      maxPerWindow: 5,
    }))
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 100,
      store,
      getConfig,
    })
    const req = {
      method: 'POST',
      path: '/api/attestations',
      headers: {},
      socket: { remoteAddress: '1.2.3.4' },
    } as Request

    await middleware(req, res, mockNext)

    expect(mockStatus).toHaveBeenCalledWith(429)
    expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', '20')
  })

  it('calls next() on store failure (fail open)', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockRejectedValue(new Error('Redis down')),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 10,
      store,
    })
    const req = {
      method: 'GET',
      path: '/api/health',
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    } as Request

    await middleware(req, res, mockNext)

    expect(mockNext).toHaveBeenCalledOnce()
    expect(mockStatus).not.toHaveBeenCalled()
  })

  it('uses unknown when IP and socket are missing', async () => {
    const store: RateLimitStore = {
      increment: vi.fn().mockResolvedValue({ count: 1, ttlMs: 60_000 }),
    }
    const middleware = rateLimit({
      windowMs: 60_000,
      maxPerWindow: 10,
      store,
    })
    const req = {
      method: 'GET',
      path: '/api/health',
      headers: {},
      socket: undefined,
    } as Request

    await middleware(req, res, mockNext)

    expect(store.increment).toHaveBeenCalledWith(
      'rl:ip:unknown:GET:/api/health',
      60_000,
    )
  })
})

describe('MemoryStore', () => {
  let store: MemoryStore

  beforeEach(() => {
    store = new MemoryStore()
  })

  it('returns count 1 and full ttlMs on first increment', async () => {
    const result = await store.increment('key1', 60_000)
    expect(result.count).toBe(1)
    expect(result.ttlMs).toBe(60_000)
  })

  it('increments count within same window', async () => {
    await store.increment('key1', 60_000)
    const result = await store.increment('key1', 60_000)
    expect(result.count).toBe(2)
    expect(result.ttlMs).toBeLessThanOrEqual(60_000)
    expect(result.ttlMs).toBeGreaterThan(0)
  })

  it('resets window after expiry', async () => {
    await store.increment('key1', 10)
    await new Promise((r) => setTimeout(r, 15))
    const result = await store.increment('key1', 10)
    expect(result.count).toBe(1)
    expect(result.ttlMs).toBe(10)
  })

  it('keeps separate keys independent', async () => {
    const r1 = await store.increment('keyA', 60_000)
    const r2 = await store.increment('keyB', 60_000)
    const r3 = await store.increment('keyA', 60_000)
    expect(r1.count).toBe(1)
    expect(r2.count).toBe(1)
    expect(r3.count).toBe(2)
  })

  it('clear() removes all entries', async () => {
    await store.increment('key1', 60_000)
    store.clear()
    const result = await store.increment('key1', 60_000)
    expect(result.count).toBe(1)
  })
})

describe('createRateLimitStore', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns MemoryStore when REDIS_URL is not set', async () => {
    delete process.env.REDIS_URL
    const store = await createRateLimitStore()
    expect(store).toBeInstanceOf(MemoryStore)
  })

  it('returns MemoryStore when REDIS_URL is set but Redis connection fails', async () => {
    process.env.REDIS_URL = 'redis://localhost:9999'
    const store = await createRateLimitStore()
    expect(store).toBeInstanceOf(MemoryStore)
  })
})

describe('RedisStore', () => {
  it('increment sets count and TTL via mock client', async () => {
    const { RedisStore } = await import('./rateLimitRedis.js')
    let expireCalled = false
    const mockClient = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(60),
    }
    const store = new RedisStore(mockClient as unknown as import('ioredis').Redis)

    const result = await store.increment('rl:ip:1.2.3.4:GET:/api/health', 60_000)

    expect(mockClient.incr).toHaveBeenCalledWith('rl:ip:1.2.3.4:GET:/api/health')
    expect(mockClient.expire).toHaveBeenCalledWith('rl:ip:1.2.3.4:GET:/api/health', 60)
    expect(mockClient.ttl).toHaveBeenCalledWith('rl:ip:1.2.3.4:GET:/api/health')
    expect(result.count).toBe(1)
    expect(result.ttlMs).toBe(60_000)
  })

  it('increment does not set expire when count > 1', async () => {
    const { RedisStore } = await import('./rateLimitRedis.js')
    const mockClient = {
      incr: vi.fn().mockResolvedValue(2),
      expire: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(45),
    }
    const store = new RedisStore(mockClient as unknown as import('ioredis').Redis)

    await store.increment('key', 60_000)

    expect(mockClient.incr).toHaveBeenCalled()
    expect(mockClient.expire).not.toHaveBeenCalled()
    expect(mockClient.ttl).toHaveBeenCalled()
  })
})
