# AG-02A — Persistent Session Schema, Credential Rotation and Repository Plan

**Date:** 2026-08-03
**Task:** CL-AG-02A (first bounded implementation node for AG-02)
**Branch:** `cto/ag02a-session-persistence`
**Base commit:** `87bbb37`

## 1. Existing Login and Refresh Flow

- `POST /auth/login` -> `AuthService.login()`:
  1. Resolves `LoginIdentity` via `UsersRepository.findLoginIdentity(tenantSlug, email)` (active user, active membership, active tenant).
  2. Verifies Argon2id password hash.
  3. Issues an opaque refresh credential (`TokenService.issueRefreshCredential()`) and a new token family UUID.
  4. Computes idle expiry (`refreshIdleTtlSeconds`) and absolute expiry (`refreshAbsoluteTtlSeconds`).
  5. Calls `SessionRepository.createSession(...)` with the credential hash and metadata.
  6. Issues an access JWT containing `userId`, `membershipId`, `tenantId`, `sessionId`.

- `POST /auth/refresh` -> `AuthService.refresh()`:
  1. Parses the opaque refresh credential (`sessionId.verifier`).
  2. Issues a successor refresh credential.
  3. Calls `SessionRepository.rotateSession(...)` with the presented hash, successor session ID/hash, idle TTL and metadata.
  4. On `ROTATED` issues a new access JWT for the successor session.
  5. On `REPLAY_DETECTED` or `REJECTED` throws a generic `UnauthorizedException`.

- `POST /auth/logout` -> `AuthService.logout()` -> `revokeCurrentFamily(identity)`.
- `POST /auth/logout-all` -> `AuthService.logoutAllDevices()` -> `revokeAllForUser(identity)`.

## 2. Existing Refresh-Credential Format

Format: `msr.{sessionId}.{verifier}` where:

- `sessionId` is a UUID (the session primary key).
- `verifier` is 43 base64url characters (32 random bytes).

Regex enforced in `TokenService`:

```
/^msr\.([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/
```

## 3. Existing Hashing Method

`TokenService.hashRefreshCredential(value)` uses HMAC-SHA-256 with a configured 32+ byte pepper (`AUTH_REFRESH_TOKEN_PEPPER`), producing a 64-character hex digest. Only the digest is persisted. Constant-time comparison is used for verification.

## 4. Session Lifecycle

- **Created:** on successful login; status `ACTIVE`.
- **Rotated:** `ROTATED` after successful refresh; a successor session is created in the same family.
- **Expired:** idle expiry (`expiresAt`) or absolute expiry (`absoluteExpiresAt`) reached.
- **Revoked:** explicit logout, logout-all, inactive identity chain, or replay detection (family marked `COMPROMISED`).
- **Validated:** on every authenticated request through `validateAccessIdentity()` checking the full session -> membership -> user -> tenant chain.

## 5. Credential Lifecycle (new)

A new `UserSessionRefreshCredential` history model records every issued credential:

- **ACTIVE:** the current valid credential for a session (at most one per session via partial unique index).
- **USED:** consumed by a successful rotation; the session's successor credential becomes active.
- **REVOKED:** revoked explicitly or because its session/family was revoked.

A credential is created whenever a session is created (first credential) or rotated (successor credential).

## 6. Replay-Detection Design

The repository distinguishes four states for a presented credential hash against a known session:

| Presented credential state | Result            | Handling                                                                                                             |
| -------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| Matches an `ACTIVE` row    | `ROTATED`         | Rotate atomically; mark old `USED`; create successor `ACTIVE`.                                                       |
| Matches a `USED` row       | `REPLAY_DETECTED` | Revoke the entire token family (remaining `ACTIVE`/`ROTATED` -> `COMPROMISED`); mark all family credentials revoked. |
| Matches a `REVOKED` row    | `REVOKED`         | Reject; optionally family-revoke if the session is still active.                                                     |
| No matching row            | `INVALID`         | Reject without escalating to a confirmed replay.                                                                     |

This prevents an attacker who submits a random secret with a known session ID from triggering family revocation. Only a genuine previously-used credential is treated as confirmed replay.

## 7. Concurrency Strategy

