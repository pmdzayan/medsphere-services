# ADR-003: Trusted Authentication and Tenant Context

**Status:** Accepted

**Date:** 2026-07-20

## Context

MedSphere currently contains authentication-shaped code, but it does not provide an accepted security boundary:

- `AuthModule` is not mounted by the authentication application.
- The JWT strategy and multiple identity types are empty.
- A fallback signing secret permits unsafe startup.
- Access and refresh JWTs use the same key and are not separated by issuer, audience, type, or intended use.
- Raw refresh tokens are stored in PostgreSQL.
- Refresh rotation is non-atomic and does not detect replay.
- Login and registration accept a client-supplied tenant UUID.
- Several endpoints accept a user ID from a header or use a hard-coded tenant UUID.
- Most prototype controllers are reachable without authentication or tenant-scoped authorization.
- The current `User.tenantId` design prevents one identity from safely belonging to more than one healthcare organization.

MedSphere is intended to support patients, clinicians, pharmacies, hospitals, laboratories, and suppliers. A person may participate in multiple organizations, so identity must be global while organization access is expressed through an explicit membership.

The design must follow deny-by-default access, data minimization, revocable sessions, tenant isolation, and migration reproducibility. It must remain compatible with ADR-001's Version 1 modular-monolith direction.

## Decision

### 1. Separate global identity from tenant membership

`User` becomes the global login identity. `TenantMembership` becomes the authoritative user-to-tenant relationship.

An authenticated request identity contains only:

- `userId`
- `membershipId`
- `tenantId`
- `sessionId`

The tenant ID is never accepted as authorization context from a header, path, query, or request body. Public login may accept a tenant slug as a locator, but the trusted tenant context is produced only after the server validates the active user, active membership, active tenant, and active session chain.

The initial migration backfills one membership for every existing tenant-bound user. It must stop safely if case-normalized duplicate global emails would make the migration ambiguous. No automatic identity merging is permitted.

### 2. Deny access by default

A global authentication guard protects every route unless the handler or controller has the shared public-endpoint metadata.

The public allowlist is limited to:

- liveness and readiness checks;
- supported-language metadata;
- login;
- refresh;
- registration only where the resolved tenant explicitly enables self-registration.

Prototype RBAC, audit, provider, product, and inventory controllers are removed from the active application module until their tenant and permission boundaries are accepted in their dependency-ordered sprints. Their source may remain for later review; being present in the repository does not make an endpoint accepted or reachable.

### 3. Use asymmetric, narrowly scoped access JWTs

Access tokens are short-lived JWTs signed with RS256. Only the identity/authentication module receives the private signing key. Verifiers receive the public key.

The implementation must:

- fail startup if keys or required token configuration are absent or invalid;
- allowlist RS256 rather than trusting a token-provided algorithm;
- validate `iss`, `aud`, `sub`, `sid`, `mid`, `tid`, `jti`, `iat`, `exp`, and explicit access-token type;
- include no password data, email address, profile data, roles, permissions, or medical data in the token;
- use a configured key ID to support planned key rotation;
- resolve the database session and membership chain on every authenticated request during Version 1 stabilization.

The database lookup provides immediate revocation and status enforcement. A later ADR may add a short-lived revocation cache after measurement, but cache failure must not silently authorize a request.

### 4. Use opaque, rotated refresh credentials

Refresh credentials are not JWTs. They are cryptographically random, single-use opaque values containing a random session identifier and a high-entropy verifier.

Only an HMAC-SHA-256 digest of the complete refresh credential is stored. The HMAC key is an independently managed refresh-token pepper that is never stored in the database.

Every successful refresh:

1. validates the credential format and digest in constant time;
2. validates the active session, global user, membership, tenant, idle expiry, and absolute expiry;
3. atomically marks the current record rotated and creates its successor in the same family;
4. preserves the family's absolute expiry;
5. returns a new access token and a new refresh credential.

Presenting a previously rotated credential is treated as probable replay. The server revokes the active credential family and records a security event. Rotation uses a serializable PostgreSQL transaction with bounded retry for transaction-conflict errors.

### 5. Make session actions self-only

Logout and logout-all derive the subject from the verified request identity. No endpoint accepts the target user ID from the client.

- Logout revokes the current session family.
- Logout-all revokes all active session families for the authenticated global user.
- Password change, account suspension, membership suspension, tenant deactivation, and confirmed refresh-token replay revoke affected sessions.

### 6. Treat registration as policy-controlled onboarding

Public registration cannot select an arbitrary tenant UUID. It resolves a normalized tenant slug, requires an active tenant with self-registration enabled, and creates a pending global identity plus pending membership in one transaction.

Responses are generic enough to avoid disclosing whether an email, tenant, membership, or account already exists. Existing global accounts cannot be silently attached to another tenant through public registration. Invitation-based membership, email verification, password recovery, and MFA are separate dependency-ordered features.

