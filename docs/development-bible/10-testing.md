# Volume 10 — Testing Bible

**Status:** S0.4 local verification complete; infrastructure and CI acceptance
pending

**Runtime contract:** Node.js 20.11.1, PNPM 9.15.0, PostgreSQL 16, and Redis 7

## Purpose

MedSphere uses evidence-based acceptance. A test is evidence only when its
required dependencies are available, it executes rather than skips, and its
result is recorded truthfully. Unit or mocked HTTP tests cannot replace
database constraints, transaction concurrency, Redis behavior, migration
deployment, or drift verification.

## Test layers

| Layer                  | Purpose                                                                 | Acceptance boundary                                 |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| Static validation      | Formatting, lint, strict test/source type checking, and build contracts | Must pass repository-wide                           |
| Unit                   | Validation, metadata policy, services, guards, utilities, error mapping | Deterministic and isolated                          |
| HTTP application       | Real Nest assembly, guards, pipes, filters, routing, and response shape | External adapters may use controlled test doubles   |
| PostgreSQL integration | Transactions, constraints, triggers, isolation, rollback, and races     | Must use the supported real database version        |
| Redis integration      | Shared counters and fail-closed rate limiting                           | Must use the supported real Redis version           |
| Migration verification | Clean deploy, status, upgrade compatibility, and live-schema drift      | Must run against clean PostgreSQL in CI             |
| Future E2E/performance | Cross-module journeys, capacity, latency, and failure recovery          | Added only with accepted downstream product modules |

## S0.4 required infrastructure matrix

The infrastructure suite is activated only by
`RUN_AUTH_INFRASTRUCTURE_TESTS=true`.

| Area                   | Required proof                                                                 |
| ---------------------- | ------------------------------------------------------------------------------ |
| Tenant authorization   | Same-user multi-tenant isolation; inactive membership and soft-delete behavior |
| Database tenant safety | Cross-tenant membership-role and role-permission inserts fail                  |
| Permission catalogue   | Runtime insert, update, and delete fail                                        |
| Built-in role shape    | Invalid built-in role mutation fails at the database                           |
| Audit integrity        | Actor/scope, metadata, vocabulary, append-only, and tenant constraints hold    |
| Transaction atomicity  | Required audit failure rolls back protected role, assignment, or session work  |
| Concurrency            | One role-version winner and at least one active administrator remain           |
| Assignment idempotency | Concurrent duplicate `PUT` requests create one assignment and one event        |
| Audit pagination       | Cursor order remains stable when events share a timestamp                      |
| Platform isolation     | Platform events cannot appear in tenant reads                                  |
| Session lifecycle      | Create, refresh, replay response, logout, and logout-all evidence is atomic    |
| Redis throttling       | Shared counters behave correctly and infrastructure failure is not bypassed    |

## Local S0.4 verification evidence

The local environment did not provide PostgreSQL, Redis, Docker, Podman, or
`psql`. Therefore infrastructure suites were deliberately skipped locally and
are not described as passing.

| Check                                       | Result                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Locked dependency installation              | Passed with PNPM 9.15.0                                                |
| Prisma schema validation                    | Passed                                                                 |
| Prisma client generation                    | Passed                                                                 |
| Static schema-to-empty migration comparison | Passed for modeled S0.4 objects; not a live migration or trigger check |
| Repository formatting                       | Passed in the final local rerun                                        |
| Repository lint                             | Passed — 15/15 Turbo tasks                                             |
| Repository tests                            | Passed locally — 17/17 Turbo tasks; infrastructure suites skipped      |
| Auth strict test type-check and Jest        | Passed after final code review — 104 passed, 16 infrastructure skipped |
| Repository build                            | Passed — 15/15 Turbo tasks                                             |
| PostgreSQL/Redis integration                | Pending CI; not executed locally                                       |
| Clean deploy, upgrade, status, and drift    | Pending CI; not executed locally                                       |

The evidence table must be updated with CI links before CTO acceptance.

## CI acceptance sequence

The pull-request workflow must:

1. install the locked dependency graph with PNPM 9.15.0;
2. start PostgreSQL 16 and Redis 7;
3. set `RUN_AUTH_INFRASTRUCTURE_TESTS=true`;
4. run `pnpm db:verify`;
5. run `pnpm format:check`;
6. run `pnpm lint`;
7. run `pnpm test`;
8. run `pnpm build`.

Any skipped infrastructure suite, migration drift, flaky concurrency result,
lint warning promoted to error, test failure, or build failure blocks
acceptance.

## Test-writing standards

- Test behavior and security invariants, not private implementation details.
- Use explicit tenant fixtures and assert both allowed and denied boundaries.
- Include malformed, missing, stale, forged, and cross-tenant inputs.
- Exercise transaction rollback and concurrency for race-sensitive mutations.
- Keep fixtures free of real patient, credential, or production data.
- Never weaken production validation or guards to simplify a test.
- Type-check all test files under strict project settings.
- Keep infrastructure gating explicit so local skips cannot be mistaken for CI
  evidence.

## S0.4 completion rule

S0.4 can be accepted only after the local gates remain green, the pull-request
workflow executes every infrastructure suite on PostgreSQL 16 and Redis 7,
database deployment and drift checks pass, the final code/security review has
no unresolved findings, and the evidence links are recorded in
`PROJECT_STATUS.md`.
