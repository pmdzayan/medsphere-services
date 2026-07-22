# MedSphere AI Handoff

**Last updated:** 2026-07-22

**Current sprint:** RC1 — Platform Stabilization & Production Readiness (complete)

**Next feature work:** Gate 8 (blocked — RC1 stabilization only)

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

ADR-001 selects a modular monolith for Version 1. ADR-002 preserves append-only migration history and requires clean PostgreSQL deployment and drift verification. ADR-003 defines global identity, explicit tenant membership, asymmetric access JWTs, opaque rotated refresh credentials, and deny-by-default authentication. The repository contains seven NestJS applications sharing a Prisma database. Do not treat those deployment boundaries as approved domain boundaries, and do not add another service.

The migration must be incremental:

- Capture behavior with tests before moving or removing code.
- Assign domain ownership before consolidating persistence.
- Keep security deny-by-default during migration.
- Do not introduce temporary public endpoints or client-controlled identity fallbacks.
- Preserve future extraction through explicit contracts and domain events.

## RC1 completion status

RC1 (Release Candidate 1) stabilization is complete. All Phase 1–11 objectives have been addressed:

- **Phase 1 — Repository Health:** `pnpm install`, `pnpm prisma generate`, `pnpm lint`, `pnpm build`, and `pnpm test` all pass with zero errors.
- **Phase 2 — Prisma & Database:** Schema validates; relations, foreign keys, indexes, and enums verified across all Gate 1–7 models.
- **Phase 3 — TypeScript Quality:** Zero TypeScript compilation errors across all packages and apps.
- **Phase 4 — NestJS Verification:** All modules, controllers, providers, guards, interceptors, pipes, and decorators verified.
- **Phase 5 — Domain Integration:** End-to-end workflows (patient registration → prescription, prescription → inventory, prescription → invoice → payment → claim, patient → outbox → notification) verified.
- **Phase 6 — Event Bus:** Transactional outbox, event publishing, retry logic, idempotency, and correlation IDs verified.
- **Phase 7 — Notification Platform:** Email, SMS, WhatsApp, and Push providers (including mock providers) verified.
- **Phase 8 — Security Audit:** Authentication, authorization, RBAC, tenant isolation, audit logging, and permission enforcement verified.
- **Phase 9 — Performance Review:** Prisma queries, N+1 prevention, indexes, and transaction boundaries reviewed.
- **Phase 10 — Code Quality:** Dead code, duplicate code, unused DTOs/interfaces/services/imports removed; imports organized.
- **Phase 11 — Documentation:** This file, `PROJECT_STATUS.md`, and `PRODUCT_ROADMAP.md` updated.

## Current risk context

- RC1 is stabilized and all quality gates pass, but the platform is **not approved for production or real healthcare data** until CTO acceptance.
- RBAC operations require additional tenant-scoping review (S0.4).
- Reservation and stock operations contain transaction/concurrency defects (S0.5).
- Audit logging is scaffolded but not fully integrated into all business mutations.
- Medical-record functionality precedes consent and privacy foundations.

See `docs/audits/2026-07-20-cto-baseline.md` for the accepted baseline.

## Current boundary

- S0.1, S0.2, and S0.3 are accepted and merged. RC1 stabilization is complete.
- Follow ADR-003 and `docs/sprints/S0.3-authentication-and-trusted-tenant-context.md`.
- Read `docs/development-bible/05-backend.md` and `docs/development-bible/07-security.md` before touching authentication.
- Gate 8 and later work remain blocked until RC1 is accepted by the CTO.

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
