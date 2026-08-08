# MedSphere Project Status

**Status date:** 2026-08-03

**Release state:** Not approved for production or real healthcare data

## Active Antigravity Sprints & Tasks

### Task AG-00 — Repository Preservation and Stabilization Baseline

**Status:** `COMPLETED`  
**Verdict:** `SAFE`  
**Audit Report:** `docs/audits/2026-08-03-antigravity-repository-stabilization.md`

### Task AG-01 — Shared Audit Infrastructure and Domain Contract Boundaries

**Status:** `IMPLEMENTATION COMPLETE` (Awaiting CTO Review)  
**ADR:** `docs/adr/0008-shared-audit-infrastructure-and-domain-contract-boundaries.md`

**In Scope & Completed:**

- Relocated reusable audit types, metadata validation, constants, and `AuditWriter` to `@medsphere/common`.
- Relocated authentication identity types, RBAC decorators, permission constants, `JwtAuthGuard`, and `PermissionsGuard` to `@medsphere/common`.
- Extended `@medsphere/types` with versionable `DomainEventEnvelope<TPayload>` and `EventActorContext`.
- Added ESLint `no-restricted-imports` rule in `.eslintrc.js` to strictly enforce that applications (`apps/*`) cannot directly import internal source code from other applications.
- Eliminated 100% of cross-application source imports (`apps/inventory-service` -> `apps/auth-service/src/*`).

### Task AG-02A — Persistent Session Schema, Credential Rotation and Repository

**Status:** `PROVISIONALLY COMPLETE` (Awaiting CTO Review)  
**Branch:** `cto/ag02a-session-persistence`  
**Plan:** `docs/audits/2026-08-03-ag02a-session-persistence-plan.md`  
**Completion Report:** `docs/audits/2026-08-03-ag02a-session-persistence-completion.md`

**In Scope & Completed:**

- `UserSession` extended with direct `userId`/`tenantId` relationships and a `version` column for optimistic concurrency.
- New `UserSessionRefreshCredential` history model with `RefreshCredentialStatus` (`ACTIVE`, `USED`, `REVOKED`) for strong replay detection.
- Append-only migration `20260803120000_persistent_session_credential_rotation` with backfill, check constraints, composite indexes, and a partial unique index enforcing one active credential per session.
- Real persistent `SessionRepository` with atomic creation, durable validation, atomic rotation, replay distinction, family/user revocation, and bounded cleanup.
- Explicit rotation outcomes: `ROTATED`, `REPLAY_DETECTED`, `INVALID`, `EXPIRED`, `REVOKED`, `IDENTITY_DISABLED`.
- Pure decision-logic module (`session-policy.ts`) with 15 unit tests (all passing).
- PostgreSQL integration and concurrency tests written and gated behind `RUN_AUTH_INFRASTRUCTURE_TESTS=true` (not executed locally — environmental limitation).

## Verification Ledger

| Check                                                | Result                     |
| ---------------------------------------------------- | -------------------------- |
| Cross-Application Import Audit (`search_imports.js`) | 0 violations found         |
| ESLint `no-restricted-imports` rule                  | Enforced and passing       |
| `pnpm format:check`                                  | Passed                     |
| `pnpm lint`                                          | Passed (16/16 Turbo tasks) |
| `@medsphere/types` build                             | Passed                     |
| `@medsphere/common` build                            | Passed                     |
| `@medsphere/auth-service` test & build               | Passed                     |
| `@medsphere/inventory-service` test & build          | Passed                     |
