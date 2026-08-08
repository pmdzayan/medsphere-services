# ADR-0008: Shared Audit Infrastructure & Domain Contract Boundaries

**Status:** Accepted  
**Date:** 2026-08-03  
**Auditor/Author:** Platform Engineering (Antigravity Task AG-01)

---

## 1. Context & Problem Statement

Prior to Task AG-01, `apps/inventory-service` directly imported application source code from `apps/auth-service/src/audit/audit-writer.service.ts` and `apps/auth-service/src/authorization/*`.

This violated core repository architectural rules:

1. Reusable platform infrastructure (audit writers, authorization guards, permission constants, identity types) was owned by a single business application (`auth-service`).
2. Tightly coupled independently deployable microservices together at the source level.
3. Domain event contracts lacked a centralized, versionable envelope representation (`DomainEventEnvelope`) independent of Prisma database models.

---

## 2. Decisions

1. **Shared Package Ownership:**
   - Application-independent audit infrastructure (`AuditWriter`, `AuditDatabase`, `AuditEventType`, `validateAuditMetadata`) is relocated to `@medsphere/common` under `packages/common/src/audit/`.
   - Shared authentication and authorization primitives (`JwtAuthGuard`, `PermissionsGuard`, `RequirePermissions`, `PERMISSIONS`, `CurrentIdentity`, `AuthenticatedIdentity`, `requireTenantId`) are relocated to `@medsphere/common` under `packages/common/src/auth/`.
   - Versionable domain event contract envelopes (`DomainEventEnvelope`, `EventActorContext`, `DomainEventPublisher`) are consolidated in `@medsphere/types`.

2. **Strict Boundary Enforcement:**
   - Added an ESLint `no-restricted-imports` rule in the monorepo root `.eslintrc.js` to block any relative or aliased cross-application imports (`**/apps/*/**`, `../../../apps/*/**`).
   - Every NestJS microservice MUST import shared audit, auth, and contract abstractions through `@medsphere/common` and `@medsphere/types`.

3. **Database & Audit Preservation:**
   - No database schema migrations were required.
   - The append-only audit log database model and all audit semantics (tenant ID, membership ID, action, resource, metadata) remain unchanged.

---

## 3. Package & Layer Dependency Graph

```text
applications (auth-service, inventory-service, reservation-service, ...)
    ↓
@medsphere/common & @medsphere/types (AuditWriter, guards, contracts)
    ↓
@medsphere/database & NestJS primitives
```

Forbidden direction:

```text
inventory-service → auth-service/src/ (STRICTLY BLOCKED BY ESLINT)
```

---

## 4. Consequences & Benefits

- **Decoupled Architecture:** Applications can be built, tested, and deployed independently without depending on each other's source files.
- **Future Outbox & Gateway Readiness:** Transactional outbox and event publishing pipelines can consume the standardized `DomainEventEnvelope` interface from `@medsphere/types`.
- **Zero Work Loss & Zero Regression:** Existing audit behavior, tenant isolation, and RBAC rules remain intact.
