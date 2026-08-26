# PostgreSQL Backup, Restore & Disaster-Recovery Runbook

This runbook covers the mechanics of creating a PostgreSQL backup for
MedSphere, verifying it, and restoring it into a clean database, plus how
to run the automated certification that proves the round trip preserves
schema and data. It is deliberately scoped to **portability and restore
correctness** -- it does not select a production backup storage vendor,
retention schedule, or RPO/RTO target. See "What this runbook does not
cover" at the end.

## What this proves

```
PostgreSQL running MedSphere schema/data
        |
        v
verified backup (pg_dump, custom format, SHA-256 hashed)
        |
        v
clean, separate database (never the source database)
        |
        v
restore (pg_restore)
        |
        v
schema + data integrity verification (row counts + canonical content hashes)
        |
        v
PASS / FAIL certification
```

## Automated certification

The certification script is `scripts/backup-restore-certification.mjs`. A
dedicated workflow, `.github/workflows/backup-restore-certification.yml`,
runs it on every pull request targeting `feature/database-architecture`
and on manual dispatch.

### Running it locally

```bash
export DATABASE_URL='postgresql://medsphere_dev:CHANGE_ME@localhost:5432/medsphere_dev?schema=public'
node scripts/backup-restore-certification.mjs
```

Requirements:

- PostgreSQL 16 client tools on `PATH`: `psql`, `pg_dump`, `pg_restore`,
  `createdb`, `dropdb` (matching the V1 database baseline -- see
  `compose/docker-compose.services.yml` for the accepted server image).
- The `DATABASE_URL` user must be able to create and drop databases on
  the target server (true for local development and CI's synthetic
  `medsphere_ci` role; never point this at a production credential).
- `pnpm install` already run in the repository (the script shells out to
  the repository's own accepted `pnpm --filter @medsphere/database run
prisma:deploy` command to ensure migrations are current before
  seeding).

### What it does, step by step

1. Confirms the source database is reachable and applies/verifies current
   migrations (idempotent -- safe even if already applied).
2. Seeds deterministic synthetic data covering `Tenant`, `User`,
   `TenantMembership`, `Provider`, `Product`, `Inventory`, `Batch`,
   `MedicineReservation`, and `AuditEvent` -- the same accepted
   direct-SQL bootstrap pattern already used by
   `scripts/task5-smoke-test.mjs` for rows no accepted API can create.
   All values are synthetic; no real names, contact details, or
   healthcare data.
3. Records pre-backup evidence: a row count and a canonical SHA-256 hash
   of every row (ordered by primary key) for each of those tables.
4. Creates a backup with `pg_dump --format=custom --no-owner
--no-privileges` and computes its SHA-256 hash.
5. Creates a **new, separate** database on the same server (never the
   source database; drops any stale one from a prior interrupted run
   first, so the target is provably clean).
6. Restores the backup into that clean database with `pg_restore
--no-owner --no-privileges`.
7. Verifies every required table exists in the restored database and
   that the applied-migration count matches the source exactly.
8. Re-computes the same row-count + canonical-hash evidence against the
   restored database and compares it to the pre-backup evidence,
   table by table.
9. Deletes the temporary backup file and drops the temporary restore
   database (unless `BACKUP_CERT_KEEP_ARTIFACTS=1` is set, for local
   debugging only).
10. Prints an explicit final verdict line: `BACKUP RESTORE CERTIFICATION:
PASS` or `BACKUP RESTORE CERTIFICATION: FAIL`, and exits non-zero on
    any failure.

### What counts as PASS

Every one of the following must hold:

- the backup file was created and is non-empty
- the clean restore database was created and is distinct from the source
- `pg_restore` completed
- every required table exists in the restored database
- the restored applied-migration count matches the source
- for every required table, the restored row count and canonical content
  hash exactly match the pre-backup evidence

### What counts as FAIL

Any of: the source database is unreachable, migrations cannot be
applied, seeding fails, `pg_dump` fails or produces an empty/unreadable
file, the restore database cannot be created, `pg_restore` fails, a
required table is missing after restore, the migration count differs, or
any table's restored row count or content hash differs from the
pre-backup evidence. The script never downgrades a failure to a warning
and always prints the explicit `FAIL` verdict line before a non-zero
exit.

## Manual backup and restore (outside the certification script)

Manual commands, for reference -- always confirm you are pointed at the
intended database before running any of these, and never against a
production connection string without separate, explicit authorization.

**Create a backup:**

```bash
pg_dump -h <host> -p <port> -U <user> -d <database> \
  --format=custom --no-owner --no-privileges \
  --file backup.dump
```

**Verify a backup file (sanity check, does not touch any database):**

```bash
pg_restore --list backup.dump > /dev/null && echo "backup file is readable"
sha256sum backup.dump
```

**Restore into a clean database:**

```bash
createdb -h <host> -p <port> -U <user> <clean_database_name>
pg_restore -h <host> -p <port> -U <user> -d <clean_database_name> \
  --no-owner --no-privileges \
  backup.dump
```

Never run `pg_restore` against the original source database -- restoring
over a live database is not a valid restore test and risks real data
loss. Always restore into a separate, newly created database.

## Operator safety rules

- Never point any command in this runbook at a production
  `DATABASE_URL`. This certification is for synthetic, non-production
  databases only.
- Never commit a backup file (`*.dump`) to the repository.
- Never log or paste a complete `DATABASE_URL` (it contains a password);
  share only host/port/database name when reporting an issue.
- The certification script uses `PGPASSWORD` via the environment, never
  as a command-line argument, so the password never appears in a process
  listing.
- Always let the script's own cleanup step run (or run the manual
  `dropdb`/temp-file cleanup yourself) -- do not leave restore-target
  databases or backup files lying around on a shared host.

## What this runbook does not cover

Production backup retention schedule, RPO/RTO targets, and storage
vendor/location selection (e.g. object storage, offsite replication) are
explicitly **separate, not-yet-defined launch-operations work** and are
out of scope here, per the V1 launch-readiness gap already tracked in
`PROJECT_STATUS.md` and `README.md`. This runbook only certifies that a
backup taken from a MedSphere PostgreSQL database can be restored into a
clean database, that the required representative tables exist with matching
row counts and canonical content hashes, and that applied migration-history
count matches the source -- restore _correctness_ for this certification
scope, not a production retention or recovery-time commitment.
