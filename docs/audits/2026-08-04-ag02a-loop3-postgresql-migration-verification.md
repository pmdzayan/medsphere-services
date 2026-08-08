# AG-02A Remediation Loop 3 — PostgreSQL Disposable Migration Verification Report

**Date:** 2026-08-04  
**Task:** AG-02A-R (Session Persistence Remediation Loop 3)  
**Agent:** Antigravity AI  
**Status:** `LOOP_3_COMPLETE`

---

## 1. Environment & Database Configuration

- **PostgreSQL Version:** PostgreSQL 18.4 on x86_64-windows, compiled by msvc-19.44.35227, 64-bit
- **Host & Port:** `127.0.0.1:5432` (`localhost`)
- **Primary Disposable Database:** `medsphere_ag02a_test_20260804112815`
- **Secondary Disposable Database:** `medsphere_ag02a_test_20260804113015`
- **Client Tools Located:**
  - `C:\Program Files\PostgreSQL\18\bin\psql.exe`
  - `C:\Program Files\PostgreSQL\18\bin\createdb.exe`
  - `C:\Program Files\PostgreSQL\18\bin\dropdb.exe`
- **Required Extensions Verified:** `citext`, `uuid-ossp`
- **Connection Security:** Connection string constructed dynamically in process environment (`postgresql://<user>:<redacted>@127.0.0.1:5432/<database>?schema=public`). No credentials logged or committed.

---

## 2. First Migration Deployment

- **Target Database:** `medsphere_ag02a_test_20260804112815`
- **Deployment Command:** `pnpm --filter @medsphere/database run prisma:deploy`
- **Exit Code:** `0` (Success)
- **Duration:** 3.4 seconds
- **Applied Migrations (5 Total):**
  1. `20260715163416_init_auth_schema`
  2. `20260720020000_complete_reproducible_baseline`
  3. `20260720120000_trusted_authentication_tenant_context`
  4. `20260725120000_tenant_safe_authorization_durable_audit`
  5. `20260803120000_persistent_session_credential_rotation`
- **Migration History Table (`_prisma_migrations`):** 5 rows recorded, all `applied_steps_count = 1`, 0 rolled back, 0 failed.

---

## 3. Schema Inspection & Invariant Verification

Verified against `schema.prisma` and migration `20260803120000_persistent_session_credential_rotation`:

### `UserSession` Table

- **Columns:** `id` (uuid), `userId` (uuid), `tenantId` (uuid), `membershipId` (uuid), `familyId` (uuid), `refreshTokenHash` (varchar 64), `ipAddress` (inet), `userAgent` (varchar 512), `deviceName` (varchar 120), `expiresAt` (timestamp), `absoluteExpiresAt` (timestamp), `lastUsedAt` (timestamp), `status` (`SessionStatus` enum), `replacedById` (uuid), `version` (int), `revokedAt` (timestamp), `revocationReason` (varchar 120), `createdAt` (timestamp), `updatedAt` (timestamp).
- **Foreign Keys:**
  - `userId` -> `User(id)` ON DELETE CASCADE
  - `tenantId` -> `Tenant(id)` ON DELETE RESTRICT
  - `membershipId` -> `TenantMembership(id)` ON DELETE CASCADE
- **Check Constraints:** `UserSession_version_nonnegative_check` (`version >= 0`).
- **Indexes:**
  - Unique index: `UserSession_pkey` on `id`
  - Unique index: `UserSession_refreshTokenHash_key` on `refreshTokenHash`
  - Unique index: `UserSession_replacedById_key` on `replacedById`
  - Composite indexes: `(userId, status)`, `(tenantId, status)`, `(membershipId, status)`, `(familyId, status)`, `(familyId, createdAt)`, `(status, expiresAt)`, `(status, absoluteExpiresAt)`.

### `UserSessionRefreshCredential` Table

