# AIM PostgreSQL Backup, Restore, and Recovery Runbook (Authoritative)

**Status:** Proposed foundation (Task 0022) — implementation and local
validation complete; CTO review pending. This document is the authoritative
operations reference for the repository-owned tooling; it does not imply
production activation or CTO acceptance.

This is the **single authoritative** backup/restore/recovery runbook. It is
the operational companion to `docs/operations/backup-retention-policy.md`
(canonical retention values) and
`docs/adr/0027-production-backup-recovery-foundation.md` (architecture).

## What this proves

```
PostgreSQL running AIM schema/data
        |
        v
verified logical backup (pg_dump / scripts/aim-backup.mjs, custom format, SHA-256)
        |
        v
clean, separate, non-production database (never the source database)
        |
        v
restore (pg_restore / scripts/aim-restore.mjs)
        |
        v
integrity verification (scripts/aim-restore-verify.mjs) —
connects, required tables, PKs, unique indexes, FK counts, orphan rows,
migration history, expected row counts
        |
        v
PASS / FAIL verdict + bounded Prometheus status metrics
```

## Objectives (RPO / RTO)

### RPO — maximum acceptable data-loss window

- **Policy target:** **24 hours** (one daily logical backup).
- This is the engineering target, not a measured or contractual value. It is
  covered by the canonical retention policy in
  `docs/operations/backup-retention-policy.md`.
- Provider snapshots / point-in-time recovery are NOT yet activated; until
  then the RPO floor is the last successful logical backup, and the backup
  staleness alerts (28 h warning / 72 h critical) exist precisely so the
  actual exposure does not silently exceed the target unnoticed.

### RTO — target time to restore useful service

- **Policy target:** **4 hours** for an isolated logical restore of the
  current schema from a verified backup, including integrity verification
  and migration status confirmation.
- This is a **V1 engineering target, not a measured exercise result**. No
  recovery exercise has yet measured a production RTO; treat any prior
  "RTO: X PASS" statement as unsupported unless it cites a performed
  recovery exercise.
- Measured local restore time itself is recorded in
  `docs/operations/task0022-backup-recovery-validation.md` as supplementary
  evidence; elapsed wall-clock time on developer hardware is not a
  production RTO certification.

### Known limitations

- Exact PostgreSQL 16 validation requires CI or another PostgreSQL 16
  environment; local PostgreSQL 18 evidence is supplementary (see
  `docs/operations/task0022-backup-recovery-validation.md`).
- Managed-database snapshots, PITR/WAL archival, multi-region failover, and
  production promotion procedures are deliberately out of scope for the
  repository-owned tooling and remain deployment/activation work.

## Backup

### Tooling

Repository-owned command (Windows-safe, no shell interpolation, PGPASSWORD
only):

```
$env:DATABASE_URL = 'postgresql://user:password@host:5432/db?schema=public'
$env:AIM_BACKUP_DIR = 'C:\backups\aim'
node scripts/aim-backup.mjs
```

Required variables: `DATABASE_URL`, `AIM_BACKUP_DIR`.
Optional: `AIM_BACKUP_FILENAME`, `AIM_BACKUP_OVERWRITE=1`,
`AIM_BACKUP_STATUS_FILE`.

The command:

1. validates configuration and output location;
2. runs `pg_dump --format=custom --no-owner --no-privileges`;
3. fails on errors and removes any partial file;
4. verifies the archive is readable with `pg_restore --list`;
5. emits bounded output (host:port/database only, no password, no backup
   content) plus a SHA-256 of the archive; and
6. returns non-zero on failure and prints an explicit `AIM BACKUP:
FAIL`/`PASS` verdict.

### Schedule / frequency

- One logical backup per day in production (canonical schedule).
- One weekly and one monthly copy per the retention policy.
- Automated restore verification (Section "Automated restore verification")
  runs on a schedule (CI pull requests + an operations-scheduled job when
  deployment is activated).

### Where it is stored (conceptually)

- Locally into `AIM_BACKUP_DIR` first, then copied to operations-controlled
  encrypted storage. Never Git, never public web directories, never
  application assets, never GitHub repository artifacts as long-term
  production storage.
- A backup may be deleted from the local location only after the encrypted
  copy is verified (size + SHA-256).

### Retention and encryption

- Retention numbers live in exactly one place:
  `docs/operations/backup-retention-policy.md`.
