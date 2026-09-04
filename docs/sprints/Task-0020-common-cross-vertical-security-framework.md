# Task 0020 — Common Cross-Vertical Security Framework

**Status:** Implementation candidate — locally validated, not yet accepted, not merged.

**Branch:** `cto/0020-common-cross-vertical-security-framework`

**Base:** `feature/database-architecture` at `fd3354cc69e02508b15e06c6f2f9a2d9a776d932` (accepted Task 0019).

## Objective

Establish and harden a **common, reusable cross-vertical security framework** so
future healthcare verticals (pharmacies, hospitals, clinics, laboratories, blood
banks, suppliers, doctors, patient-facing modules) cannot accidentally invent
inconsistent authentication, authorization, tenant isolation, actor
attribution, request validation, audit, or sensitive-data handling.

Task 0020 does **not** implement any vertical. It consolidates already-accepted
security architecture (ADR-003 trusted authentication, ADR-004 tenant-safe
authorization/durable audit, ADR-007 provider access, ADR-025 organization
onboarding, Task 0014 workstation hardening, Task 0018 immediate revocation,
Task 0019 exact-user audit) into one canonical contract that future verticals
reuse. It deliberately does **not** create a second security system.

## New shared package

`packages/security` (`@medsphere/security`) — a small, framework-agnostic
(TypeScript + Nest-agnostic where possible) contract package with no database
migration.

Exports:

- `TrustedTenantActor` / `TrustedPlatformActor` / `TrustedSystemActor` and the
  discriminated `TrustedActor` union — the canonical server-derived identity
  contract. Invalid combinations (tenant actor missing a user id, system actor
  carrying a user id) are impossible in well-typed code. Guards:
  `isTrustedTenantActor`, `isTrustedPlatformActor`, `isTrustedSystemActor`,
  `trustedActorKind`, `requireTrustedTenantActor`.
- `assertActiveTenantMembership` — fail-closed membership→user→tenant→active
  validation. Rejects mismatched membership/user, suspended/revoked/pending
  memberships, and inactive tenants.
- `findTenantScoped` / `findTenantScopedFirst` — tenant-qualified compound
  lookups (`findFirst({ where: { id, tenantId } })`, matching the accepted
  `authorization.repository.ts` pattern) that throw a uniform `NotFound` for a
  UUID from another tenant (IDOR/BOLA protection).
- `assertTrustedProviderAccess` — the accepted ADR-007 membership→provider
  assignment boundary (live server state), reusable by future verticals.
- `appendExactTenantUserAudit` — the only bridge for common verticals to write
  a TENANT_USER audit event. It forces the exact trusted `actorUserId`,
  `actorMembershipId`, and `tenantId` (Task 0019 preserved). No SYSTEM fallback
  and no membership-only shortcut.
- `assertNoSensitiveValues` — fail-closed rejection of client-supplied
  security-sensitive fields (userId, tenantId, membershipId, role, permission,
  providerId, verification/authorization status, etc.) to prevent mass
  assignment / privilege elevation.

## Trusted identity boundary

- The trusted identity is always derived server-side from the re-validated
  access token (JwtStrategy → `validateAccessIdentity` → live session +
  membership→user→tenant chain). Client-supplied headers/body/query/params can
  never override it.
- `AuthenticatedIdentity` is the trusted HTTP representation; `TrustedTenantActor`
  is the canonical service-layer representation. The inventory command surface
  now aliases the shared `TrustedTenantActor` so future verticals share one
  identity shape.
- The `x-user-id` / `x-tenant-id` headers are rejected in existing e2e tests
  (ADR-003), and the framework provides no API that accepts them.

## Tenant isolation

- Future verticals must resolve resources through tenant-qualified compound
  lookups, never bare `findUnique({ id })`.
- `findTenantScoped` proves `id + tenantId` together and throws uniform
  `NotFound`, so a valid object UUID from Tenant B is invisible in Tenant A
  (IDOR/BOLA).
- `assertActiveTenantMembership` enforces the membership→user→tenant chain
  before any protected tenant operation.

## Authorization boundary

- The existing `PermissionsGuard` + `RequirePermissions` + live
  `AuthorizationService.hasAllPermissions` remain authoritative (fail closed,
  no client role/permission trust, immediate revocation via live DB reads).
- `assertActiveTenantMembership` and `assertTrustedProviderAccess` provide the
  common service-layer authorization boundaries future verticals reuse.
- Task 0018 immediate revocation is unchanged and still green.

## Exact-user audit (Task 0019 preserved)

- `appendExactTenantUserAudit` is the only common-vertical bridge for
  TENANT_USER events and requires the exact trusted actor. The Task 0019
  `AuditEvent_actor_scope_check` + composite `(actorMembershipId, actorUserId,
tenantId)` FK remain authoritative at the DB layer.
- SYSTEM and PLATFORM_USER semantics remain distinct and are intentionally NOT
  exposed through the common tenant-user bridge.
- No "human action recorded as SYSTEM" shortcut, and no membership-only
  downgrade, is possible through the framework.

## Resource ownership / IDOR / BOLA

- `findTenantScoped` is the reusable pattern for user/tenant-owned resources:
  `findFirst({ where: { id, tenantId } })` → uniform NotFound, never bare
  `findUnique({ id })` followed by trusting the result.
- Tests in `common-security-framework.integration.spec.ts` prove cross-tenant
  UUID spoofing is denied.

## Provider access

- `assertTrustedProviderAccess` (shared) is the ADR-007 live
  membership→provider-assignment boundary. Tenant access is NOT
  automatically provider access.
- The inventory `inventory-access.ts` now delegates to the shared helper,
  preserving its existing `'Provider inventory not found'` public contract.

## Mass assignment

- `assertNoSensitiveValues` rejects client-supplied security-sensitive fields.
- Tests prove userId/tenantId/membershipId/role/permission fields are rejected.

## Platform vs tenant

- `TrustedPlatformActor` is a distinct variant with no tenant membership.
- Task 0020 does not implement platform administration (Task 0021); it only
  keeps the two identities structurally distinct so tenant membership can never
  grant platform privileges.

## How future verticals reuse this

Future vertical modules should:

1. Import `@medsphere/security`.
2. Derive `TrustedTenantActor` from the authenticated identity (never from
   client input).
3. Resolve every tenant-owned resource with `findTenantScoped`.
4. Enforce `assertActiveTenantMembership` + `assertTrustedProviderAccess` (where
   provider-scoped).
5. Record human actions through `appendExactTenantUserAudit`.
6. Reject sensitive fields with `assertNoSensitiveValues`.

## Validation

- `packages/security` node:test suite: 15/15.
- `common-security-framework.integration.spec.ts` (real PostgreSQL): 8/8.
- Full auth-service unit suite, Task 0019 authorization-audit + session + Task
  0018 revocation DB suites: green (see completion report).
