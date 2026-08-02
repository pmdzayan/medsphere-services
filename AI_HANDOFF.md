# MedSphere AI Handoff

**Last updated:** 2026-08-02

**Current sprint:** G3.1 — trusted provider access and read-only stock boundary

**Next feature work:** Blocked until G3.1 exact-commit CI and merge acceptance

## Mandatory startup sequence

Before changing code, every AI agent must:

1. Read the repository rather than assuming its structure.
2. Read `PROJECT_RULES.md`.
3. Read `PROJECT_STATUS.md`.
4. Read `PRODUCT_ROADMAP.md`.
5. Read the relevant accepted ADRs.
6. Read the relevant Development Bible volume and existing tests.
7. Identify reusable services, DTOs, utilities, guards, repositories, validation, and established patterns.
8. Confirm the current sprint and its dependencies.

If a required document is missing or conflicts with an accepted ADR, stop implementation and report the conflict to the CTO.

## Current architectural context

ADR-001 selects a modular monolith for Version 1. ADR-002 preserves append-only
migration history and requires clean PostgreSQL deployment and drift
verification. ADR-003 defines global identity, explicit tenant membership,
asymmetric access JWTs, opaque rotated refresh credentials, and deny-by-default
authentication. ADR-004 defines tenant-safe authorization and durable audit.
ADR-005 defines batch stock, the movement ledger, and medicine reservation
integrity. ADR-006 defines the supported runtime, dependency audit, rejected
prototype process gate, Redis throttle contract, security headers, safe error
boundary, and query-logging policy. The repository still contains seven NestJS applications sharing a
Prisma database. Do not treat those deployment boundaries as approved domain
boundaries, and do not add another service.

The migration must be incremental:

- Capture behavior with tests before moving or removing code.
- Assign domain ownership before consolidating persistence.
- Keep security deny-by-default during migration.
- Do not introduce temporary public endpoints or client-controlled identity fallbacks.
- Preserve future extraction through explicit contracts and domain events.

## Current risk context

- S0.3 authentication and S0.4 authorization/audit are accepted and merged.
- The unsafe prototype RBAC and audit implementations were removed. Only the
  reviewed S0.4 authorization administration and tenant-audit APIs are mounted.
- S0.4 tenant-safe authorization and durable audit passed PostgreSQL
  constraints, triggers, atomicity, concurrency, Redis, clean migration, drift,
  populated S0.3 upgrade verification, and the final documentation workflow.
- Provider, product, reservation, and medical-record controllers remain
  unmounted. G3.1 mounts only a provider-scoped stock read controller.
- The accepted stabilization and frontend baseline is PR #10 squash commit
  `410368cda73fc151b04996d547b62db22231a9e8`.
- S0.5 now defines `Batch` as physical/held quantity authority, uses an
  append-only movement ledger, and stores typed reservation items and
  allocations. Its accepted production HTTP boundary and live frontend
  integration remain open.
- Durable audit covers S0.4 authorization and accepted authentication session
  mutations. Future business modules must add atomic audit coverage when their
  own sprints are accepted.
- Medical-record functionality precedes consent and privacy foundations.
- S0.4 infrastructure coverage executed on PostgreSQL 16 and Redis 7 with zero
  skipped tests.

See `docs/audits/2026-07-20-cto-baseline.md` for the accepted baseline.

## Current S0.5 boundary

- S0.4 is accepted and squash-merged in PR #7.
- ADR-005 and
  `docs/sprints/S0.5-inventory-ledger-and-reservation-integrity.md` are the
  implementation authority.
- Inventory owns provider-product configuration, batches, stock movements,
  availability, FEFO, medicine reservations, items, and batch allocations.
- Batch is the sole physical and held quantity state. `StockMovement` is the
  append-only on-hand ledger. `InventoryHistory` is retired only after verified
  migration.
- Public patient reservation creation, supplier, marketplace, delivery,
  payment, frontend, and controlled-medicine work remain blocked.
- The CTO owns schema, migration, transaction, concurrency, tenant, audit, and
  final acceptance decisions.

