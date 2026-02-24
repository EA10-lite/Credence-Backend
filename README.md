# Credence Backend

API and services for the Credence economic trust protocol. Provides health checks, trust score and bond status endpoints (to be wired to Horizon and a reputation engine).

## About

This service is part of [Credence](../README.md). It will support:

- Public query API (trust score, bond status, attestations)
- Horizon listener for bond/slash events (future)
- Reputation engine (off-chain score from bond data) (future)

## Prerequisites

- Node.js 18+
- npm or pnpm

## Setup

```bash
npm install
```

## Run locally

**Development (watch mode):**

```bash
npm run dev
```

**Production:**

```bash
npm run build
npm start
```

API runs at [http://localhost:3000](http://localhost:3000). The frontend proxies `/api` to this URL.

## Scripts

| Command         | Description              |
|-----------------|--------------------------|
| `npm run dev`   | Start with tsx watch     |
| `npm run build` | Compile TypeScript       |
| `npm start`     | Run compiled `dist/`     |
| `npm run lint`  | Run ESLint               |
| `npm test`      | Run tests                |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:watch` | Run tests in watch mode |

## API (current)

| Method | Path               | Description        |
|--------|--------------------|--------------------|
| GET    | `/api/health`      | Health check       |
| GET    | `/api/trust/:address` | Trust score (stub) |
| GET    | `/api/bond/:address`   | Bond status (stub) |
| POST   | `/api/bulk/verify` | Bulk identity verification (Enterprise) |

### Bulk Verification Endpoint

The bulk verification endpoint allows enterprise-tier clients to verify multiple addresses in a single request. See [docs/BULK_VERIFICATION_API.md](docs/BULK_VERIFICATION_API.md) for complete documentation.

**Example:**
```bash
curl -X POST http://localhost:3000/api/bulk/verify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-enterprise-key" \
  -d '{"addresses": ["GABC...", "GDEF..."]}'
```

## Tech

- Node.js
- TypeScript
- Express

Extend with PostgreSQL, Redis, and Horizon event ingestion when implementing the full architecture.
