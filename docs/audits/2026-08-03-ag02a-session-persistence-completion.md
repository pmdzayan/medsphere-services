# AG-02A — Persistent Session Schema, Credential Rotation and Repository — Completion Report

**Date:** 2026-08-03
**Task:** CL-AG-02A (first bounded implementation node for AG-02)
**Branch:** `cto/ag02a-session-persistence`
**Base commit:** `87bbb37`

## Status

```text
PROVISIONALLY_COMPLETE
```

## Git Evidence

- **Branch:** `cto/ag02a-session-persistence`
- **Base commit:** `87bbb37de22c1545f0d2ecb12f5340b7d278bf3a`
- **Commit IDs:** `ff10984` — `feat(auth): persist sessions and refresh credential rotation`
- **Diff statistics:** 12 files changed, 1470 insertions(+), 242 deletions(-)
- **Final `git status --short`:** working tree clean for tracked changes; pre-existing untracked artifacts remain (`.json.map` files, `build_output.txt`, `lint_*.txt`, `docs/audits/ag01-delta-manifest.md`, `.vscode/launch.json`, `ENGINEERING_REVIEW.zip`)

## Database

### Models

- `UserSession` extended with `userId` (FK -> `User`, CASCADE), `tenantId` (FK -> `Tenant`, RESTRICT), and `version` for optimistic concurrency; new indexes `(userId, status)`, `(tenantId, status)`, `(familyId, createdAt)`.
- `UserSessionRefreshCredential` (new): `id`, `sessionId` FK, `hash` unique, `status` (`RefreshCredentialStatus`), timestamps, `replacedById`, `rotationSequence`, `createdAt`; indexes on unique hash, `(sessionId, status)`, `(sessionId, issuedAt)`, `(status, issuedAt)`.
- `RefreshCredentialStatus` enum: `ACTIVE`, `USED`, `REVOKED`.

### Migration

`packages/database/prisma/migrations/20260803120000_persistent_session_credential_rotation/migration.sql` — append-only forward migration with backfill of `userId`/`tenantId` from `TenantMembership`, credential history table, constraints, and partial unique index.

### Constraints

- `UserSession_version_nonnegative_check` (`version >= 0`).
- `UserSessionRefreshCredential_rotationSequence_nonnegative_check`.
- Used/revoked/active state-shape checks (timestamps consistent with status).
- Partial unique index `UserSessionRefreshCredential_one_active_per_session_key` — one `ACTIVE` credential per session, the hard concurrency backstop.

## Repository

### Methods implemented

- `createSession(data)` — atomic session + first credential + audit in a serializable transaction.
- `validateAccessIdentity(identity, tokenId)` — real durable user/membership/tenant/session chain check; no synthetic identities.
- `rotateSession(data)` — atomic rotation with credential-history classification, replay detection, family revocation, optimistic `version` guard, explicit result union.
- `revokeCurrentFamily(identity)` / `revokeAllForUser(identity)` — durable revocation with actual affected counts; idempotent.
- `expireStaleSessions(batchSize)` — bounded, stably ordered, idempotent cleanup.

### Placeholder behaviour removed

- No synthetic zero UUIDs.
- No hardcoded `1` revocation counts.
- No no-op `createSession`.
- No `expireStaleSessions` always returning zero.

### Rotation outcomes

```text
ROTATED
REPLAY_DETECTED
INVALID
EXPIRED
REVOKED
IDENTITY_DISABLED
```

## Security

- **Hashing:** only HMAC-SHA-256 digests persisted; never raw credentials, tokens, JWTs, passwords, or private keys.
- **Replay distinction:** `USED` -> `REPLAY_DETECTED` (family -> `COMPROMISED`); `REVOKED` -> `REVOKED`; `UNKNOWN` -> `INVALID` (never confirmed replay, so a random-secret attacker cannot revoke a legitimate session).
- **Concurrency:** serializable transactions with bounded retry, conditional `updateMany` with `version` guard, partial unique index backstop; no process-local mutex.
- **Revocation:** durable session and credential state; idempotent; accurate counts.
- **Tenant/membership validation:** full chain verified from the database, never from request-supplied IDs.