- Every rotation runs inside a PostgreSQL `SERIALIZABLE` transaction (`withSerializableRetry` already exists, bounded retry on `P2034`).
- The "claim" of the active credential is enforced by:
  1. Locating the session row and locking it (`SELECT ... FOR UPDATE` via Prisma `$queryRaw` or a conditional `updateMany` with `version` guard).
  2. A conditional `updateMany` on the session row matching `id` + `version` + `status='ACTIVE'`; exactly one row must be updated, otherwise the losing request is retried or classified as replay/conflict.
  3. The new active credential is then inserted; the partial unique index `one ACTIVE credential per session` provides a hard database backstop against two concurrent wallets both inserting ACTIVE credentials.
- The session `version` column is incremented each rotation for optimistic-concurrency evidence and diagnostics.
- No process-local mutex is used.

## 8. Revocation Strategy

- `revokeCurrentFamily(identity)`: marks every non-terminal session in the family `REVOKED` with `revocationReason='user-logout'` and revokes their credentials.
- `revokeAllForUser(identity)`: marks every `ACTIVE` session for the global `userId` `REVOKED` with `revocationReason='user-logout-all'`, including the membership join, and revokes their credentials.
- Replay handling revokes the family to `COMPROMISED`.
- Repeated revocation is idempotent: it only affects non-terminal sessions and returns the actual affected count.

## 9. Database Model

### `UserSession` (extended)

Adds:

- `userId UUID NOT NULL` + FK -> `User.id` (CASCADE) to support user-wide revocation without joins.
- `tenantId UUID NOT NULL` + FK -> `Tenant.id` (RESTRICT) for direct tenant validation and revocation-scoped queries.
- `version Int NOT NULL DEFAULT 1` for optimistic concurrency.

Keeps existing columns: `id`, `membershipId`, `familyId`, `refreshTokenHash` (denormalized current credential hash, kept for backward compatibility with the S0.3 migration), `ipAddress`, `userAgent`, `deviceName`, `expiresAt`, `absoluteExpiresAt`, `lastUsedAt`, `status`, `replacedById`, `revokedAt`, `revocationReason`, `createdAt`, `updatedAt`.

### `UserSessionRefreshCredential` (new)

| Column             | Type        | Notes                                                    |
| ------------------ | ----------- | -------------------------------------------------------- |
| `id`               | UUID PK     |                                                          |
| `sessionId`        | UUID FK     | -> `UserSession.id` ON DELETE CASCADE                    |
| `hash`             | varchar(64) | unique; HMAC-SHA-256 hex digest                          |
| `status`           | enum        | `ACTIVE`, `USED`, `REVOKED`                              |
| `issuedAt`         | timestamp   |                                                          |
| `usedAt`           | timestamp?  | set when rotation consumes the credential                |
| `revokedAt`        | timestamp?  | set when revoked                                         |
| `replacedById`     | UUID?       | self-reference to successor credential (set on rotation) |
| `rotationSequence` | Int         | non-negative; 1 = first credential of the session        |
| `createdAt`        | timestamp   |                                                          |

## 10. Indexes and Constraints

### UserSession additions

- `@@index([userId, status])` — active sessions by user.
- `@@index([tenantId, status])` — active sessions by tenant.
- `@@index([familyId, createdAt])` — family lineage ordering.
- Check constraint: `version >= 0`.

### UserSessionRefreshCredential

- `@@unique([hash])` — credential lookup by hash.
- `@@index([sessionId, status])` — credentials by session/status.
- `@@index([sessionId, issuedAt])` — credential history ordering.
- `@@index([status, issuedAt])` — cleanup/expiry support.
- Partial unique index (via migration SQL): `one ACTIVE credential per session` on `(sessionId) WHERE status = 'ACTIVE'`.
- Check constraints:
  - `version >= 0` (mapped to `rotationSequence >= 0`)
  - `USED` implies `usedAt IS NOT NULL`
  - `REVOKED` implies `revokedAt IS NOT NULL`
  - `ACTIVE` implies `usedAt IS NULL AND revokedAt IS NULL`

### Referential integrity

- `userSession.userId -> User.id` ON DELETE CASCADE.
- `userSession.tenantId -> Tenant.id` ON DELETE RESTRICT.
- `userSession.membershipId -> TenantMembership.id` ON DELETE CASCADE (existing).
- Composite membership/user/tenant consistency is enforced in the repository (never trusted from request).

## 11. Transaction Boundaries

