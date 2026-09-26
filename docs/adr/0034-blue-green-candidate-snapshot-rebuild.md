# ADR-034: Blue/Green Candidate Snapshot Rebuild

**Status:** Accepted  
**Date:** 2026-09-26  
**Task:** UM14.2

## Decision

AIM will create the next blue/green database candidate by taking a consistent PostgreSQL custom-format snapshot from the current `ACTIVE` database and rebuilding only the inactive `ROLLBACK` database from that snapshot.

The synchronization tool must:

- prove the source database is the current `ACTIVE` database and exactly matches the operator-declared production database;
- prove the target database belongs to the inactive `ROLLBACK` environment;
- refuse source and target equality;
- require an exact destructive-rebuild confirmation bound to the inactive environment and opaque database identity;
- store the production snapshot outside the repository on operator-acknowledged encrypted storage;
- preserve sole application write authority on `ACTIVE`;
- verify the restored candidate using AIM's existing Task 0022 restore-integrity engine;
- emit bounded, secret-free synchronization evidence bound to the snapshot SHA-256;
- generate a proposed UM14.1 state transition from `ROLLBACK` to `CANDIDATE` only after integrity verification succeeds;
- remove a failed candidate and failed snapshot by default.

## Reason and context

AIM needs the inactive database to be fresh before an update is tested. Reusing the existing Task 0022 PostgreSQL backup/restore foundation avoids a second serialization format or a new database platform.

The production database remains live while `pg_dump` takes its transactionally consistent snapshot. The snapshot therefore represents a point in time; it is not continuous replication. UM14.2 does not authorize application writes to the candidate and does not by itself make the candidate safe for a write-bearing canary.

## Alternatives

1. **Direct filesystem/database-volume copy.** Rejected because it is provider-specific and harder to validate portably.
2. **Allow both databases to accept application writes during synchronization.** Rejected because inventory, reservations, billing, audit and future clinical records cannot tolerate unproven split-brain conflict resolution.
3. **Add logical replication immediately.** Deferred. It adds production database topology and operational complexity that require measured need and a separate accepted design.
4. **Keep the inactive database indefinitely and apply updates without refresh.** Rejected because stale production data would make validation and later promotion unsafe.

## Consequences

The inactive database is deliberately destroyed and rebuilt during candidate preparation. Operators must protect the snapshot as production-sensitive data. Candidate creation produces immutable evidence linking the source release, candidate release, physical environments, opaque database identities and snapshot hash without storing credentials, connection URLs or PHI.

Because this is snapshot-based, later rollout tasks must either remain read-only on the candidate or introduce an accepted catch-up/cutover mechanism before any promotion that could lose writes.

## Implementation constraints

- The existing `backup-recovery-core.mjs` verifier remains authoritative for restore integrity.
- Snapshot files must not be written into the Git repository or committed.
- Snapshot storage must use encrypted storage with restricted operator access.
- The target database name may not be `postgres`, `template0` or `template1`.
- `AIM_PRODUCTION_DATABASE_URL` must identify the same host, port and database as the source.
- Candidate cleanup is fail-closed and occurs by default after a failed rebuild/verification.
- Evidence files contain no database URL, database username, password, patient data or raw backup content.
- Application traffic/write routing is out of scope.
- Schema expand/contract enforcement is out of scope and remains a later Milestone 14 task.

## Review triggers

Review this ADR if AIM introduces logical/physical replication, multi-region active/active writes, provider-native blue/green databases, storage-level snapshots, more than two database slots, or any rollout design that sends application writes to both databases.
