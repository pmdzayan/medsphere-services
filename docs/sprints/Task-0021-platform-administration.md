# Task 0021 — Platform Administration Security Foundation

**Status:** Implementation candidate — locally validated, not yet accepted, not merged.

**Branch:** `cto/0021-platform-administration`

**Authoritative base:** `origin/feature/database-architecture` at
`8fb32bce66c5ff4f8ad87fbc7d168a037d4feea0` (accepted Task 0020).

**QA-C1 disposition used as the implementation base:**

QA-C1 (`origin/cto/qa-c1-authoritative-delta-integration`, `0c84961`) is
**VALIDATION PENDING**, not accepted/merged into
`feature/database-architecture` (verified locally: it is not an ancestor of
the authoritative HEAD). This implementation therefore builds strictly on the
newest **accepted** authoritative HEAD (`8fb32bc`) and deliberately does **not**
copy any QA-C1 delta code.

## Objective

Task 0021 establishes the canonical **platform-scope administration security
boundary**: an explicitly authorized AIM platform administrator can
authenticate into a platform context and perform narrowly authorized
platform-administration operations **without** obtaining those privileges from
a healthcare-organization tenant membership.

Core invariant enforced end-to-end:

```
TENANT AUTHORITY != PLATFORM AUTHORITY
```

A pharmacy/hospital/lab/clinic membership never grants platform privileges. A
platform-administrator role never automatically grants access to a tenant's
operational or clinical resources.

This task is the security and lifecycle foundation for future AIM Owner
controls, CEO/country/regional administration, specialized platform-admin
workspaces, organization-verification administration, release/governance
controls, and territory-scoped administration. **None of those future business
capabilities are implemented here.**

## Tenant / platform separation

| Concern            | Tenant domain (accepted)                        | Platform domain (Task 0021)                             |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| Identity chain     | `User` → `TenantMembership` → `Tenant`          | `User` → `PlatformAccount` (global, no tenant)          |
| Session            | `UserSession` (tenant-bound, unchanged)         | `PlatformSession` (dedicated, tenant-less)              |
| Refresh credential | `UserSessionRefreshCredential` (`msr.*`)        | `PlatformSessionRefreshCredential` (`psr.*`)            |
| Access token       | `at+jwt`, claims `sub/mid/tid/sid/sv`           | `pt+jwt`, claims `sub/paid/psid/sv`                     |
| Role               | tenant-scoped `Role` (`RoleType.TENANT/SYSTEM`) | global `PlatformRole` (no tenantId)                     |
| Role→permission    | tenant `RolePermission`                         | `PlatformRolePermission` (structurally separate)        |
| Assignment         | `MembershipRole` (membership-bound)             | `PlatformRoleAssignment` (account-bound, no membership) |
| Audit              | `scope=TENANT, actorType=TENANT_USER`           | `scope=PLATFORM, actorType=PLATFORM_USER`               |

The tenant `UserSession` invariants are unchanged: `tenantId` and
`membershipId` remain NOT NULL, no system/fake tenant is invented, no fake
membership is created, and no `isAdmin` flag is added to a tenant token.

A platform access token provably contains **no** `tenantId`/`membershipId`
claim. A tenant access token can never validate as a platform token
(distinct `typ`, distinct `tokenUse`, distinct header check) and a platform
access token can never validate as a tenant token — both fail closed with the
generic authentication error (proved by unit tests).

## Platform identity model

`TrustedPlatformActor` (from accepted Task 0020
`packages/security`) with `platformUserId` is the canonical server-derived
platform actor, with a new `requireTrustedPlatformActor` fail-closed accessor.

Platform actor identity is derived **only** after:

1. global user identity is cryptographically authenticated (password via the
   accepted Argon2id `PasswordService`, or Google via the accepted
   `GoogleIdentityVerifierService` — no second password/Google identity
   system);
2. the user is ACTIVE/non-deleted;
3. the current `PlatformAccount` access is ACTIVE;
4. the current platform role/permission state is re-evaluated **live**;

## Platform data model

Append-only migration `20260905000000_platform_administration_foundation` adds:

- `PlatformAccount` — optional platform access per global user (`userId`
  unique: one account per user; `status ACTIVE|SUSPENDED`).
- `PlatformRole` — global, tenant-less roles seeded by migration
  (`PLATFORM_OWNER`, `PLATFORM_ADMIN`), `key` unique, `isProtected`, with an
  immutability trigger (no runtime UPDATE/DELETE).
- `PlatformRolePermission` — platform role→permission bindings, structurally
  separate from tenant `RolePermission`.
- `PlatformRoleAssignment` — live account→role grants. No `tenantId` /
  `membershipId` anywhere; `grantedRoleKey` is DB-trigger-validated against
  the referenced role; partial unique index proves **at most one active
  PLATFORM_OWNER** in pure SQL.
- `PlatformInvitation` — invitation-only access; plaintext proof is never
  stored (only HMAC-SHA256 digest), single-use, expiring, revocable, bounded.
