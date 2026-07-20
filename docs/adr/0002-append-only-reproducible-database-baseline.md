# ADR-002: Append-Only Reproducible Database Baseline

**Status:** Accepted

**Date:** 2026-07-20

**Owners:** MedSphere CTO and project owner

## Decision

MedSphere will preserve its existing Prisma migration history and add an append-only migration that advances the already-migrated authentication schema to the complete declared Prisma schema.

PostgreSQL 16 is the Version 1 database baseline. Every pull request must prove that a clean PostgreSQL database can apply the full migration chain and that the resulting database has no drift from `packages/database/prisma/schema.prisma`.

The migration baseline records the repository's current database shape; it does not accept the security, tenant-isolation, privacy, retention, or domain correctness of every model. Those controls remain gated by later stabilization sprints.

## Reason and context

The repository declares 18 Prisma models and 13 enums but previously contained one migration with only 7 authentication models and 4 enums. Application code already references tables absent from migration history, so a clean database could compile the code but could not run it.

The first migration may already exist in developer or review databases. Replacing or renaming it would make migration state ambiguous and encourage destructive resets. An additive migration gives both clean databases and previously initialized databases one forward path.

A schema file alone is not reproducibility evidence. The CI gate therefore deploys migrations to a real PostgreSQL service and compares the deployed database with the declared Prisma schema.

## Alternatives

### Squash all migrations into one new baseline

Rejected for this stage. It is clean for a brand-new product but invalidates the recorded migration identity of any database that already applied the authentication migration. Squashing may be reconsidered only with a documented inventory of every environment and a controlled baseline procedure.

### Use `prisma db push`

Rejected. `db push` does not provide an auditable, ordered production migration history and can conceal destructive or environment-specific drift.

### Keep the partial migration and rely on manual setup

Rejected. Manual setup is not reproducible, reviewable, or acceptable for healthcare infrastructure.

### Add missing tables without drift verification

Rejected. A generated migration can still diverge from the schema later; a real database deployment and drift comparison are required continuously.

## Consequences

### Positive

- Clean databases can recreate the complete declared schema.
- Existing databases that applied the first migration have a forward-only upgrade path.
- Pull requests detect broken migrations and schema drift before merge.
- Migration evidence becomes independent from developer machine state.
- Database recovery work remains reviewable and auditable.

### Negative and cost

- CI requires a PostgreSQL service and takes longer.
- The migration creates prototype tables whose domain designs remain unaccepted.
- Existing databases modified with `db push` may require manual reconciliation before deployment.
- Later security and inventory sprints will add further constraints and migrations.

### Risks

- Treating a reproducible table as an accepted feature could expose unsafe workflows prematurely.
- Editing an applied migration would split environment history.
- Deploying over an unknown database could fail or preserve undocumented drift.

## Implementation constraints

- Never edit or delete an applied migration. Correct mistakes with a reviewed forward migration.
- Never run `prisma db push` against a shared, review, staging, or production database.
- Run `prisma migrate deploy`, not `prisma migrate dev`, in CI and deployed environments.
- Stop and investigate if `prisma migrate status` or the drift check reports a difference.
- Back up and inventory any non-ephemeral database before applying migrations.
- Do not add seed data containing real people, credentials, tokens, patient data, or medicine transactions.
- Record model ownership, tenant scope, constraints, indexes, sensitive fields, and known gaps in the Database Bible.
- Keep S0.3–S0.5 controls blocked until their own implementation and negative tests are accepted.

## Review triggers

Review this decision before a migration squash, database-engine change, multi-region/data-residency design, tenant-partitioning change, first production deployment, or adoption of a migration tool other than Prisma Migrate.