- **Columns:** `id` (uuid), `sessionId` (uuid), `hash` (varchar 64), `status` (`RefreshCredentialStatus` enum), `issuedAt` (timestamp), `usedAt` (timestamp), `revokedAt` (timestamp), `replacedById` (uuid), `rotationSequence` (int), `createdAt` (timestamp).
- **Enums:** `RefreshCredentialStatus` (`ACTIVE`, `USED`, `REVOKED`).
- **Check Constraints:**
  - `UserSessionRefreshCredential_rotationSequence_nonnegative_check` (`rotationSequence >= 0`)
  - `UserSessionRefreshCredential_active_state_check` (`status = ACTIVE` implies `usedAt IS NULL AND revokedAt IS NULL`)
  - `UserSessionRefreshCredential_used_state_check` (`status = USED` implies `usedAt IS NOT NULL`)
  - `UserSessionRefreshCredential_revoked_state_check` (`status = REVOKED` implies `revokedAt IS NOT NULL`)
- **Indexes & Hard Concurrency Backstop:**
  - Unique index: `UserSessionRefreshCredential_pkey` on `id`
  - Unique index: `UserSessionRefreshCredential_hash_key` on `hash`
  - **Partial Unique Index:** `UserSessionRefreshCredential_one_active_per_session_key` on `(sessionId) WHERE status = 'ACTIVE'`.
  - Operational indexes: `(sessionId, status)`, `(sessionId, issuedAt)`, `(status, issuedAt)`.

- **Differences / Mismatches:** 0 differences found. Database schema matches Prisma datamodel and raw migration SQL exactly.

---

## 4. Identity-Chain Structural Inspection

### Classification

```text
APPLICATION_ONLY
```

### Analysis & Evidence

- **Database Foreign Keys:** `UserSession` maintains separate foreign key constraints for `userId`, `tenantId`, and `membershipId`:
  - `UserSession_userId_fkey` -> `User(id)`
  - `UserSession_tenantId_fkey` -> `Tenant(id)`
  - `UserSession_membershipId_fkey` -> `TenantMembership(id)`
- **Constraint Seam:** `UserSession` does NOT define composite foreign keys such as `(membershipId, tenantId)` -> `TenantMembership(id, tenantId)` or `(membershipId, userId)` -> `TenantMembership(id, userId)`.
- **Consequence:** The PostgreSQL database engine alone will accept a `UserSession` row where `userId = User A`, `tenantId = Tenant A`, and `membershipId = Membership B` (belonging to User B/Tenant B), provided all three IDs exist independently in their primary key tables.
- **Application Boundary:** Identity-chain consistency (matching `userId`, `tenantId`, and `membershipId`) is strictly validated in application logic by `SessionRepository.validateAccessIdentity()` and `rotateSession()`.

---

## 5. Second Deployment Verification (Drop & Recreate)

1. **Active Connection Termination:** `pg_terminate_backend()` executed against `medsphere_ag02a_test_20260804112815`.
2. **Database Drop:** `DROP DATABASE IF EXISTS "medsphere_ag02a_test_20260804112815"` completed with exit `0`.
3. **Second DB Creation:** `medsphere_ag02a_test_20260804113015` created with `citext` and `uuid-ossp` extensions.
4. **Second Migration Deployment:** `pnpm --filter @medsphere/database run prisma:deploy` executed cleanly against empty database `medsphere_ag02a_test_20260804113015` (Exit `0`, 5 migrations applied).
5. **Second Schema Verification:** Migration history and schema inspection confirmed identical structure (5 migrations applied, partial unique index present, check constraints active).

---

## 6. Migration & Database Blockers

None. The full migration chain deploys cleanly against an empty PostgreSQL 18 instance without errors, warnings, or missing extensions.

---

## 7. Loop 4 Recommendation

Loop 4 may proceed with:

```text
Request metadata, Health route and E2E source remediation
```

**Reason:** Database infrastructure readiness has been empirically proven with two clean empty-database migration deployments, schema constraint verification, and partial unique index validation on real PostgreSQL 18. Loop 4 can now fix the three identified source defects (`normalizeRequestId` validation in `@medsphere/common`, `@PublicEndpoint()` decorator on `HealthController` in `@medsphere/common`, and markdown formatting).