- `PlatformSession` + `PlatformSessionRefreshCredential` — dedicated
  tenant-less sessions with the same rotation/replay/lock security semantics
  as the accepted tenant architecture (`psr.*` prefix ensures the two
  credential namespaces can never collide).

Role set (Task 0021 minimum):

| Role                         | Permissions                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `PLATFORM_OWNER` (protected) | `platform.administration.read`, `platform.administration.manage` |
| `PLATFORM_ADMIN` (protected) | `platform.administration.read`                                   |

No CEO / regional executive / country head / verification / finance / support /
clinical admin roles are seeded.

## Invitation-only platform access

Platform privilege is NEVER obtainable from normal registration. There is no
"Register as admin" checkbox, no client role field, and no hidden elevation
field. The administrative HTTP invitation flow:

- is available only to an actor holding `platform.administration.manage`;
- targets a normalized global-identity e-mail;
- generates a cryptographically random single-use proof (`pia.*`);
- persists only the HMAC-SHA256 digest (`invitationHash`);
- is expiring (default 7 days, maximum 30), single-use (version-gated atomic
  claim → concurrent acceptance has exactly one winner, DB-proved), revocable
  before acceptance, bounded, non-enumerating, replay-safe;
- never emits the plaintext proof into logs, audit metadata, DB, errors, or
  telemetry (the one-time plaintext return goes only to the authorized
  `platform.administration.manage` creator).

Acceptance requires **BOTH**:

1. a valid invitation proof; and
2. a cryptographically authenticated global AIM identity (password or Google)
   whose verified e-mail matches the invitation target.

The Task 0021 public invitation flow grants **only** `PLATFORM_ADMIN`. There
is no HTTP invitation or role-assignment API that can create a new
`PLATFORM_OWNER`.

## Initial platform owner bootstrap

There is no public self-elevation endpoint. A dedicated operator-invoked
bootstrap (`PlatformAdminService.bootstrapInitialOwner`) provides the
one-time initial owner:

- requires explicit operator/deployment invocation (a script/CLI, never a
  browser/public registration route);
- targets an already existing ACTIVE global AIM `User` by id;
- refuses if an active `PLATFORM_OWNER` already exists (idempotent
  ConflictException, DB-proved);
- transactionally creates the protected owner assignment;
- cannot be replayed after an owner exists;
- emits durable `platform.owner.bootstrap` SYSTEM evidence (documented
  exception: the bootstrap cannot yet have a platform human actor);
- never hard-codes an e-mail/user id in application source (the operator
  supplies the target id).

This bootstrap mechanism is **not** a general admin-creation shortcut. 5. the `PlatformSession` is live and not revoked/expired/locked.

The browser can never supply `platformUserId`, `userId`, `tenantId`,
`membershipId`, role, permission, organization, territory, or any owner/admin
flag as trusted authority.

## Platform authorization boundary

Fail-closed platform guards:

- `PlatformAuthGuard` (`platform-jwt` Passport strategy) — validates `typ
pt+jwt`, RS256, issuer/audience, then re-reads the live `PlatformSession` +
  ACTIVE `PlatformAccount` + ACTIVE global user + ≥1 live role assignment on
  every request (immediate revocation, no cached authorization).
- `PlatformPermissionsGuard` + `RequirePlatformPermissions(...)` — reads live
  `PlatformRolePermission` bindings each request; tenant `RolePermission`
  bindings are structurally ignored. Denials write a data-minimized
  `PLATFORM_USER` `authorization.permission.denied` event.

No authorization is based on role strings embedded in a long-lived JWT.
Revocation/suspension takes effect on the very next request through live
server state.

## Immediate platform revocation

- Suspending a `PlatformAccount` immediately revokes all active
  `PlatformSession`s and their active refresh credentials transactionally;
- already-issued platform access tokens fail live authorization immediately;
- refresh rotation refuses when the platform account is `SUSPENDED` or has no
  live role assignment (`PLATFORM_ACCESS_DISABLED`);
- tenant sessions belonging to the same global user are **not** revoked
  merely because platform access was removed (proved by DB integration test);
- the reverse is also true: tenant-membership revocation does not mutate
  platform-account state. The two authorization domains remain separate.

## Platform administration API

`@Controller('platform')` surfaces:

- `POST /platform/login`, `POST /platform/login/google` — platform login with
  **no** tenant slug / organization selection; generic non-enumerating
  failures; throttled.
- `POST /platform/invitations/accept` — invitation acceptance (public auth
  boundary, not a tenant-administration endpoint).
- `POST /platform/refresh`, `POST /platform/logout` — dedicated platform
  session lifecycle.
- `GET /platform/identity` — the authenticated platform actor's own
  platform account id, global user display identity, effective roles and
  permissions (no tenant/clinical data).
- `GET /platform/admins` — bounded, deterministic cursor-paginated platform
  admin listing (safe non-sensitive fields only; never password/token/
  invitation hashes, session secrets, tenant memberships, or clinical data).
