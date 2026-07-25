# Volume 10 — Testing Bible

**Status:** S0.4 accepted and merged; S0.5 evidence contract active

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
| Populated S0.3 upgrade | Valid assignments survive; five unsafe legacy-data categories fail closed      |

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

## Initial PR #7 infrastructure evidence

[Workflow run 30130479231](https://github.com/pmdzayan/medsphere-services/actions/runs/30130479231)
executed on commit `067ce63` with PostgreSQL 16, Redis 7, and
`RUN_AUTH_INFRASTRUCTURE_TESTS=true`.

| Check                               | Result                                               |
| ----------------------------------- | ---------------------------------------------------- |
| Clean four-migration deployment     | Passed                                               |
| Migration status and schema drift   | Passed; database current and no difference detected  |
| Auth PostgreSQL/Redis suites        | Passed — 20/20 suites, 120/120 tests, zero skipped   |
| Repository lint                     | Passed — 15/15 Turbo tasks                           |
| Repository tests                    | Passed — 17/17 Turbo tasks                           |
| Repository build                    | Passed — 15/15 Turbo tasks                           |
| Populated S0.3 migration conversion | Initial gap; covered by strengthened run 30131410814 |

The logged PostgreSQL error stating that the permission catalogue is
migration-owned is expected negative-test evidence; the test and workflow
passed.

The post-run contract review correctly withheld acceptance because deploying
all four migrations onto an empty database does not prove conversion of
populated S0.3 authorization data. `db:verify-upgrade` now creates isolated
temporary databases and verifies:

1. preservation of a valid legacy user-role assignment as a tenant membership
   role;
2. preservation of a valid accepted role-permission mapping;
3. creation of exactly eight global permissions and one fully granted tenant
   administrator role;
4. rejection of mutable legacy audit rows;
5. rejection of unsupported or deleted legacy permissions;
6. rejection of invalid built-in roles;
7. rejection of cross-tenant role-permission mappings;
8. rejection of role assignments without an unambiguous same-tenant
   membership.

## Strengthened PR #7 acceptance evidence

[Workflow run 30131410814](https://github.com/pmdzayan/medsphere-services/actions/runs/30131410814)
executed on commit `4f10eef`. It passed the clean database gate and all six
populated-upgrade scenarios: one valid conversion and five independent
fail-closed cases. It also reported no drift, 20/20 auth suites with 120/120
tests and zero skips, 15/15 lint tasks, 17/17 test tasks, and 15/15 build tasks.

This evidence satisfied the S0.4 technical acceptance rule. Final workflow
`30132631443` passed on commit `f2cd0df`, and PR #7 was squash-merged as
`4ea55a1`.

## CI acceptance sequence

The pull-request workflow must:

1. install the locked dependency graph with PNPM 9.15.0;
2. run `pnpm audit:prod`;
3. start PostgreSQL 16 and Redis 7;
4. set `RUN_AUTH_INFRASTRUCTURE_TESTS=true`;
5. run `pnpm db:verify`;
6. run `pnpm db:verify-upgrade`;
7. run `pnpm format:check`;
8. run `pnpm lint`;
9. run `pnpm test`;
10. run `pnpm build`.

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

## S0.4 completion

S0.4 passed the local and pull-request gates, executed its PostgreSQL 16 and
Redis 7 infrastructure suites without skips, passed migration and drift checks,
received final CTO review, and was merged in PR #7.

## S0.5 required evidence

S0.5 must add real PostgreSQL tests for:

- valid populated S0.4 migration and each fail-closed corruption class;
- same-tenant composite keys and quantity checks;
- append-only stock movement triggers;
- transaction-client propagation and rollback on any protected write failure;
- concurrent reservation without oversell;
- concurrent complete, cancel, and expiry with one winner;
- concurrent stock changes without lost updates;
- exact allocation consumption and release;
- deterministic FEFO under equal expiry and contention;
- tenant-scoped idempotency; and
- atomic stock/reservation audit evidence.

HTTP tests must prove trusted identity, permission denial, tenant isolation,
version and idempotency validation, bounded queries, and continued 404 behavior
for every unaccepted prototype route. Mock-only transaction tests are not
acceptance evidence.
