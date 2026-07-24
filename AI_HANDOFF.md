# MedSphere AI Handoff

**Last updated:** 2026-07-25

**Current sprint:** S0.4 — Tenant-Safe RBAC and Durable Audit (CTO acceptance
approved; final documentation CI and merge pending)

**Next feature work:** Blocked by S0.4

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

ADR-001 selects a modular monolith for Version 1. ADR-002 preserves append-only migration history and requires clean PostgreSQL deployment and drift verification. ADR-003 defines global identity, explicit tenant membership, asymmetric access JWTs, opaque rotated refresh credentials, and deny-by-default authentication — all accepted and merged. The repository still contains seven NestJS applications sharing a Prisma database. Do not treat those deployment boundaries as approved domain boundaries, and do not add another service.

The migration must be incremental:

- Capture behavior with tests before moving or removing code.
- Assign domain ownership before consolidating persistence.
- Keep security deny-by-default during migration.
- Do not introduce temporary public endpoints or client-controlled identity fallbacks.
- Preserve future extraction through explicit contracts and domain events.

## Current risk context

- The S0.3 authentication, trusted tenant context, and session boundary are accepted and merged.
- The unsafe prototype RBAC and audit implementations were removed. Only the
  reviewed S0.4 authorization administration and tenant-audit APIs are mounted.
- S0.4 tenant-safe authorization and durable audit passed PostgreSQL
  constraints, triggers, atomicity, concurrency, Redis, clean migration, drift,
  and populated S0.3 upgrade verification.
- Provider, product, inventory, reservation, and medical-record controllers
  remain deliberately unmounted.
- The S0.2 and S0.3 database baselines are accepted. S0.4 is accepted for merge
  but does not unblock S0.5 until PR #7 reaches the base branch.
- Reservation and stock operations contain transaction/concurrency defects.
- Durable audit covers S0.4 authorization and accepted authentication session
  mutations. Future business modules must add atomic audit coverage when their
  own sprints are accepted.
- Medical-record functionality precedes consent and privacy foundations.
- S0.4 infrastructure coverage executed on PostgreSQL 16 and Redis 7 with zero
  skipped tests.

See `docs/audits/2026-07-20-cto-baseline.md` for the accepted baseline.

## Current S0.4 boundary

- S0.3 is accepted and merged. Its documentation handoff is the verified branch
  dependency for S0.4.
- ADR-004 and the S0.4 sprint contract are accepted. S0.4 implementation and
  local review are complete on
  `cto/s0.4-tenant-safe-rbac-durable-audit`.
- S0.4 covers tenant-safe roles, permissions, membership assignments,
  authorization policy, and durable append-only audit integration.
- Inventory and reservation integrity remain S0.5.
- Marketplace, delivery, payment, frontend, and controlled-medicine work remain
  blocked.
- The CTO owns the S0.4 implementation and acceptance review.

## S0.4 checkpoint state

1. Architecture and sprint contract — completed in local commit `9603f5b`
2. Database schema and migration — implemented in `a8b2128` and hardened in
   `993324b`; PostgreSQL deploy, drift, constraint, and populated-upgrade proof
   complete
3. Authorization implementation — completed and locally reviewed
4. Durable audit and authentication integration — completed and locally
   reviewed
5. Local security verification — format, Prisma validation/generation, lint,
   non-infrastructure tests, strict auth test type-check, and build completed;
   PostgreSQL/Redis suites passed in workflow run `30130479231`
6. Populated S0.3 upgrade verification — completed in `4f10eef`; all six
   isolated scenarios passed in workflow run `30131410814`
7. CTO acceptance — approved; final documentation commit, CI, and PR #7 merge
   pending

If ownership transfers after a checkpoint, resume at the first pending item.
Never restart from the oversized `cline/s0.4-rbac-audit` branch.

## Exact continuation point

Do not implement S0.5 or ask Cline to begin another feature. First:

1. Keep [PR #7](https://github.com/pmdzayan/medsphere-services/pull/7) in draft.
2. Publish the final CTO acceptance documentation commit.
3. Require the full workflow to pass again on that exact commit.
4. Mark PR #7 ready and squash-merge only after the final check is green.
5. Synchronize `feature/database-architecture` and record the resulting accepted
   baseline before authorizing S0.5.

If CI fails, Cline may receive one complete, narrowly scoped prompt for the
specific failure set. Cline must not redesign the schema, permission model,
audit contract, or tenant boundary.

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