### 7. Keep authorization and audit boundaries explicit

S0.3 establishes authenticated identity and tenant context. S0.4 remains responsible for tenant-safe roles, permissions, durable audit integration, and remounting RBAC/audit endpoints.

S0.3 emits structured authentication security events without secrets, tokens, raw credential values, or unnecessary personal data. Those events form an explicit integration seam for the durable audit work in S0.4; application logs alone are not claimed as the final healthcare audit trail.

## Reason

- A global identity plus memberships supports clinicians, staff, and patients participating in multiple healthcare organizations without duplicating credentials.
- Asymmetric access-token signing limits which component can mint identities and preserves a safe extraction seam.
- Opaque refresh credentials avoid cross-JWT confusion and permit server-side replay detection and revocation.
- Database validation of the complete session and membership chain prevents stale or client-forged tenant context.
- Deny-by-default routing removes the current unauthenticated attack surface while later modules are repaired in dependency order.
- Single-use rotation retains the relationship between old and new credentials, which is required for replay detection.

This aligns with [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html) JWT validation guidance, [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) refresh-token rotation guidance, and the OWASP Authentication, Session Management, and Password Storage cheat sheets.

## Alternatives

### Keep tenant ID directly on `User`

Rejected. It treats the same person as unrelated credentials in every organization and creates avoidable migration debt for the multi-organization healthcare ecosystem.

### Trust a tenant header after validating only the user JWT

Rejected. A valid user could select another tenant unless every downstream path independently repaired the context. Tenant context must be derived from membership.

### Use one symmetric secret for access and refresh JWTs

Rejected. It lets every verifier mint tokens, increases blast radius, and permits token-type confusion unless every consumer is perfect.

### Use refresh JWTs without server-side state

Rejected. Immediate revocation, logout-all, membership suspension, and replay detection require authoritative server-side state.

### Store raw refresh tokens for direct lookup

Rejected. A database disclosure would immediately disclose live credentials.

### Validate access JWTs without checking server-side session state

Rejected for the stabilization baseline. It improves request throughput but delays revocation until access-token expiry. Performance optimization requires evidence and a fail-closed cache design.

### Keep every prototype module mounted and add only a global JWT guard

Rejected. Authentication alone does not repair cross-tenant repository queries, hard-coded tenant IDs, ownership rules, or missing permissions.

### Introduce a separate identity microservice now

Rejected. It conflicts with ADR-001 and adds operational/distributed-systems complexity before the module boundary is accepted.

## Consequences

### Positive

- One authoritative identity-to-membership-to-tenant chain.
- Immediate account, tenant, membership, and session revocation.
- Refresh-token database disclosure does not directly reveal usable credentials.
- Replay detection can revoke a compromised credential family.
- Future RBAC, audit, consent, policy, and multi-organization workflows receive a typed trusted context.
- The signing boundary can later be extracted without redesigning token consumers.

### Negative and trade-offs

- S0.3 requires a forward database migration and coordinated auth rewrite.
- Existing prototype sessions must be invalidated because raw refresh JWTs cannot be safely converted to the new credential format.
- Every authenticated request initially performs a small indexed database lookup.
- Existing users with duplicate case-normalized global emails require explicit remediation before migration.
- Prototype endpoints become unreachable until their later acceptance sprints.
- Key generation, secure storage, rotation, and incident procedures become operational requirements.

## Implementation constraints

- S0.2 must be merged before the S0.3 branch is created.
- The migration is append-only and must pass clean PostgreSQL deploy, status, and drift checks.
- Existing raw sessions are revoked/removed deliberately; the change must be called out in the migration and release notes.
- Authentication configuration has no fallback secrets or implicit production defaults.
- Secrets and complete token values must never appear in source, examples, logs, exceptions, tests, snapshots, or audit payloads.
- DTOs normalize tenant slugs and email addresses but never trim or transform passwords.
- Password hashing uses explicitly configured Argon2id parameters meeting the accepted OWASP minimum and supports future rehash-on-login.
- Public authentication endpoints use generic responses and rate limits.
- Request IP handling does not trust forwarded headers unless trusted-proxy configuration is explicit.
- S0.3 must include unit, database integration, API, negative-authentication, cross-tenant, refresh-replay, transaction-concurrency, migration, and configuration-failure tests.
- No protected endpoint may use `x-user-id`, `x-tenant-id`, a hard-coded UUID, or client-provided identity as authority.

## Review triggers

Review this decision before:

- adopting an external identity provider, OIDC, SAML, passkeys, or MFA;
- extracting identity into an independently deployed service;
- supporting machine-to-machine credentials;
- adding cross-country data residency or regional issuers;
- removing per-request database session validation;
- changing token transport for browser or mobile clients;
- adding delegated access, impersonation, or break-glass workflows.
