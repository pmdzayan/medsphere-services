# Task 0022 — Production Backup, Restore & Recovery Operations Foundation

**Status:** Implementation candidate — locally validated, not yet accepted, not merged.

**Branch:** `cto/0022-production-backup-recovery`

**Authoritative base:** `origin/feature/database-architecture` at
`f3ffa13e7240b7b4b5bb6e17d07bd3dccf4eac33` (accepted Task 0021). Verified via
`git fetch origin` at implementation start; the live authoritative HEAD had
not advanced beyond the task prompt SHA.

## Objective

Ensure AIM's durable production data can be backed up reliably, protected
appropriately, restored safely, verified after restoration, and recovered by
an operator using a deterministic procedure — with backup failures/staleness
monitored. PostgreSQL is the primary durable application datastore; Redis is
classified as reconstructable operational state (not the disaster-recovery
datastore).

## What already existed (audit outcome)

- `scripts/backup-restore-certification.mjs` + `.github/workflows/backup-restore-certification.yml`
  (real PostgreSQL 16 CI round trip: populate → `pg_dump` custom → `pg_restore`
  → row-count + canonical-hash verification).
- `docs/operations/backup-restore-runbook.md` (certification-only scope;
  explicitly deferred RPO/RTO, retention, storage, security policy).
- `docs/operations/v1-observability-runbook.md` + `v1-alert-rules.prometheus.yml`
  (application metrics/alerting foundation reused, not replaced).

## What Task 0022 adds

### Repository-owned workflows

| Script                               | Purpose                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/backup-recovery-core.mjs`   | Shared pure helpers: connection parsing, production classifier, backup-file validation, injectable integrity verifier, status records, Prometheus metric formatting |
| `scripts/aim-backup.mjs`             | Deterministic `pg_dump --format=custom --no-owner --no-privileges` workflow; fail-closed; PGPASSWORD-only; SHA-256 + readability verification                       |
| `scripts/aim-restore.mjs`            | Isolated restore into a NEW database with fail-closed preflights; NO `--force-production`; never restores over source; full integrity verification                  |
| `scripts/aim-restore-verify.mjs`     | Standalone integrity verification battery                                                                                                                           |
| `scripts/aim-backup-status.mjs`      | Bounded Prometheus text metrics (status, last-success age, staleness, restore-verified)                                                                             |
| `scripts/db-recovery-validation.mjs` | Deterministic real-PostgreSQL validation: Scenario A (current schema) + Scenario B (older schema → forward migration)                                               |
| `scripts/backup-recovery.spec.mjs`   | 26 focused unit tests (mock-based; run in CI without a database)                                                                                                    |

### Integrity verification (beyond `pg_restore` exit code)

Connections, 13 required tables (Tenant, User, TenantMembership, UserPrivacy,
ConsentRecord, UserSession, UserSessionRefreshCredential, Provider, Product,
Inventory, Batch, MedicineReservation, AuditEvent), primary keys, required
unique indexes, per-table FK minima, zero orphan rows (including the Task
0019 composite AuditEvent attribution FK), migration-history match, expected
row counts.

### Production safety

- Production-target detection: explicit `AIM_PRODUCTION_DATABASE_URL` match
  OR conservative managed-host markers (RDS/Azure/Cloud SQL etc.); cannot be
  overridden.
- `source == target` rejection.
- Restore target must be a NEW database; an existing empty target requires
  explicit `AIM_RESTORE_DROP_EXISTING=1`; an existing AIM-schema target is
  always refused.
- Missing/empty/unreadable backup archive refused.
- No `--force-production` option anywhere.

### Canonical policy & documentation

- `docs/operations/backup-retention-policy.md` — RPO 24h target, RTO 4h
  target, canonical retention (30 daily / 12 weekly / 12 monthly), failed/
  stale-backup behavior, encryption, least-privilege credentials.
- `docs/operations/backup-restore-runbook.md` — authoritative runbook (backup,
  restore, incident response, automated restore verification, security,
  Redis classification).
- `docs/operations/v1-observability-runbook.md` + `v1-alert-rules.prometheus.yml`
  — backup metrics and alert rules (`MedSphereBackupFailed`,
  `MedSphereBackupStaleWarning/Critical`, `MedSphereRestoreVerificationFailed`).
- `docs/adr/0027-production-backup-recovery-foundation.md` — architecture record.
- `docs/operations/task0022-backup-recovery-validation.md` — local evidence
  (native PostgreSQL 18, clearly NOT PostgreSQL 16 certification).

### CI

`.github/workflows/backup-restore-certification.yml` now also runs
`pnpm test:backup-recovery` and `node scripts/db-recovery-validation.mjs`
(PostgreSQL 16 service container) with explicit PASS-verdict gates.

## Key safety / security properties

- Credentials only via environment / PGPASSWORD; never argv, never logs.
- Logs contain host:port/database only; no backup content, patient data, or
  passwords; bounded output.
- `.gitignore` updated to block `*.dump`, `*.dump.gz`, `*.backup`, and local
  backup/status directories.
- Restore is isolated only; production promotion remains an explicit
  controlled operator action outside the utility.
- Privacy/consent (Task 0013), durable sessions (Task 0014), and exact-user
  audit evidence (Task 0019) are verified unchanged after restore.

## Migration compatibility

- Scenario A (current schema 29 migrations): backup → restore → migration
  state valid (29 = 29).
- Scenario B (older schema 27 migrations): backup → restore → `prisma
migrate deploy` forward → 29, `prisma:verify` (deploy + status + drift)
  reports no drift. Historical migrations are never edited or squashed.

## Validation evidence (local)

- Focused tests: `node --test scripts/backup-recovery.spec.mjs` → **26/26 PASS**.
- Real PostgreSQL 18.4 deterministic validation → **DB RECOVERY VALIDATION:
  PASS** (Scenario A + Scenario B).
- Real PostgreSQL 18.4 extended certification → **BACKUP RESTORE
  CERTIFICATION: PASS** (all 13 tables hash-matched; 6 durable-state checks).
- Exact PostgreSQL 16 execution: **BLOCKED BY ENVIRONMENT locally** (CI
  provides `postgres:16-alpine` once publication is authorized).

## Environment notes

- Docker Desktop was not used. Native PostgreSQL 18.4 server + 18.4 client
  tools were used. PostgreSQL-18 evidence is not claimed as PostgreSQL-16
  certification.
- A fresh pnpm install was required in the new worktree; a transient
  `EPERM: rename` during the first install attempt resolved on retry.

## Out of scope (unchanged)

Multi-region active-active, automatic regional failover, full DR
orchestration, Kubernetes DR, new healthcare features, patient UI,
notifications, billing/finance/analytics/AI, owner/CEO functionality,
provisional Task 0032+.

## Completion status

`TASK 0022 — IMPLEMENTATION/VALIDATION COMPLETE LOCALLY — CTO REVIEW PENDING`

Not accepted and not merged until CTO review. No push / PR / merge / deploy
without explicit CTO approval.
