# ADR-026: Dedicated Platform-Administration Security Boundary

**Status:** Proposed (implementation candidate for Task 0021)

**Date:** 2026-09-05

**Decision owners:** AIM Project Owner and CTO

**Depends on:** ADR-003 (trusted authentication), ADR-004 (tenant-safe
authorization and durable audit), Task 0020 (`TrustedPlatformActor` contract)

## Context

Task 0021 must let an explicitly authorized platform administrator
authenticate into a **platform context** and perform narrowly authorized
platform-administration operations **without** obtaining those privileges from
a healthcare-organization tenant membership. The accepted ADR-003/ADR-004
boundary makes `User` the global identity and derives authoritative tenant
authority from the `User → TenantMembership → Tenant → UserSession` chain.
That chain is exactly the right vehicle for tenant authority, but reusing it
for platform authority would either require fabricating a tenant/membership
for platform admins or loosening the NOT NULL tenant invariants — both of
which would weaken the accepted tenant security boundary.

A second identity system (separate passwords/Google accounts) is rejected:
the accepted global identity verifiers must be reused so platform identity is
the same global AIM identity, with a separate authorization domain on top.

## Decision

### 1. Separate platform authority from tenant membership (TENANT AUTHORITY != PLATFORM AUTHORITY)

- One optional global `PlatformAccount` per `User` (`userId` unique). Platform
  access has an explicit `ACTIVE | SUSPENDED` lifecycle. No normal user
  receives platform access automatically.
- Platform roles are GLOBAL platform roles with no `tenantId`; they are never
  tenant `Role` rows and never reference a membership.
- `PlatformRoleAssignment` binds global account → global role, is live
  server-side authorization state, and contains no `tenantId`/`membershipId`.
- Platform permissions use the explicit `platform.administration.*` namespace
  in the shared canonical `Permission` catalogue, but platform
  role→permission bindings live in a structurally separate table so tenant
  permissions can never become platform authority merely by catalogue
  co-location.

### 2. Dedicated platform session and token boundary

- A dedicated `PlatformSession` (+ `PlatformSessionRefreshCredential`) is the
  platform session store. It is tenant/membership-less by construction.
- Platform access tokens are JWT `typ = pt+jwt`, `tokenUse = platform-access`,
  carrying only `sub`, `paid` (platform account id), `psid` (platform session
  id), `sv`, `jti`. They MUST NOT contain `tid`/`mid`/`sid`.
- Tenant access tokens (`at+jwt`) can never validate as platform tokens and
  platform tokens can never validate as tenant tokens (header `typ` check +

### 3. Invitation-only platform access + one-time initial-owner bootstrap

- Platform privilege is never obtainable from normal registration. An
  invitation-only flow (created only by `platform.administration.manage`
  holders) targets a normalized e-mail, stores only an HMAC digest, is
  single-use/expiring/revocable/bounded, and its acceptance requires BOTH a
  valid proof AND a cryptographically authenticated global identity whose
  verified e-mail matches the target.
- The initial `PLATFORM_OWNER` is created only by an operator-invoked,
  non-replayable bootstrap that refuses once an active owner exists and is
  never exposed as a browser/public endpoint.

### 4. Live, fail-closed authorization

- `PlatformPermissionsGuard` + `RequirePlatformPermissions` re-read the
  platform account's effective permissions live on every request. No cached
  permission or long-lived-role-string authorization. Suspension/revocation
  is immediate.
- Denials and human platform mutations write `scope = PLATFORM`,
  `actorType = PLATFORM_USER`, exact `platformActorUserId` audit events via
  the accepted `AuditWriter`. SYSTEM is reserved for unattended operations
  and the documented one-time bootstrap.

## Alternatives

### Reuse the tenant `UserSession` and add an `isAdmin` flag

Rejected — requires loosening `UserSession.tenantId/membershipId` NOT NULL
invariants and fabricating a tenant/membership for platform admins; would
weaken the accepted tenant security boundary and allow tenant tokens to double
as platform tokens.

### Build a second password/Google identity system

Rejected — diverges from the single global identity and duplicates credential
handling; the accepted global-identity verifiers are reused instead.

### Keep all roles in the shared `Role` table with `tenantId NULL`

Rejected — cannot be proven structurally distinct from tenant roles; requires
fabricating tenant context for the tenant-side FK checks and risks tenant
`PermissionsGuard` accidentally honoring platform bindings.

### Embed platform roles in a long-lived JWT

Rejected — delays revocation until token expiry and violates the accepted
live-server-state authorization model.

## Consequences

### Positive

- Tenant and platform authority are structurally impossible to confuse.
- A platform account with no tenant membership can still use authorized
  platform endpoints; a platform account with a tenant membership receives no
  tenant authority from its platform token.
- Immediate revocation: suspension/revocation fails every live platform

## Implementation constraints

- Build from the accepted Task 0020 HEAD; never copy QA-C1 delta code.
- Use one forward-only Prisma migration; never edit accepted migrations.
- Preserve every `UserSession` tenant invariant; do not make
  `tenantId`/`membershipId` nullable anywhere in the tenant domain.
- Verify both a clean PostgreSQL apply and the populated authoritative
  upgrade path.
- The invitation plaintext is returned exactly once to the authorized
  `platform.administration.manage` creator; it never appears in logs, audit
  metadata, database, errors, or telemetry.
- Do not implement owner transfer, impersonation, break-glass, territory or
  country logic, organization-verification, or any clinical administration in
  Task 0021.

## Review triggers

Review this decision before:

- allowing tenant membership to confer platform authority or platform roles
  to confer tenant/clinical authority;
- caching platform authorization decisions;
- adding owner transfer, delegated access, impersonation, or break-glass
  workflows;
- adding territory/country/region scope to platform roles;
- extracting platform identity/session into an independently deployed service;
- changing platform token transport or issuing machine platform credentials.
  session/refresh/authorization check without touching tenant sessions.
- Future Owner/CEO/country/territory-scoped administration remains feasible
  through append-only migrations on the same platform identity/session model.

### Negative and trade-offs

- A second session/token family must be operated, tested, and monitored (it
  deliberately duplicates the tenant session architecture for the platform
  domain).
- Every protected platform request performs a small indexed live lookup
  (immediate revocation; a bounded-cache optimization requires future
  evidence).
- Owners must be bootstrapped explicitly; there is no self-serve
  platform-administration registration.
  distinct claim-set validation, fail closed with the generic authentication
  error). A tenant token is never accepted by platform guards and a platform
  token is never accepted by ordinary tenant authorization guards.
- The accepted tenant token hashing, rotation, expiry, security-version,
  lock/revocation, and refresh-replay semantics are reused where semantically
  compatible; the credential namespaces are deliberately distinct (`psr.*`).