## Tests

### Unit — `session-policy.spec.ts` — PASS (15 tests)

Active -> `ROTATED`; used -> `REPLAY_DETECTED`; revoked credential -> `REVOKED`; unknown -> `INVALID` (not replay); idle/absolute expired -> `EXPIRED`; revoked/compromised session -> `REVOKED`; disabled/deleted user, membership, tenant -> `IDENTITY_DISABLED`; ROTATED session with active credential -> `INVALID`.

### Integration — `session.repository.integration.spec.ts` (written, gated by `RUN_AUTH_INFRASTRUCTURE_TESTS=true`)

1. Session + first credential persist atomically.
2. Raw refresh credential absent from database.
3. Correct hash stored.
4. Validation succeeds for matching chain.
5. Validation rejects mismatched user.
6. Validation rejects mismatched membership.
7. Validation rejects mismatched tenant.
8. Rotation creates one new active credential.
9. Old credential becomes `USED`.
10. Used credential returns `REPLAY_DETECTED`.
11. Unknown hash returns `INVALID` (not confirmed replay).
12. Revocation persists.
13. Revoke-all affects only target user.
14. Cleanup processes bounded batch.
15. Constraints reject invalid relationships.

### Concurrency (real concurrent DB ops)

- Two concurrent rotations on one credential: exactly one `ROTATED`; one active credential remains; loser returns replay/invalid result; no synthetic UUIDs.

### Results

- `session-policy.spec.ts`: PASS 15.
- `auth.service.spec.ts`: PASS 6.
- Full auth-service run: 15 suites passed, 3 failed (pre-existing `request-metadata.spec.ts` and `app.e2e.spec.ts` infrastructure timeouts), 3 skipped (infrastructure-gated).

## Validation

| Command                                       | Exit | Status                                                                                                                                                  |
| --------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`              |    0 | PASSED                                                                                                                                                  |
| `pnpm --filter @medsphere/database build`     |    0 | PASSED                                                                                                                                                  |
| `pnpm --filter @medsphere/common build`       |    0 | PASSED                                                                                                                                                  |
| `pnpm --filter @medsphere/types build`        |    0 | PASSED                                                                                                                                                  |
| `pnpm --filter @medsphere/logger build`       |    0 | PASSED                                                                                                                                                  |
| `pnpm --filter @medsphere/auth-service lint`  |    0 | PASSED                                                                                                                                                  |
| `pnpm --filter @medsphere/auth-service test`  |    1 | PARTIAL (see above)                                                                                                                                     |
| `pnpm --filter @medsphere/auth-service build` |    0 | PASSED                                                                                                                                                  |
| `pnpm format:check`                           |    1 | PARTIAL — 2 pre-existing files fail (`2026-08-03-cline-ag01-recovery-isolation-verification.md`, `ag01-delta-manifest.md`); all new/modified files pass |
| `git diff --check`                            |    0 | PASSED                                                                                                                                                  |

### PostgreSQL infrastructure

Integration/concurrency tests are written and gated behind `RUN_AUTH_INFRASTRUCTURE_TESTS=true`. They could not be executed because Docker Desktop is not running, the local PostgreSQL 18 service is stopped (cannot start without admin), and its data directory is uninitialized. **Environmental** limitation; tests will run in CI or when a PostgreSQL instance is available.

## Remaining AG-02 Work

### AG-02B — Authentication Service, Session APIs, Ownership and Audit

- Session-listing APIs (owned sessions only)
- Session-management endpoints (revoke specific session, revoke all)
- DTOs, controllers, Swagger
- Ownership/tenant-scope enforcement for session APIs
- Audit integration for session-management actions
- Frontend session UI (Claude)

### AG-02C

- Remaining AG-02 work not assigned to AG-02B (CTO scope).

## Next Node

```text
AG-02B — Authentication Service, Session APIs, Ownership and Audit
```