## S0.5 and G3.1 checkpoint state

1. Acceptance synchronization — completed
2. Architecture and sprint contract — completed and merged in PR #8
3. ADR-006 runtime/security prerequisite — accepted
4. Database schema and populated migration verification — implemented on PR #10
5. Shared transaction and audit primitives — implemented on PR #10
6. Stock model, ledger, FEFO, and availability — implemented on PR #10
7. Medicine reservation hold lifecycle — implemented on PR #10
8. PR #10 exact-commit quality workflow — passed on `3003625` in run
   `30741672770`
9. PR #10 merge acceptance — completed as `410368c`
10. G3.1 provider-scope ADR, schema, migration, permissions, routes, and tests —
    implementation complete locally
11. G3.1 exact-commit PostgreSQL/Redis CI and review — pending
12. Later inventory mutations and live frontend integration — blocked pending
    G3.1 acceptance

If ownership transfers, resume at the first pending checkpoint. Do not use
`cline/s0.4-rbac-audit` or
`rescue/unplanned-marketplace-integration-work` as an S0.5 base.

## Exact continuation point

Continue from `cto/gate3-trusted-provider-scope` only. Finish G3.1 migration,
provider-assignment, stock-read, integration, documentation, and full quality
verification. Obtain exact-commit CI and merge acceptance before designing any
inventory mutation or replacing frontend preview data. Keep Gates 2 and 4–9
blocked in the dependency order recorded by the Gates 1–9 audit.

Cline may receive only a complete, bounded prompt for characterization tests or
mechanical work whose contract is already fixed by ADR-005. Cline must not
redesign the schema, quantity authority, transaction boundary, permission
catalogue, audit actor scope, or route exposure.

## Agent routing

| Agent           | Authorized work                                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT / Codex | Product and system architecture; roadmap and dependency control; Architecture Decision Records; database strategy; security and healthcare compliance; large, high-risk, or cross-module backend implementations; sprint design; final code and architecture review; documentation acceptance; milestone acceptance                                                                           |
| Claude          | Frontend architecture; frontend implementation; components, pages, workflows, state management, and API integration; responsive behavior; accessibility; frontend testing. Must use approved backend contracts and frontend specifications. Must not independently change backend architecture or API contracts                                                                               |
| Cline           | Small, bounded backend changes; configuration improvements; documentation maintenance; small bug fixes; bounded refactoring; supporting unit or integration tests; repository maintenance tasks. Must not make major architecture, database-strategy, security-policy, compliance-policy, or cross-module decisions without CTO approval. Must not implement frontend work assigned to Claude |

An agent must not begin a later milestone, combine unrelated modules, or expand scope because a nearby defect looks convenient to fix. Report out-of-scope defects in the completion report.

## Cline task-bundling policy

- One Cline prompt must have one coherent sprint objective.
- A prompt may contain multiple small work items when all items:
  - belong to the same sprint;
  - affect the same module, layer, or governance outcome;
  - share dependencies or validation;
  - can be reviewed together safely;
  - do not bypass roadmap dependencies.
- There is no fixed numeric limit for related small work items.
- Do not combine unrelated modules merely to make a larger prompt.
- Every work item must have explicit requirements, constraints, acceptance criteria, and deliverables.
- Every Cline prompt must still include objective, repository analysis, requirements, constraints, coding standards, validation, and deliverables.
- Cline must read `AI_HANDOFF.md` and `PROJECT_STATUS.md` before implementation.
- Cline must reuse existing services, DTOs, utilities, guards, repositories, tests, and patterns.
- Cline must use safe VS Code navigation, refactoring, warning-fixing, and rename tools where appropriate.

## Completion report contract

Every implementation handoff must include:

- Objective and acceptance status
- Files modified
- Database and migration changes
- API endpoints and contracts
- Permissions and tenant behavior
- Audit/logging behavior
- Tests added and executed
- `pnpm lint` result
- `pnpm test` result
- `pnpm build` result
- Remaining work and risks
- Suggestions for the next sprint, without starting it

No command may be described as passing if it was skipped, blocked, or run against an incomplete dependency installation.