- `POST /platform/invitations` (requires `platform.administration.manage`),
  `GET /platform/invitations`, `GET /platform/invitations/:id`,
  `POST /platform/invitations/:id/revoke` — invitation lifecycle.
- `PATCH /platform/admins/:id/suspend` (immediate session revocation),
  `PATCH /platform/admins/:id/reactivate` (restores eligibility, does NOT
  resurrect old sessions — a new platform login is required),
  `POST /platform/admins/:userId/revoke-sessions`.

All protected routes carry `@DedicatedAuthEndpoint()` so the global tenant
`JwtAuthGuard` cedes to the dedicated platform guards; a tenant token sent to
any platform route is rejected.

## Protected-owner rules (Task 0021)

- Only the bootstrap process creates the initial `PLATFORM_OWNER`.
- Ordinary `PLATFORM_ADMIN` cannot suspend, replace, or elevate itself to
  owner; cannot grant `platform.administration.manage`; cannot manage another
  admin beyond the Task 0021 surface (no owner transfer is implemented).
- Task 0021 HTTP APIs never delete the initial/last protected owner.
- No self-elevation path exists.

## Platform audit semantics

Human platform mutations use `scope=PLATFORM`, `actorType=PLATFORM_USER`,
`platformActorUserId = exact global user id`. SYSTEM is reserved for genuine
unattended operations and the documented one-time bootstrap. Event types
added: platform login/session create/refresh/lock/unlock/logout,
invitation create/revoke/accept, role assign, admin suspend/reactivate,
session revoke, owner bootstrap (all in the shared `AuditWriter` catalogue
and the DB `AuditEvent_event_type_check` allowlist, append-only).

Audit metadata is data-minimized; no tokens, passwords, Google ID tokens,
invitation proofs, authorization headers, or full sensitive payloads are
stored. Ordinary reads do not create audit events.

## Non-clinical boundary

Task 0021 gives zero implicit access to patient records, prescriptions,
laboratory reports, inventory, medicine reservations, hospital/pharmacy
operational data, organization staff data, or tenant settings. A
`PLATFORM_OWNER` is not automatically a doctor, pharmacist, hospital
administrator, or tenant member, and platform permissions cannot be
translated into tenant `PermissionsGuard` success.

## Out of scope (explicitly not implemented)

No feature flags, system settings, release command center, analytics,
reporting/export engine, finance/revenue sharing, CEO/country dashboard,
territory management, regional hierarchy, organization-verification workflow,
clinical administration, patient-data access, support impersonation,
break-glass, notification engine, Task 0032–0036 code, or AI functionality.
Tenant RBAC and existing Google/password login are not redesigned (the
accepted global-identity verifiers are merely reused for platform
authentication).

## Future governance compatibility

The Task 0021 data model is compatible with the locked future governance
hierarchy (Owner → CEO / regional-country leadership → specialized admins →
healthcare organizations → organization staff) and keeps future extension
possible purely through append-only migrations (explicit platform-account
lifecycle, global platform roles, role assignments that later gain scope/
territory columns). No territory/country/region is hard-coded anywhere.

## Validation evidence

- PRISMA: `prisma validate` passes; `prisma migrate deploy` on a clean
  database passes (all migrations); `prisma migrate status` clean;
  `prisma migrate diff --exit-code` reports **No difference detected** on the
  clean and populated databases.
- UPGRADE: `scripts/verify-0021-platform-upgrade.mjs` (real PostgreSQL)
  proves populated-baseline upgrade preserves tenant invariants and the
  protected-owner / one-owner invariants (both scenarios pass).
- UNIT (22 new Task 0021): platform token contract (no tenant claims; tenant
  token not a platform token; platform token not a tenant token; smuggled
  tenant claims rejected), platform session-policy decision matrix, invitation
  proof/digest/hmac.
- DB INTEGRATION (9 new Task 0021, real PostgreSQL): one-time owner bootstrap,
  no tenant authority from a platform account with no membership, dedicated
  tenant-less session, live session validation, immediate suspension
  revocation, invitation digest-only persistence, expired+revoked rejection,
  concurrent invitation acceptance one-winner, deterministic bounded admin
  pagination.
- REGRESSIONS: auth-service unit suite 87/87 suites, 653 tests passed
  (147 infra-gated skipped) deterministic; `app.e2e.spec.ts` 38/38; security
  package 15/15; `tsc` + `nest build` clean.

## Known infrastructure note (LOCAL ENVIRONMENT)

Local Prisma CLI on Windows cannot resolve the IPv6 `localhost` hostname in
some shells; all migration/verification commands used `127.0.0.1` explicitly.
This is an environment characteristic, not a source defect. No Docker, Redis,
or CI runner was available locally; Redis-backed and GitHub CI gates were not
executed and are not claimed as passed.

## Completion status

`TASK 0021 — IMPLEMENTATION COMPLETE — CTO REVIEW / PUBLICATION PENDING`

Not accepted and not merged until CTO review and authoritative merge into
`feature/database-architecture`.
