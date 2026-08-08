# MedSphere AI Handoff

**Last updated:** 2026-08-03

**Current sprint:** AG-02A — Persistent Session Schema, Credential Rotation and Repository (Implementation complete on `cto/ag02a-session-persistence`; PROVISIONALLY_COMPLETE, awaiting CTO review)

**Next task:** AG-02B — Authentication Service, Session APIs, Ownership and Audit

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

ADR-001 selects a modular monolith for Version 1. ADR-002 preserves append-only migration history. ADR-003 defines global identity and tenant context. ADR-004 defines tenant-safe authorization and durable audit. ADR-005 defines batch stock and reservation integrity. ADR-006 defines supported runtime and secure HTTP baseline. ADR-007 defines inventory intelligence and operational workflows. ADR-008 defines shared audit infrastructure and domain contract boundaries.

- **Preservation & Stabilization (AG-00):** Completed and verified. Report published at `docs/audits/2026-08-03-antigravity-repository-stabilization.md`. Baseline report verdict: `SAFE`.
- **Shared Audit Infrastructure & Domain Contract Boundaries (AG-01):** Completed. 100% of cross-application source imports (`apps/*` -> `apps/*`) eliminated. Reusable audit/auth infrastructure and decorators relocated to `@medsphere/common`. Domain contract envelopes (`DomainEventEnvelope`, `EventActorContext`) consolidated in `@medsphere/types`. ESLint boundary rule enforced in `.eslintrc.js`.

The migration must be incremental:

- Capture behavior with tests before moving or removing code.
- Assign domain ownership before consolidating persistence.
- Keep security deny-by-default during migration.
- Do not introduce temporary public endpoints or client-controlled identity fallbacks.
- Preserve future extraction through explicit contracts and domain events.

## Completion report contract

Every implementation handoff must include:

- Objective and acceptance status
- Files modified
- Database and migration changes
- API endpoints and contracts
- Permissions and tenant behavior
- Audit/logging behavior
- Tests added and executed
- `pnpm format:check` result
- `pnpm lint` result
- `pnpm build` result
- Remaining work and risks