- `createSession`: one serializable transaction creating `UserSession` + first `UserSessionRefreshCredential` + audit event. Rollback if any write fails.
- `rotateSession`: one serializable transaction performing: session load -> identity chain check -> credential state lookup -> optional replay/family revocation -> conditional session claim (`version` guard) -> old-credential `USED` -> successor-credential insert -> session update -> audit event.
- `revokeCurrentFamily`: one serializable transaction for session-family/credential updates + audit event.
- `revokeAllForUser`: one serializable transaction for user sessions/credentials + platform audit event.
- `expireStaleSessions`: one transaction marking a bounded batch (configurable, default 1000) of expired sessions `EXPIRED` with stable ordering (`createdAt ASC`, `id ASC`).

## 12. Exact Files Expected to Change

1. `packages/database/prisma/schema.prisma` — add `userId`, `tenantId`, `version` to `UserSession`; add `UserSessionRefreshCredential` model; add `RefreshCredentialStatus` enum; add `User.sessions` relation.
2. `packages/database/prisma/migrations/<new>/migration.sql` — append-only forward migration (ALTER UserSession + CREATE credential table + enum + constraints + indexes).
3. `apps/auth-service/src/auth/session.repository.ts` — persistent repository implementation, explicit result types, bounded cleanup.
4. `apps/auth-service/src/auth/auth.service.ts` — adapt to new `createSession` input (`userId`) and new `RotationResult` discriminated union (`INVALID`, `EXPIRED`, `REVOKED`, `IDENTITY_DISABLED`).
5. `apps/auth-service/src/auth/auth.types.ts` — `LoginIdentity` already exposes `user.id`; optionally add `SessionRotationOutcome` type alias.
6. `apps/auth-service/src/auth/session.repository.integration.spec.ts` — extend integration and concurrency coverage.
7. New unit test `apps/auth-service/src/auth/session.repository.spec.ts` — decision-logic tests for active/used/revoked/unknown/expired/revoked-session/disabled-identity/idempotent-revocation.
8. `apps/auth-service/src/auth/auth.service.spec.ts` — update mocked `rotateSession` cases for new outcome union.
9. `docs/audits/2026-08-03-ag02a-session-persistence-completion.md` — completion report.
10. `AI_HANDOFF.md`, `PROJECT_STATUS.md` — relevant status updates.
11. `docs/development-bible/04-database.md` — `UserSession` table catalogue and new credential table documentation.

## 13. Tests to Add

### Unit tests (mock-agnostic decision logic)

1. Active credential -> `ROTATED`.
2. Used credential -> `REPLAY_DETECTED` and family revoked.
3. Revoked credential -> `REVOKED`.
4. Unknown credential -> `INVALID` (not confirmed replay).
5. Expired session -> `EXPIRED`.
6. Revoked session -> `REVOKED`.
7. Disabled user -> `IDENTITY_DISABLED`.
8. Disabled membership -> `IDENTITY_DISABLED`.
9. Disabled tenant -> `IDENTITY_DISABLED`.
10. Idempotent revocation returns actual affected counts.

### PostgreSQL integration tests (existing pattern, `RUN_AUTH_INFRASTRUCTURE_TESTS=true`)

1. Session and first credential persist atomically.
2. Raw refresh credential is absent from the database.
3. Correct hash is stored.
4. Session validation succeeds for an active matching identity.
5. Session validation rejects mismatched user.
6. Session validation rejects mismatched membership.
7. Session validation rejects mismatched tenant.
8. Rotation creates one new active credential.
9. Old credential becomes `USED`.
10. Used credential returns `REPLAY_DETECTED`.
11. Unknown hash returns `INVALID` — not confirmed replay.
12. Revocation persists.
13. Revoke-all affects only the target user.
14. Cleanup processes a bounded batch.
15. Database constraints reject invalid relationships.

### Mandatory concurrency test (real concurrent DB operations)

1. Create one session and one active credential.
2. Submit at least two concurrent rotations using the same credential.
3. Assert exactly one returns `ROTATED`.
4. Assert no second active credential lineage succeeds incorrectly.
5. Assert the final session has one active credential.
6. Assert the losing request returns a safe replay or invalidated result.
7. Assert no synthetic UUIDs are returned.

## Security Policy (documented)

- Only HMAC-SHA-256 digests are persisted — never raw credentials, access tokens, JWTs, passwords, or private keys.
- Repository errors expose safe reason codes only; public messages never reveal whether a guessed session ID exists.
- Unknown credentials are `INVALID`, not `REPLAY_DETECTED`, to prevent attackers from revoking a legitimate session with a random secret.
- All rotation, revocation and creation run in serializable transactions with bounded retry.