- Backups are treated as sensitive healthcare/business data: encrypted in
  transit (TLS/SSH to the storage destination) and encrypted at rest
  (provider-managed encryption at minimum).

### Credentials / permissions

- The backup role has least privilege: `CONNECT`, `SELECT` on the
  application schema, and read access to system catalogs required by
  `pg_dump`. It does not have `SUPERUSER`, `CREATEDB`, or write access to
  application data.
- Credentials are supplied via environment variables / the accepted
  secret-management mechanism. Only configuration **names** are documented
  (e.g. `AIM_BACKUP_DATABASE_URL`); never real values.
- The password is passed to PostgreSQL tools via `PGPASSWORD`, never in the
  command line, so it cannot appear in a process listing or logs.

### How success is verified

- The backup command emits `AIM BACKUP: PASS` and a SHA-256.
- The status exporter (`scripts/aim-backup-status.mjs`) renders
  `medsphere_backup_status` / last-success age; stale/failed backups trip the
  alert rules.

## Restore

### Prerequisites

- A verified custom-format backup archive.
- A **separate, isolated, disposable target database** on a server you are
  authorized to create databases on. The target must NOT be production.
- Optionally `DATABASE_URL` (source reference) so the restore can read the
  expected migration count automatically, and
  `AIM_RESTORE_EXPECTED_MIGRATIONS` / `AIM_RESTORE_EXPECTED_COUNTS` for
  stronger assertions.

### Isolated-target requirement (fail closed)

The restore tool refuses to run if:

- the target matches `AIM_PRODUCTION_DATABASE_URL`;
- the target host matches a conservative managed-production marker
  (`.rds.amazonaws.com`, `.postgres.database.azure.com`, `.azure.com`,
  `.cloudsql.google.com`, `.clustercfg.`, ...);
- the target is identical to the source database;
- the backup archive is missing, empty, or unreadable;
- the target already contains AIM schema objects (an existing database with
  the Prisma migration table or any required AIM table);
- the target already exists at all (even empty) unless the operator
  explicitly sets `AIM_RESTORE_DROP_EXISTING=1`.

There is **no `--force-production` option**. Production promotion is an
explicit controlled operator action outside this utility.

### Command / process

```
$env:AIM_BACKUP_FILE = 'C:\backups\aim\aim-backup-<timestamp>.dump'
$env:RESTORE_DATABASE_URL = 'postgresql://user:password@host:5432/aim_t0022_restore'
$env:DATABASE_URL = 'postgresql://user:password@host:5432/medsphere_dev'   # source ref (optional)
node scripts/aim-restore.mjs
```

Step-by-step:

1. validates configuration (required `AIM_BACKUP_FILE`,
   `RESTORE_DATABASE_URL`);
2. production guard + source==target guard;
3. verifies the archive is readable;
4. reads expected migration count (from source or explicit env);
5. prepares the isolated target (create, or drop-empty when explicitly
   allowed);
6. restores with `pg_restore --no-owner --no-privileges`;
7. runs the full integrity verification battery;
8. prints `RESTORE INTEGRITY VERIFICATION: PASS`/`FAIL` and a final
   `AIM RESTORE: PASS`/`FAIL` verdict.

### Verification

The integrity verifier (`scripts/aim-restore-verify.mjs`, reusable
standalone):

- database connection succeeds;
- every required table exists (Tenant, User, TenantMembership, UserPrivacy,
  ConsentRecord, UserSession, UserSessionRefreshCredential, Provider,
  Product, Inventory, Batch, MedicineReservation, AuditEvent);
- every required table still has a primary key;
- required unique indexes still exist (Tenant.slug, User.email,
  UserSession.refreshTokenHash, UserSessionRefreshCredential.hash);
- FK counts meet per-table minima;
- zero orphan rows across representative relationships, including the Task
  0019 composite `AuditEvent(actorMembershipId, actorUserId, tenantId)`
  attribution FK;
- migration history count matches the source (when asserted);
- expected row counts match (when an expected-counts file is supplied).

`pg_restore` exiting 0 is not sufficient.

### Rollback / abort behavior

- Any failure before target creation exits non-zero without touching
  anything.
- A failure after the target was created by this run drops the target again
  (disposable isolated target; set `AIM_RESTORE_KEEP_ON_FAILURE=1` to keep
  it for debugging).
