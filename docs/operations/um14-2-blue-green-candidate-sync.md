# UM14.2 — Database Synchronization & Candidate Creation

## Purpose

UM14.2 turns the inactive BLUE/GREEN database into a fresh candidate without changing production write authority.

It reuses Task 0022's PostgreSQL backup/restore integrity model and UM14.1's role state machine.

## Safety model

The synchronization command refuses to run unless all of the following are true:

- the current state is UM14.1-valid;
- exactly one environment is `ACTIVE`;
- the other environment is `ROLLBACK`;
- the source database identity matches `ACTIVE`;
- the candidate database identity matches the inactive environment;
- the source connection exactly matches `AIM_PRODUCTION_DATABASE_URL`;
- source and candidate are different host/port/database endpoints;
- the candidate database is not a protected PostgreSQL system database;
- the operator supplies the exact destructive confirmation `REBUILD:<ENVIRONMENT>:<DATABASE_IDENTITY>`;
- snapshot storage is outside the repository;
- the operator explicitly confirms that snapshot storage is encrypted.

The application write authority remains on `ACTIVE` for the entire task.

## Required environment

```text
AIM_BLUE_GREEN_STATE_FILE
AIM_BLUE_GREEN_EVIDENCE_FILE
AIM_BLUE_GREEN_NEXT_STATE_FILE
AIM_BLUE_GREEN_BACKUP_DIR
AIM_BLUE_GREEN_SOURCE_DATABASE_IDENTITY
AIM_BLUE_GREEN_CANDIDATE_DATABASE_IDENTITY
AIM_BLUE_GREEN_CANDIDATE_RELEASE_SHA
AIM_BLUE_GREEN_REBUILD_CONFIRMATION
AIM_BLUE_GREEN_BACKUP_STORAGE_ENCRYPTED=1
AIM_BLUE_GREEN_SOURCE_DATABASE_URL
AIM_BLUE_GREEN_CANDIDATE_DATABASE_URL
AIM_PRODUCTION_DATABASE_URL
```

Connection URLs are runtime secrets. They must come from the deployment secret store and must never be committed, pasted into evidence files or logged.

## Execute

First validate the repository contract:

```bash
pnpm test:blue-green-candidate-sync
```

Then an authorized operator may run:

```bash
node scripts/blue-green-candidate-sync.mjs sync
```

The command:

1. validates the UM14.1 state and UM14.2 safety policy;
2. creates a PostgreSQL custom-format snapshot of `ACTIVE`;
3. hashes and validates the snapshot archive;
4. reads the source migration-history count;
5. drops and recreates only the inactive candidate database;
6. restores the snapshot;
7. runs the existing AIM restore integrity verifier;
8. writes bounded synchronization evidence;
9. writes the proposed next UM14.1 state with inactive `ROLLBACK -> CANDIDATE`.

If candidate restore or verification fails, the failed candidate and snapshot are removed by default. Emergency diagnostic retention requires explicit `AIM_BLUE_GREEN_KEEP_FAILED_CANDIDATE=1` and/or `AIM_BLUE_GREEN_KEEP_FAILED_SNAPSHOT=1`, followed by controlled cleanup.

## What the evidence means

A successful evidence document proves that a specific candidate was rebuilt from a verified snapshot produced from the declared ACTIVE release and that the restored database passed repository-defined integrity checks.

It does **not** prove continuous replication or authorize application writes to the candidate. Production may continue receiving writes after the snapshot point.

## Production boundary

UM14.2 does not enable 5% canary writes, shadow traffic, migration of the new release, final catch-up, promotion or automatic rollback. Those remain later Milestone 14 tasks.

Before a future promotion, AIM must have an accepted mechanism ensuring writes made after the UM14.2 snapshot cannot be lost.
