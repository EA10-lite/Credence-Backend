# Credence Database Schema

## Overview

The Credence protocol uses PostgreSQL. Two core tables are defined in the initial migrations:

| Table | Migration | Purpose |
|---|---|---|
| `identities` | `001_create_identities.sql` | On-chain wallet addresses registered in the protocol |
| `bonds` | `002_create_bonds.sql` | Staked/locked value tied to a registered identity |

A `schema_migrations` tracking table is also created by migration `001`.

---

## Tables

### `identities`

Stores every blockchain wallet address that has been registered with the Credence protocol.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | Surrogate primary key |
| `address` | `VARCHAR(255)` | NO | — | Blockchain wallet address (unique) |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | Row creation time |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | Auto-updated by trigger on every `UPDATE` |

**Constraints**
- `PRIMARY KEY (id)`
- `UNIQUE (address)`

**Triggers**
- `identities_updated_at` – calls `set_updated_at()` before every `UPDATE`, keeping `updated_at` current automatically.

---

### `bonds`

Records staking/locking events. Each row represents one bond period for an identity.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | Surrogate primary key |
| `identity_id` | `UUID` | NO | — | FK → `identities.id` (CASCADE DELETE) |
| `bonded_amount` | `NUMERIC(36,18)` | NO | — | Total tokens bonded (18-decimal precision) |
| `bond_start` | `TIMESTAMPTZ` | NO | `NOW()` | When the bond period began |
| `bond_duration` | `INTERVAL` | NO | — | Length of the bond (e.g. `'30 days'`) |
| `bond_end` | `TIMESTAMPTZ` | NO | *(generated)* | Computed: `bond_start + bond_duration` |
| `slashed_amount` | `NUMERIC(36,18)` | NO | `0` | Cumulative slashed tokens |
| `active` | `BOOLEAN` | NO | `TRUE` | Whether the bond is still active |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | Row creation time |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | Auto-updated by trigger |

**Constraints**
- `PRIMARY KEY (id)`
- `FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE`
- `CHECK (bonded_amount >= 0)`
- `CHECK (slashed_amount >= 0)`
- `CHECK (slashed_amount <= bonded_amount)` — alias `slashed_lte_bonded`

**Indexes**
- `idx_bonds_identity_id` on `(identity_id)` — fast lookups by owner
- `idx_bonds_active` on `(identity_id) WHERE active = TRUE` — partial index for active-bond queries

**Triggers**
- `bonds_updated_at` – auto-refreshes `updated_at` on every `UPDATE`

---

## Entity Relationship

```
identities 1 ──< bonds
   id  ←────────── identity_id
```

Deleting an identity cascades to all of its bonds.

---

## Running Migrations

```bash
# Apply all migrations in order
psql $DATABASE_URL -f migrations/001_create_identities.sql
psql $DATABASE_URL -f migrations/002_create_bonds.sql

# Roll back migration 002
psql $DATABASE_URL -c "
  BEGIN;
  DROP TRIGGER IF EXISTS bonds_updated_at ON bonds;
  DROP INDEX  IF EXISTS idx_bonds_active;
  DROP INDEX  IF EXISTS idx_bonds_identity_id;
  DROP TABLE  IF EXISTS bonds;
  DELETE FROM schema_migrations WHERE version = '002_create_bonds';
  COMMIT;
"
```

All migrations are **idempotent** (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) so they can be re-run safely.

---

## Repository API

### `IdentityRepository`

| Method | Signature | Description |
|---|---|---|
| `findAll` | `(limit?, offset?) → Identity[]` | Paginated list, newest first |
| `findById` | `(id) → Identity \| null` | Lookup by UUID |
| `findByAddress` | `(address) → Identity \| null` | Lookup by wallet address |
| `create` | `(input) → Identity` | Insert; throws on duplicate address |
| `upsert` | `(input) → Identity` | Insert or refresh `updated_at` |
| `delete` | `(id) → boolean` | Hard delete; cascades to bonds |

### `BondRepository`

| Method | Signature | Description |
|---|---|---|
| `findByIdentityId` | `(identityId) → Bond[]` | All bonds for an identity |
| `findActiveBond` | `(identityId) → Bond \| null` | The single active bond |
| `findById` | `(id) → Bond \| null` | Lookup by UUID |
| `findExpired` | `() → Bond[]` | Active bonds past `bond_end` |
| `create` | `(input) → Bond` | Insert a new bond |
| `update` | `(id, input) → Bond \| null` | Partial update (`slashedAmount`, `active`) |
| `deactivate` | `(id) → boolean` | Sets `active = FALSE` |
| `delete` | `(id) → boolean` | Hard delete |