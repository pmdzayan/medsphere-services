# MedSphere Project Status

**Status date:** 2026-07-20

**Baseline commit:** `75e4d45855d5e99eab355c41a5e424bbda602a9b`

**Accepted stabilization baseline:** `d8958c4c1573b181e1f23874386b86ee837dd305`

**Current remediation branch:** `cto/s0.2-reproducible-database-baseline`

**Release state:** Not approved for production or real healthcare data

## Current sprint

### Stabilization Sprint S0.2 — Reproducible Database Baseline

**Objective:** Make the complete declared Prisma schema reproducible through append-only migrations, a documented database contract, and automated clean-PostgreSQL deployment and drift verification.

**Status:** Implementation in progress — clean-database CI evidence required

**In scope**

- Preserve the existing authentication migration
- Add an incremental migration from the auth schema to all 18 declared models
- ADR-002 for append-only migration and verification policy
- PostgreSQL 16 local development baseline
- Clean-database migration deploy, status, and drift commands
- Mandatory PostgreSQL migration verification in pull-request CI
- Database Bible covering models, columns, relationships, indexes, enums, ownership, and known gaps

**Out of scope**

- Authentication or trusted tenant-context implementation
- Tenant-safe RBAC and audit integration
- Inventory/reservation redesign
- Consent, verification, privacy, supplier, pharmacy, or other new feature work
- Production deployment

**Completion criteria**

- The existing migration remains unchanged and a forward migration completes the declared schema.
- A clean PostgreSQL 16 database applies every migration successfully.
- `prisma migrate status` reports no unapplied migration.
- Live-database-to-schema drift comparison reports no difference.
- Database documentation distinguishes reproducibility from feature acceptance.
- Formatting, lint, tests, build, workflow syntax, links, and diff review pass.

## CTO acceptance ledger

| Area                        | Repository evidence                                             | CTO status         |
| --------------------------- | --------------------------------------------------------------- | ------------------ |
| Planning and architecture   | ADR-001 and S0.1 governance merged in PR #1                     | Accepted baseline  |
| Monorepo/tooling foundation | PNPM, Turbo, TypeScript, NestJS, Prisma, shared packages exist  | Partially accepted |
| Database reproducibility    | Additive migration and clean-database gate under S0.2 review    | In remediation     |
| Inventory foundation        | Batch, stock, availability, FEFO, and search scaffolding exists | Prototype only     |
| Reservation                 | Competing implementations and unsafe transaction boundaries     | Rejected           |
| Task 11 — Identity/RBAC     | Authentication and tenant enforcement incomplete                | Rejected           |
| Task 12 — Audit Logging     | Storage scaffolding exists; integration and isolation absent    | Rejected           |
| Task 13 onward              | Dependencies are not complete                                   | Blocked            |

## Critical blockers

1. Empty JWT strategy and missing deny-by-default authentication enforcement.
2. Client-controlled or hard-coded identity and tenant context.
3. Cross-tenant RBAC risks.
4. Prisma schema and migration history mismatch until S0.2 clean-database evidence passes.
5. Non-atomic reservation and inventory mutations.
6. Competing inventory/batch sources of truth.
7. Audit logging not integrated into business operations.
8. Medical-record endpoints exposed before consent/privacy controls.
9. Insufficient automated tests, especially integration and security tests.
10. Integration, security, migration, and tenant-isolation test coverage remains insufficient.

The supporting evidence is recorded in [the baseline audit](docs/audits/2026-07-20-cto-baseline.md).

## Dependency-ordered recovery

1. **S0.1 Architecture and governance** — accepted and merged in PR #1
2. **S0.2 Reproducible database baseline** — current
3. **S0.3 Authentication and trusted tenant context** — blocked by S0.2
4. **S0.4 Tenant-safe RBAC and audit integration** — blocked by S0.3
5. **S0.5 Inventory ledger and reservation integrity** — blocked by S0.4
6. Reassess remaining Inventory and Compliance roadmap work

Only one recovery sprint may be active at a time. Exact boundaries may be refined through an ADR, but dependencies must not be skipped.

## Progress reporting rule

Progress is measured by accepted milestone criteria, not by the number of files or endpoints present. Percentages are suspended until the stabilization milestone establishes reproducible builds, tests, migrations, security boundaries, and review evidence.

## S0.1 validation evidence

| Check                          | Result                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| Locked dependency installation | Passed with PNPM 9.15.0 after registry retries                  |
| `pnpm format:check`            | Passed                                                          |
| `pnpm lint`                    | Passed — 15/15 tasks                                            |
| `pnpm test`                    | Passed — 17/17 Turbo tasks                                      |
| `pnpm build`                   | Passed — 15/15 tasks with 0 cached                              |
| Markdown links                 | Passed — all repository-local links resolve                     |
| Workflow syntax                | Passed — quality and deployment-freeze YAML parsed successfully |

PR #1 was accepted and squash-merged as `d8958c4c1573b181e1f23874386b86ee837dd305`.

## S0.2 evidence status

- Schema audit: 18 models and 13 enums declared; the original migration contains 7 models and 4 enums.
- Prisma schema validation and client generation: passed.
- Additive schema diff: the tracked migration body exactly matches Prisma's generated diff from the original auth state to the declared schema.
- Formatting: passed.
- Local lint: passed — 15/15 uncached Turbo tasks using the previously verified locked dependency set mirrored into the isolated S0.2 worktree.
- Local tests: passed — 17/17 uncached Turbo tasks; 75/75 Jest tests passed.
- Local build: passed — 15/15 uncached Turbo tasks.
- JSON/YAML syntax, repository-local Markdown links, migration destructive-statement scan, and `git diff --check`: passed.
- Clean locked install in the isolated S0.2 worktree: blocked by repeated registry HTTP 502 responses; the mirrored-dependency checks above are local evidence, not a substitute for the pull-request clean install.
- Clean PostgreSQL migration deploy and drift check: pending pull-request CI.

S0.3 must not begin until S0.2 is reviewed, its required GitHub checks pass, and its pull request is merged.
