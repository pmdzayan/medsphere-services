# MedSphere AI Handoff

**Last updated:** 2026-07-20

**Current sprint:** S0.1 — Architecture and Repository Governance (ready for review; publication blocked)

**Next feature work:** Blocked

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

ADR-001 selects a modular monolith for Version 1. The repository still contains seven NestJS applications sharing a Prisma database. Do not treat those deployment boundaries as approved domain boundaries, and do not add another service.

The migration must be incremental:

- Capture behavior with tests before moving or removing code.
- Assign domain ownership before consolidating persistence.
- Keep security deny-by-default during migration.
- Do not introduce temporary public endpoints or client-controlled identity fallbacks.
- Preserve future extraction through explicit contracts and domain events.

## Current risk context

- Authentication strategy and several security support files are empty.
- Most controllers are not guarded.
- Tenant and user identity are sometimes client-controlled or hard-coded.
- RBAC operations are not reliably tenant-scoped.
- Prisma schema and migrations are materially out of sync.
- Reservation and stock operations contain transaction/concurrency defects.
- Audit logging is not connected to business mutations.
- Medical-record functionality precedes consent and privacy foundations.
- Automated test coverage is insufficient for the current risk.

See `docs/audits/2026-07-20-cto-baseline.md` for the accepted baseline.

## Agent routing

| Agent               | Authorized work                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------- |
| ChatGPT / CTO       | Architecture, roadmap, ADR, sprint definition, code review, documentation acceptance         |
| Cline               | One approved backend sprint with a complete specification                                    |
| Claude              | One approved frontend sprint after backend contracts and frontend specification are accepted |
| Roo Code / Continue | Bounded refactoring or bug fixes identified by review                                        |
| Windsurf            | Test implementation, QA execution, regression analysis, and acceptance evidence              |

An agent must not begin a later milestone, combine unrelated modules, or expand scope because a nearby defect looks convenient to fix. Report out-of-scope defects in the completion report.

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
