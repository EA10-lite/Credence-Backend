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

| Command               | Description                |
|-----------------------|----------------------------|
| `npm run dev`         | Start with tsx watch       |
| `npm run build`       | Compile TypeScript         |
| `npm start`           | Run compiled `dist/`       |
| `npm run lint`        | Run ESLint                 |
| `npm run test`        | Run tests                  |
| `npm run test:coverage` | Run tests with coverage  |

## API (current)

| Method | Path                     | Description           | Validation        |
|--------|--------------------------|-----------------------|-------------------|
| GET    | `/api/health`            | Health check          | —                 |
| GET    | `/api/trust/:address`    | Trust score (stub)    | Path: address     |
| GET    | `/api/bond/:address`     | Bond status (stub)    | Path: address     |
| GET    | `/api/attestations/:address` | List attestations | Path, query (limit/offset) |
| POST   | `/api/attestations`      | Create attestation    | Body (subject, value, key?) |

Invalid input returns **400** with `{ "error": "Validation failed", "details": [{ "path", "message" }] }`. See [docs/VALIDATION.md](docs/VALIDATION.md).

## Tech

- Node.js
- TypeScript
- Express
- Zod (request validation)

Extend with PostgreSQL, Redis, and Horizon event ingestion when implementing the full architecture.
