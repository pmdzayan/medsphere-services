# Task 0022 — Backup/Recovery Validation Evidence (Local)

**Date:** 2026-09-06

**Scope:** Real-database evidence produced locally for Task 0022. It is
supplementary **native PostgreSQL 18** evidence; it is NOT a PostgreSQL 16
certification (see "Version classification" below).

## Environment

| Component                                       | Value                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| OS                                              | Windows (VS Code / PowerShell)                                       |
| Node                                            | v24.18.0                                                             |
| pnpm                                            | 9.15.0                                                               |
| PostgreSQL server                               | PostgreSQL 18.4 on x86_64-windows (msvc-19.44.35227), localhost:5432 |
| psql / pg_dump / pg_restore / createdb / dropdb | 18.4 (native, matching server)                                       |
| Docker Desktop                                  | not used                                                             |

## Version classification

- **Native PostgreSQL 18 evidence (local): PASS** — full deterministic
  recovery validation and the extended backup/restore certification executed
  against PostgreSQL 18.4 server + 18.4 client tools on the same host.
- **Exact PostgreSQL 16 evidence: NOT YET EXECUTED locally.** The accepted CI
  workflow (`.github/workflows/backup-restore-certification.yml`) provisions a
  `postgres:16-alpine` service container and will produce exact PostgreSQL 16
  certification when the branch is pushed (publication pending CTO approval).
  PostgreSQL 18 evidence must not be reported as PostgreSQL 16 certification.

## 1. Focused unit tests (mock-based, no database required)

Command: `pnpm test:backup-recovery` (`node --test scripts/backup-recovery.spec.mjs`)

Result: **26/26 pass, 0 fail.** Coverage includes: connection-URL parsing,
safe connection summaries, production-target classification (explicit match
and managed-host markers), backup-file validation + deterministic hashing,
the integrity-verification engine (healthy pass, missing PK failure, orphan
detection), backup-status metrics (success/failure/staleness/restore
verification), secret-free metric text, and fail-closed CLI behavior for
backup, restore, and restore-verify (missing config, missing/corrupt backup
file, explicit production target, managed-host production endpoint,
`--force-production` rejection, no password leakage into output).

## 2. Deterministic recovery validation (real PostgreSQL 18)

Command:
`DATABASE_URL=... AIM_T0022_ALLOW_REPLACE=1 node scripts/db-recovery-validation.mjs`

Result: **DB RECOVERY VALIDATION: PASS** (both scenarios).

### Scenario A — current-schema populated backup → restore → verify

- Source migration count: **29** applied migrations (current schema).
- Seeded representative rows: Tenant=1, User=2, TenantMembership=1,
  UserPrivacy=1, ConsentRecord=2, UserSession=1,
  UserSessionRefreshCredential=1, Provider=1, Product=1, Inventory=1,
  Batch=1, MedicineReservation=1, AuditEvent=4.
- `aim-backup.mjs` created a custom-format archive.
- `aim-restore.mjs` restored into a fresh, isolated database and ran
  the full integrity verifier: database connection, all 13 required tables,
  primary keys, required unique indexes, per-table FK minima, zero orphan
  rows (including the Task 0019 composite
  `AuditEvent(actorMembershipId, actorUserId, tenantId)` FK), migration
  count match (29=29), and expected row counts per table — **all PASS**.
- Byte-for-byte evidence matched after restore: row counts and canonical
  SHA-256 content hashes for all 13 required tables, plus projections of
  AuditEvent, UserPrivacy, ConsentRecord, UserSession, and
  UserSessionRefreshCredential — **all matched**.
- Targeted assertions: TENANT_USER audit record retains exact
  `actorMembershipId` + `actorUserId` + `tenantId` with null
  `platformActorUserId` (true); the WITHDRAWN consent record is preserved
  with status WITHDRAWN; the consent log was not regenerated or expanded
  (no new rows).

### Scenario B — older-schema backup → restore → forward migration

- Older baseline: **27 migrations** (all accepted migrations before Task
  0021's platform-administration foundation), applied to a dedicated
  database; the same representative rows were seeded (without the
  platform-scope audit rows).
- `aim-backup.mjs` → `aim-restore.mjs` into a fresh isolated
  database; integrity verification passed against the older expected
  migration count (27) and row counts.
- Forward migration: repository-owned `prisma:verify` (deploy + status +
  drift) advanced the restored older-schema database to the current schema —
  final migration count **29** — with **no drift**.
- Tenant row and Task 0019 audit evidence survived the forward migration.

## 3. Extended backup/restore certification (real PostgreSQL 18)

Command:
`node scripts/backup-restore-certification.mjs` against a dedicated
disposable source database.

Result: **BACKUP RESTORE CERTIFICATION: PASS**, including:

- custom-format backup created (255,092 bytes; SHA-256
  `000ebce428fccc7a3094315414c246c4c99c97a3e0c01de0ffc468e66edd0e78`);
- clean separate restore database created; `pg_restore` completed;
- all 13 required tables present after restore; restored migration history
  matches source (29 = 29);
- restored row counts + canonical content hashes match pre-backup evidence
  for all 13 tables;
- durable-state preservation checks (new in Task 0022): TENANT_USER exact
  audit attribution, audit event type/metadata/requestId unchanged,
  withdrawn consent preserved (never regenerated), consent log not expanded,
  privacy preference values unchanged, active session + refresh-credential
  hash preserved — **all PASS**.

## 4. Cleanup

All dedicated databases (`aim_t0022_source`, `aim_t0022_restore`,
`aim_t0022_older`, `aim_t0022_older_restore`, the certification source and
restore targets) were dropped after validation. No backup `.dump` artifacts
remain in the repository or were ever tracked.

## 5. Redis classification (audit)

Repository evidence (compose `redis:7-alpine`, auth-service
`RedisThrottlerStorage` for rate-limit window/block counters, health checks,
CI service containers) shows Redis holds **reconstructable operational
state**, not durable business-critical data.

**Redis is not the authoritative disaster-recovery datastore.**

No Redis backup infrastructure was introduced; no Redis recovery testing was
performed because no durable accepted business state depends on Redis.

## 6. Known limitations / gates not executed locally

- Exact PostgreSQL 16 run: NOT YET EXECUTED locally (CI will provide it).
- Provider snapshots / PITR: documented as requirements; not activated.
- Measured production RTO exercise: not performed; RTO is a documented
  engineering target (see the runbook).
