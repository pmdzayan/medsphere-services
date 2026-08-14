# MedSphere AI Handoff

**Last updated:** 2026-08-10

**Current sprint:** G3.11 implementation — one-way manual batch quarantine

**Next feature work:** Verify and accept the implemented ADR-012/G3.11 boundary

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
- Provider, product, reservation, and medical-record prototype controllers
  remain unmounted. G3.1 mounts the provider-scoped stock read controller;
  G3.2 adds reviewed listing, receipt, and adjustment commands. G3.3 adds only
  assigned-provider reservation reads and safe staff transitions.
- G3.1 passed exact-commit CI in run `30743115664` and was squash-merged in PR
  #11 as `77689b5ccfff21f2f580b87718bf6f7611d1c238`.
- G3.3 passed exact-commit PostgreSQL/Redis CI in run `30753450235` and was
  squash-merged in PR #13 as `d84dee0`.
- AG-01 boundary enforcement passed run `31275757316` and merged in PR #15 as
  `ba172f1`. Corrected AG-02A session credential integrity passed run
  `31276741918` and merged in PR #16 as `9c38792`.
- G3.4 live assigned-provider stock passed run `31278555022` and merged in PR
  #18 as `7b2eb78`.
- The G3.5 read-only reservation contract passed run `31278969284` and merged
  in PR #19 as `8440900` before implementation began.
- G3.5 implementation passed run `31279765403` and merged in PR #20 as
  `6c68ee3`.
- G3.6 live operations overview passed exact-head run `31305222063` and was
  squash-merged in PR #23 as `63707b8`.
- The G3.7 contract passed exact-head run `31308659628` and merged in PR #25 as
  `682f7c61`. The implementation passed exact-head run `31310996464` and was
  squash-merged in PR #26 as `b7bba10` after CTO authorization.
- G3.8 implements only atomic recording of an already completed same-tenant
  cross-provider transfer. It deliberately does not claim dispatch, in-transit,
  delivery, partial receipt, discrepancy, reversal, or frontend behavior.
- G3.8 passed exact-head CI run `31357016150` and was squash-merged in PR #29
  as `5521ad5` after CTO authorization.
- G3.9 implements only an already confirmed damaged-stock write-off under the
  contract accepted in PR #31. Exact-head CI run `31371305767` passed and the
  implementation was accepted and squash-merged in PR #32 as `72fc92a`. It does
  not claim quarantine, disposal, recall, return, approval, or frontend behavior.
- G3.10 implements a bounded physical batch-expiry reconciliation worker. It
  preserves on-hand quantity because expiry is not disposal, while expiring
  reservations that hold due batches. Corrected exact-head implementation CI
  run `31393057704` passed and PR #35 was squash-merged as `ad2d15b`.
- G3.11 accepts only a one-way assigned-provider quarantine command. It must
  preserve physical quantity, cancel every reservation holding the batch, and
  add no release, recall, disposal, return, notification, or mutation UI.
  Implementation is complete locally; exact-commit CI and CTO acceptance are
  required, and V1 remains 35%.
- S0.5 now defines `Batch` as physical/held quantity authority, uses an
  append-only movement ledger, and stores typed reservation items and
  allocations. Its accepted production HTTP boundary and live frontend
  integration now includes the G3.4 read-only stock workspace; broader
  operational exposure remains open.
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

## S0.5 and Gate 3 checkpoint state

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
    accepted and merged in PR #11 as `77689b5`
11. G3.2 listing configuration, batch receipt, and stock adjustment boundary —
    accepted and squash-merged in PR #12 as `3249f8a`
12. G3.3 provider reservation reads and staff transitions — accepted and merged
    in PR #13 as `d84dee0`
13. AG-01 application boundaries — accepted and merged in PR #15 as `ba172f1`
14. AG-02A session credential integrity — accepted and merged in PR #16 as
    `9c38792`
15. G3.4 live assigned-provider stock workspace — accepted and merged in PR #18
    as `7b2eb78`
16. G3.5 live assigned-provider reservation workspace — accepted and merged in
    PR #20 as `6c68ee3`
17. G3.6 live operations overview — accepted and squash-merged in PR #23 as
    `63707b8`
18. G3.7 reservation expiry worker — accepted and squash-merged in PR #26 as
    `b7bba10`
19. G3.8 completed inventory transfer — accepted and squash-merged in PR #29
    as `5521ad5` after exact-head CI run `31357016150`
20. G3.9 completed damaged-stock write-off — accepted and squash-merged in PR
    #32 as `72fc92a` after exact-head CI run `31371305767`
21. G3.10 physical batch expiry reconciliation — accepted and squash-merged in
    PR #35 as `ad2d15b` after exact-head CI run `31393057704`
22. G3.11 one-way manual batch quarantine — implemented; exact-commit CI and
    CTO acceptance required
23. Returns, safe creation, and later live mutations — blocked pending their
    own accepted contracts

If ownership transfers, resume at the first pending checkpoint. Do not use
`cline/s0.4-rbac-audit` or
`rescue/unplanned-marketplace-integration-work` as an S0.5 base.

## Exact continuation point

Verify the G3.11 implementation against ADR-012 and
`docs/sprints/G3.11-one-way-manual-batch-quarantine.md`. Do not advance progress
until exact-commit implementation CI and CTO acceptance. Quarantine
release, reservation creation, returns, recall, analytics policy, patient
exposure, and Gates 2 and 4–9 remain blocked by their recorded dependencies.

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
