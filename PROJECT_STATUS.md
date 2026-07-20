# MedSphere Project Status

**Status date:** 2026-07-20

**Baseline commit:** `75e4d45855d5e99eab355c41a5e424bbda602a9b`

**Accepted stabilization baseline:** `842a8254ac064646c11f410c8595138aa58562d9`

**Current remediation branch:** `cto/s0.3-authentication-tenant-context`

**Release state:** Not approved for production or real healthcare data

## Current sprint

### Stabilization Sprint S0.3 — Authentication and Trusted Tenant Context

**Status:** ADR accepted — implementation in progress

**In scope**

- Global identity and explicit tenant memberships
- Fail-fast asymmetric access-token configuration
- Opaque hashed refresh credentials with atomic rotation and replay detection
- Trusted request identity derived from active user, membership, tenant, and session state
- Global deny-by-default authentication with an explicit public allowlist
- Self-only logout and session revocation
- Authentication security events, negative tests, tenant-isolation tests, and concurrency tests

**Out of scope**

- Tenant-safe roles, permissions, and durable audit integration — S0.4
- Inventory and reservation integrity — S0.5
- MFA, password recovery, email delivery, OIDC/SAML, ABHA/ABDM, and frontend implementation

**Completion criteria**

- ADR-003 and affected Development Bible volumes are accepted and current.
- Forward migrations reproduce the membership and secure-session schema without drift.
- No raw refresh credential or fallback signing secret is persisted or used.
- Every protected endpoint derives user and tenant context from a verified active chain.
- Refresh rotation, replay handling, logout, and concurrent refresh behavior pass real PostgreSQL tests.
- Unaccepted prototype endpoints are not reachable from the active application.
- Formatting, database verification, lint, tests, build, CI, and CTO review pass.

## CTO acceptance ledger

| Area                        | Repository evidence                                                | CTO status         |
| --------------------------- | ------------------------------------------------------------------ | ------------------ |
| Planning and architecture   | ADR-001 and S0.1 governance merged in PR #1                        | Accepted baseline  |
| Monorepo/tooling foundation | PNPM, Turbo, TypeScript, NestJS, Prisma, shared packages exist     | Partially accepted |
| Database reproducibility    | PR #2 migration and clean-database gates CI-verified and merged    | Accepted base      |
| Inventory foundation        | Batch, stock, availability, FEFO, and search scaffolding exists    | Prototype only     |
| Reservation                 | Competing implementations and unsafe transaction boundaries        | Rejected           |
| Task 11 — Identity/RBAC     | S0.3 authentication implementation under review; RBAC remains S0.4 | Partial/review     |
| Task 12 — Audit Logging     | Storage scaffolding exists; integration and isolation absent       | Rejected           |
| Task 13 onward              | Dependencies are not complete                                      | Blocked            |

## Critical blockers

1. S0.3 clean PostgreSQL migration, replay/concurrency, Redis, route-inventory, and negative API evidence is not yet accepted by CI.
2. Cross-tenant RBAC risks remain and cannot be repaired before S0.3 acceptance.
3. Non-atomic reservation and inventory mutations.
4. Competing inventory/batch sources of truth.
5. Audit logging not integrated into business operations.
6. Medical-record functionality remains blocked before consent/privacy controls.
7. Repository-wide integration, security, and tenant-isolation coverage remains insufficient beyond S0.3.

The supporting evidence is recorded in [the baseline audit](docs/audits/2026-07-20-cto-baseline.md).

## Dependency-ordered recovery

1. **S0.1 Architecture and governance** — accepted and merged in PR #1
2. **S0.2 Reproducible database baseline** — accepted and squash-merged in PR #2
3. **S0.3 Authentication and trusted tenant context** — current
4. **S0.4 Tenant-safe RBAC and audit integration** — blocked by S0.3
5. **S0.5 Inventory ledger and reservation integrity** — blocked by S0.4
6. Reassess remaining Inventory and Compliance roadmap work

Only one recovery sprint may be active at a time. Exact boundaries may be refined through an ADR, but dependencies must not be skipped.

## S0.3 implementation evidence in progress

- ADR-003 accepted; Backend, Database, and Security Bible volumes updated.
- Global user plus explicit tenant-membership schema and append-only migration implemented.
- RS256 access tokens, opaque HMAC-digested refresh credentials, serializable rotation, replay-family compromise, and self-scoped revocation implemented.
- Global deny-by-default authentication mounted; accepted public metadata centralized; unsafe prototype modules unmounted.
- Redis-backed network and account/session limits plus opt-in OpenAPI documentation implemented.
- Auth unit tests currently pass locally; PostgreSQL and Redis integration suites are present but require CI services for acceptance.
- S0.3 remains in progress until clean migration/drift, all quality gates, integration tests, diff review, and CI pass.

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

## S0.2 verification evidence

| Check                                          | Result                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Schema audit                                   | 18 models and 13 enums declared; the original migration contains 7 models and 4 enums                                          |
| Prisma schema validation and client generation | Passed                                                                                                                         |
| Additive schema diff                           | Tracked migration body exactly matches Prisma's generated diff from original auth state to declared schema                     |
| Clean PNPM locked installation                 | Passed in GitHub Actions ([workflow run 29732542356](https://github.com/pmdzayan/medsphere-services/actions/runs/29732542356)) |
| Clean PostgreSQL 16 migration deploy           | Passed                                                                                                                         |
| `prisma migrate status`                        | Passed — no unapplied migrations reported                                                                                      |
| Live-database-to-schema drift verification     | Passed — no drift detected                                                                                                     |
| Formatting                                     | Passed                                                                                                                         |
| Lint                                           | Passed                                                                                                                         |
| Tests                                          | Passed                                                                                                                         |
| Build                                          | Passed                                                                                                                         |
| PostgreSQL container cleanup                   | Passed                                                                                                                         |

The initial implementation commit `ed03abee671d075967499bfca742afbd61eb02d4`, the documentation evidence commit `c880d3d4e759ba369023dd319c5213885e06af4b`, and the final squash-merge commit `4480642b76dff0027c9ac63c598daa7cde8d53c3` all passed every gate. Reference: [PR #2](https://github.com/pmdzayan/medsphere-services/pull/2), workflow runs [29732542356](https://github.com/pmdzayan/medsphere-services/actions/runs/29732542356), [29736345081](https://github.com/pmdzayan/medsphere-services/actions/runs/29736345081), and [29736842625](https://github.com/pmdzayan/medsphere-services/actions/runs/29736842625).

PR #2 was accepted and squash-merged into `feature/database-architecture`.