- Restore never overwrites an existing AIM database automatically; a target
  that already has AIM objects must be dropped by an operator manually after
  they confirm it is disposable.

### Migration-forward process (Scenario B)

When restoring an older schema backup and advancing to the current schema:

1. restore the backup into the isolated target (as above);
2. run the repository's accepted forward migration command against the
   target: `pnpm --filter @medsphere/database run prisma:verify` (deploy +
   status + drift);
3. confirm `prisma migrate deploy` advances the target and the drift check
   reports no difference;
4. re-run the restore integrity verification (expected row counts must still
   match; migration count will now be the current total).

## Incident response

### Backup failed

1. Confirm the failure is real (non-zero exit, `AIM BACKUP: FAIL`,
   status metric `medsphere_backup_status 0`).
2. Check the bounded log for host/port/database and the exact `pg_dump`
   error; never paste the connection URL or password.
3. Correct the cause (connectivity, credentials/secret rotation, disk
   space, permissions) and retry.
4. If the retry fails, do not silently accept a missing backup; escalate to
   the on-call operator and record the incident. A failed backup does not
   extend the retention clock.

### Backup became stale

1. The backup-staleness warning alert (older than 28 h) or the
   backup-staleness critical alert (older than 72 h) fires.
2. Determine the last successful backup timestamp
   (`medsphere_backup_last_success_timestamp_seconds`).
3. Take an immediate new backup.
4. If backups keep failing, treat as the "backup failed" incident; if the
   backup succeeds but records look wrong, inspect the status file
   (`AIM_BACKUP_STATUS_FILE`) for malformed/duplicate records.

### Restore verification failed

1. A failed restore or failed integrity verification is a **backup failure**
   for retention purposes.
2. Preserve the backup archive; do not delete it while diagnosing.
3. Determine which check failed (connection, schema, constraints, orphans,
   migration count, row counts).
4. Confirm the target was genuinely clean and the backup archive was
   created with matching client/server-version tooling where material.
5. Re-run verification against a fresh isolated target before rewriting or
   discarding the archive.
6. If the archive is provably bad, treat the source of that backup as
   unrecoverable and verify the next older archive (that is exactly why the
   retention policy keeps 30 daily + 12 weekly + 12 monthly archives).

## Automated restore verification

A backup must periodically prove it is restorable. Repository-owned
mechanisms:

- **CI (always available):** `.github/workflows/backup-restore-certification.yml`
  runs, on every PR to `feature/database-architecture` and on manual
  dispatch, against a real PostgreSQL 16 service container:
  `pnpm test:backup-recovery` (focused unit tests) →
  `node scripts/backup-restore-certification.mjs` →
  `node scripts/db-recovery-validation.mjs` (populate → backup → restore →
  verify → migrate-forward), each requiring an explicit PASS verdict.
- **Operations (when deployment is activated):** schedule the same
  `db-recovery-validation` command in an isolated database to periodically
  restore the latest production backup and verify it. This job never runs a
  destructive restore against production.
- **Local:** `DATABASE_URL=... node scripts/db-recovery-validation.mjs` (see
  the validation evidence document).

## Security rules

- Backups are sensitive healthcare/business data; encrypt in transit and at
  rest; restrict access to authorized operators.
- Restore targets are never production; there is no override flag.
- No credentials committed to Git; secrets come from environment
  variables/secret management; document configuration names only.
- No production connection URLs printed into normal logs; no patient records
  or backup content dumped into console logs.
- No secret values in documentation; no credentials embedded in scripts.

## Redis

Redis is **not** the authoritative disaster-recovery datastore. Its
accepted role in AIM V1 is reconstructable/ephemeral operational state
(rate-limit counters and similar). PostgreSQL is the durable datastore and
is the recovery path this runbook implements. See
`docs/operations/task0022-backup-recovery-validation.md` for the audit
detail.

## Related documents

- `docs/operations/backup-retention-policy.md` — canonical retention values
- `docs/adr/0027-production-backup-recovery-foundation.md` — architecture
- `docs/operations/v1-observability-runbook.md` — metrics/alerting
- `docs/operations/v1-alert-rules.prometheus.yml` — backup alerts
- `docs/operations/task0022-backup-recovery-validation.md` — local evidence
- `PROJECT_RULES.md`, `README.md` — governance and launch-gate context
