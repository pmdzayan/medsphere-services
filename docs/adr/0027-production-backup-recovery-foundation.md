# ADR-027: Production Backup, Restore, and Recovery Operations Foundation

**Status:** Proposed (implementation candidate for Task 0022; pending CTO review)

**Date:** 2026-09-06

**Decision owners:** AIM Project Owner and CTO

**Depends on:** ADR-002 (append-only database baseline), ADR-006 (supported
runtime), ADR-004 (durable audit), Task 0013 (privacy/consent), Task 0014
(durable sessions), Task 0019 (exact-user audit accountability)

## Context

AIM's durable application datastore is PostgreSQL (ADR-002, PostgreSQL 16
production target). Before Task 0022 the repository had a backup/restore
certification script and runbook that proved a populated database could
round-trip through `pg_dump`/`pg_restore`, but explicitly deferred the
production operations foundation: RPO/RTO targets, a canonical retention
policy, fail-closed restore tooling, integrity verification beyond
"pg_restore exited 0", backup observability, and a deterministic,
repository-owned recovery workflow operators can actually run against a real
database.

A backup file merely existing is not a recovery capability. AIM needs a
deterministic, documented, verifiable recovery process.

## Decision

### 1. PostgreSQL logical backups are the operative recovery path

- Backups use the standard PostgreSQL custom archive format
  (`pg_dump --format=custom --no-owner --no-privileges`) restorable with
  `pg_restore`. No proprietary serialization format is introduced.
- Managed-database/provider snapshots and point-in-time recovery depend on
  the future production deployment architecture. The repository defines the
  requirements and does not fabricate AWS/RDS/GCP/Azure resources.

### 2. Repository-owned deterministic workflows

- `scripts/aim-backup.mjs` — validates configuration, creates the
  backup, verifies the archive is readable, and emits bounded evidence.
- `scripts/aim-restore.mjs` — restores into a NEW isolated database
  with fail-closed preflight guards (production-target detection, source==
  target rejection, backup-archive validation, empty-target requirement).
- `scripts/aim-restore-verify.mjs` — standalone integrity verification
  (connections, required tables, primary keys, unique indexes, foreign-key
  counts, orphan rows including the Task 0019 composite attribution FK,
  migration history, expected row counts).
- `scripts/aim-backup-status.mjs` — bounded Prometheus text metrics
  describing backup success/failure/staleness and restore verification.
- `scripts/db-recovery-validation.mjs` — deterministic real-PostgreSQL
  validation: populate (including privacy/consent/session/audit fixtures) →
  backup → restore → verify → older-schema forward migration.

### 3. Restore tooling never targets production

The restore utility has no `--force-production` option. Restore targets are
classified as production when they match an explicit
`AIM_PRODUCTION_DATABASE_URL` or a conservative managed-host marker
(RDS/Azure/Cloud SQL suffixes), and these guards cannot be overridden.
`AIM_PRODUCTION_DATABASE_URL` is parsed explicitly at configuration time: if
it is present but malformed, the restore fails closed before any database
operation (no silent fallback to host-marker classification, no secret
leakage). Restoring over the source database is rejected. Production
promotion remains an explicit controlled operator action outside the basic
restore utility.

### 4. Integrity verification is required, not optional

`pg_restore` returning exit code 0 is not enough. The verifier checks schema,
constraints, orphan rows, migration history count, and optional expected row
counts. A restored database that fails verification is treated as a failed
recovery.

### 5. Privacy, consent, session, and audit state must survive recovery

Task 0013 privacy preferences and the append-only consent log, Task 0014
durable sessions and refresh-credential rotation, and Task 0019 exact-user
`AuditEvent` attribution are verified byte-for-byte after restore (canonical
content hashes plus targeted value checks). Recovery preserves durable state;
it never regenerates consent, resets privacy, or rewrites audit evidence.

### 6. Migration compatibility is proven on both directions

- Scenario A: backup from the current schema → restore → current migration
  state remains valid.
- Scenario B: backup from an older valid schema (a migration baseline built
  from the accepted append-only history) → restore → normal `prisma migrate
deploy` forward migrations bring it to the current schema with no drift.

### 7. Backup observability reuses the accepted Prometheus foundation

The repository's existing metrics/alerting architecture is extended, not
replaced: a node/textfile-collector command renders
`medsphere_backup_status`, `medsphere_backup_last_success_age_seconds`,
`medsphere_backup_stale{severity=...}`, and
`medsphere_backup_restore_verified` (correlated to the same restore operation
via a shared `operationId`, so a verification record never satisfies a
different restore), and the accepted alert-rules file gains backup
failure/staleness alerts. Metrics never contain passwords, URLs, backup
bytes, or patient data.

### 8. Retention policy is canonical

RPO, RTO, and retention values are defined in
`docs/operations/backup-retention-policy.md`, which is the single source of
truth for retention numbers (see that document and the runbook).

## Alternatives

### Store backups in Git / repository artifacts

Rejected — backups are large, sensitive, healthcare-adjacent data that must
be encrypted at rest in an operations-controlled store, never in source
control or public web directories.

### Create a custom backup serialization format

Rejected — the standard PostgreSQL custom archive is portable, supported by
`pg_restore`, and requires no proprietary tooling.

### Add a --force-production escape hatch to the restore utility

Rejected — "fail closed" means there is no convenient override in the basic
restore path. Production promotion is a separate controlled operator process.

### Rely on pg_restore exit code as the only verification

Rejected — a backup could restore "successfully" while missing constraints,
orphaning rows, or diverging in migration history; the integrity verifier
closes that gap.

### Replicate the observability stack for backups

Rejected — the existing Prometheus-compatible foundation is extended with a
textfile collector, not replaced with a second monitoring system.

## Consequences

### Positive

- An operator can create, restore, verify, and monitor AIM database recovery
  with deterministic, documented, fail-closed tooling.
- Recovery correctness is proven against a real PostgreSQL server including
  privacy/consent/session/audit preservation and forward migrations.
- Backup failure/staleness is observable and alertable.

### Negative and trade-offs

- Fail-closed guards are deliberately stricter than a friendly default; an
  operator restoring from a managed provider endpoint must use the documented
  controlled process rather than the basic restore utility.
- RPO/RTO values are V1 engineering targets, not contractual SLA/regulatory
  commitments.
- Exact PostgreSQL 16 certification requires CI (or another PostgreSQL 16
  environment); local PostgreSQL 18 evidence is supplementary, not a
  PostgreSQL 16 certification.

## Implementation constraints

- Use `pg_dump`/`pg_restore` custom-format archives; never invent a format.
- Keep credentials out of process arguments (PGPASSWORD only), out of logs,
  and out of Git.
- Never edit or squash accepted migrations; compatibility is proven by
  forward migration, not by rewriting history.
- No `--force-production`; no automatic overwrite of an existing AIM database.
- The restore target must be a new database or a provably empty one the
  operator explicitly chose to replace.
- Local evidence must record exact PostgreSQL client/server versions and must
  not claim PostgreSQL 16 certification from PostgreSQL 18 execution.

## Review triggers

Review this decision before:

- activating production deployment (choose provider snapshots/PITR,
  finalize storage location, re-confirm retention against real costs);
- changing the retention schedule or RPO/RTO targets;
- adding a non-isolated restore path or any `--force-production`-style flag;
- moving the recovery tooling into a deployed service;
- changing the accepted audit/privacy/session invariants that recovery must
  preserve.
