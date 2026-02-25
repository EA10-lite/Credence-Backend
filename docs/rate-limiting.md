# Rate Limiting

Rate limiting is implemented to prevent abuse and ensure fair usage of the API. Requests are limited per client (identified by IP or API key) per time window. When the limit is exceeded, the API responds with **429 Too Many Requests** and a **Retry-After** header.

## Behaviour

- **Client identification:** By default, the client is identified by the `X-API-Key` header if present and non-empty; otherwise by the request IP (e.g. `req.ip` or `req.socket.remoteAddress`).
- **Scoping:** Limits are scoped per client, HTTP method, and path (e.g. `GET /api/health` and `POST /api/attestations` are counted separately).
- **Window:** Fixed time window (e.g. 60 seconds). After the window expires, the counter resets for that key.
- **Response when exceeded:** `429 Too Many Requests` with a JSON body and `Retry-After` header indicating how many seconds to wait before retrying.

## Configuration

### Global middleware

The app applies a default rate limit globally in `src/index.ts`:

```ts
app.use(
  rateLimit({
    windowMs: 60_000,   // 1 minute
    maxPerWindow: 100,  // 100 requests per window per client
  }),
)
```

### Per-route limits

You can apply a stricter (or looser) limit on specific routes by adding another `rateLimit` middleware with different options:

```ts
app.post(
  '/api/attestations',
  rateLimit({ windowMs: 60_000, maxPerWindow: 10 }),
  validate({ body: createAttestationBodySchema }),
  handler,
)
```

### Per-endpoint or per-tier limits

Use the `getConfig` option to resolve limits per request (e.g. by path or tier):

```ts
app.use(
  rateLimit({
    windowMs: 60_000,
    maxPerWindow: 100,
    getConfig: (req) => {
      if (req.path === '/api/attestations' && req.method === 'POST') {
        return { windowMs: 60_000, maxPerWindow: 10 }
      }
      return { windowMs: 60_000, maxPerWindow: 100 }
    },
  }),
)
```

### Custom client key

Override how the client is identified (e.g. by header or tenant):

```ts
rateLimit({
  windowMs: 60_000,
  maxPerWindow: 100,
  keyGenerator: (req) => {
    const tenant = req.headers['x-tenant-id']
    return typeof tenant === 'string' ? `tenant:${tenant}` : `ip:${req.ip}`
  },
})
```

## Store: Redis vs in-memory

- **In-memory (`MemoryStore`):** Used by default. Counters are stored in process memory. Suitable for a single instance; limits are not shared across multiple API servers.
- **Redis (`RedisStore`):** Used when `REDIS_URL` is set and a connection succeeds. Counters are stored in Redis so that all instances share the same limits. If Redis is unavailable at startup or the connection fails, the middleware falls back to in-memory.

To use Redis:

1. Set the `REDIS_URL` environment variable (e.g. `redis://localhost:6379`).
2. Ensure the `ioredis` dependency is installed (included in the project).
3. Optionally pass a pre-created store so the app uses Redis only when intended:

```ts
import { createRateLimitStore, rateLimit } from './middleware/rateLimit.js'

const store = await createRateLimitStore()
app.use(rateLimit({ windowMs: 60_000, maxPerWindow: 100, store }))
```

## 429 response shape

When the rate limit is exceeded:

- **Status:** `429 Too Many Requests`
- **Header:** `Retry-After: <seconds>` (seconds until the current window ends)
- **Body (JSON):**

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Please retry after the Retry-After period.",
  "retryAfter": 45
}
```

Clients should wait at least `Retry-After` seconds before retrying.

## Fail-open behaviour

If the rate limit store throws (e.g. Redis connection lost), the middleware **allows the request** and calls `next()`. This avoids denying all traffic when the store is down.

## Files

| File | Purpose |
|------|---------|
| `src/middleware/rateLimit.ts` | Middleware, `MemoryStore`, `createRateLimitStore()`, options and types |
| `src/middleware/rateLimitRedis.ts` | Redis-backed store for distributed rate limiting |
| `src/middleware/rateLimit.test.ts` | Unit tests for middleware, MemoryStore, RedisStore, createRateLimitStore |

## Tests

Run the test suite and coverage:

```bash
npm run test
npm run test:coverage
```

Tests cover:

- Requests under the limit → `next()` called.
- Limit exceeded → 429, `Retry-After` header, and JSON body.
- Window reset (MemoryStore) → counter resets after window expires.
- Per-endpoint limits via `getConfig`.
- Client key from IP and from `X-API-Key`.
- Custom `keyGenerator`.
- Store failure → fail open (request allowed).
- MemoryStore: first request, increment in same window, clear.
- RedisStore: increment and TTL behaviour (with mock client).
- `createRateLimitStore`: in-memory when no Redis URL; fallback to memory when Redis connection fails.

Target: minimum 95% test coverage for the rate limiting code.
