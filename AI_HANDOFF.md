# MedSphere AI Handoff

**Last updated:** 2026-07-20

**Current sprint:** S0.4 — Tenant-Safe RBAC and Audit Integration (CTO design preparation; code not yet authorized)

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
- Prototype RBAC, audit, provider, product, and inventory controllers remain deliberately unmounted.
- RBAC operations are not reliably tenant-scoped — S0.4 must repair this.
- The S0.2 and S0.3 database baselines are accepted, but the models' domain controls beyond authentication remain unaccepted.
- Reservation and stock operations contain transaction/concurrency defects.
- Audit logging is not connected to business mutations — S0.4 work.
- Medical-record functionality precedes consent and privacy foundations.
- Automated coverage outside the S0.3 identity/session boundary remains insufficient for the current risk.

See `docs/audits/2026-07-20-cto-baseline.md` for the accepted baseline.

## Current S0.4 boundary

- S0.3 is accepted and merged. S0.4 is the current sprint.
- S0.4 code implementation is not yet authorized — ADR-004 and the S0.4 sprint contract must be accepted first.
- S0.4 covers tenant-safe roles, permissions, assignments, authorization policy, and durable audit integration.
- Inventory and reservation integrity remain S0.5.
- The CTO owns ADR-004 and the S0.4 architecture design.

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
