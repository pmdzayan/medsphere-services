-- Task 0021: platform administration security foundation.
--
-- ESTABLISHES THE CANONICAL PLATFORM-SCOPE ADMINISTRATION BOUNDARY.
--
-- Core invariant enforced structurally here: TENANT AUTHORITY != PLATFORM
-- AUTHORITY. No platform table carries tenantId or membershipId; no tenant
-- table is modified; UserSession tenant invariants are untouched. A
-- pharmacy/hospital/lab/clinic membership can never grant platform powers and
-- a platform role carries no tenant/clinical authority by construction.
--
-- What this migration adds:
--   * PlatformAccount            -- optional global per-user platform access
--   * PlatformRole               -- GLOBAL, tenant-less, seeded platform roles
--   * PlatformRolePermission     -- structurally separate role->permission
--                                  bindings (never tenant RolePermission)
--   * PlatformRoleAssignment     -- live server-side platform role grants
--   * PlatformInvitation         -- invitation-only access, HMAC digest only
--   * PlatformSession            -- dedicated tenant-less platform sessions
--   * PlatformSessionRefreshCredential -- single-use rotating refresh proofs
--
-- It also extends the shared canonical Permission catalogue with the two
-- Task 0021 platform permissions and seeds the protected PLATFORM_OWNER and
-- PLATFORM_ADMIN roles with their platform-scoped bindings.

-- ---------------------------------------------------------------------------
-- 1. Fail-closed preflight. Never silently accept an unexpected platform
--    permission or an already-inhabited platform table.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "name" LIKE 'platform.%'
      AND "name" NOT IN ('platform.administration.read', 'platform.administration.manage')
  ) THEN
    RAISE EXCEPTION 'Task 0021 migration blocked: unknown platform-scope permissions require explicit remediation';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname IN (
    'PlatformAccountStatus',
    'PlatformInvitationStatus',
    'PlatformSessionStatus',
    'PlatformRefreshCredentialStatus'
  )) THEN
    RAISE EXCEPTION 'Task 0021 migration blocked: platform types already exist';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PlatformAccount')
  THEN
    RAISE EXCEPTION 'Task 0021 migration blocked: platform tables already exist';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Platform enums.
-- ---------------------------------------------------------------------------
CREATE TYPE "PlatformAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TYPE "PlatformInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TYPE "PlatformSessionStatus" AS ENUM ('ACTIVE', 'ROTATED', 'EXPIRED', 'REVOKED', 'COMPROMISED');

CREATE TYPE "PlatformRefreshCredentialStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED');

-- ---------------------------------------------------------------------------
-- 3. Platform tables.
-- ---------------------------------------------------------------------------
CREATE TABLE "PlatformAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "PlatformAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformRole" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(240),
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformRolePermission" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformRoleAssignment" (
    "id" UUID NOT NULL,
    "platformAccountId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "grantedRoleKey" VARCHAR(64) NOT NULL,
    "createdByPlatformUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRoleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformInvitation" (
    "id" UUID NOT NULL,
    "targetEmail" CITEXT NOT NULL,
    "roleId" UUID NOT NULL,
    "invitationHash" VARCHAR(64) NOT NULL,
    "status" "PlatformInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" UUID,
    "revokedAt" TIMESTAMP(3),
    "revokedByPlatformUserId" UUID,
    "createdByPlatformUserId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformInvitation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PlatformSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "refreshTokenHash" VARCHAR(64) NOT NULL,
    "ipAddress" INET,
    "userAgent" VARCHAR(512),
    "deviceName" VARCHAR(120),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PlatformSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lockedAt" TIMESTAMP(3),
    "lockReason" VARCHAR(120),
    "unlockedAt" TIMESTAMP(3),
    "unlockMethod" VARCHAR(40),
    "securityVersion" INTEGER NOT NULL DEFAULT 1,
    "recentAuthenticatedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSessionRefreshCredential" (
    "id" UUID NOT NULL,
    "platformSessionId" UUID NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "status" "PlatformRefreshCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "rotationSequence" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSessionRefreshCredential_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 4. Platform indexes (schema-declared).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "PlatformAccount_userId_key" ON "PlatformAccount"("userId");

CREATE INDEX "PlatformAccount_status_idx" ON "PlatformAccount"("status");

CREATE INDEX "PlatformAccount_userId_status_idx" ON "PlatformAccount"("userId", "status");

CREATE UNIQUE INDEX "PlatformRole_key_key" ON "PlatformRole"("key");

CREATE INDEX "PlatformRolePermission_roleId_idx" ON "PlatformRolePermission"("roleId");

CREATE INDEX "PlatformRolePermission_permissionId_idx" ON "PlatformRolePermission"("permissionId");

CREATE UNIQUE INDEX "PlatformRolePermission_roleId_permissionId_key" ON "PlatformRolePermission"("roleId", "permissionId");

CREATE INDEX "PlatformRoleAssignment_roleId_idx" ON "PlatformRoleAssignment"("roleId");

CREATE INDEX "PlatformRoleAssignment_platformAccountId_idx" ON "PlatformRoleAssignment"("platformAccountId");

CREATE UNIQUE INDEX "PlatformRoleAssignment_platformAccountId_roleId_key" ON "PlatformRoleAssignment"("platformAccountId", "roleId");

CREATE UNIQUE INDEX "PlatformInvitation_invitationHash_key" ON "PlatformInvitation"("invitationHash");

CREATE INDEX "PlatformInvitation_status_expiresAt_idx" ON "PlatformInvitation"("status", "expiresAt");

CREATE INDEX "PlatformInvitation_targetEmail_status_idx" ON "PlatformInvitation"("targetEmail", "status");

CREATE INDEX "PlatformInvitation_createdByPlatformUserId_createdAt_idx" ON "PlatformInvitation"("createdByPlatformUserId", "createdAt");

CREATE INDEX "PlatformInvitation_roleId_idx" ON "PlatformInvitation"("roleId");

CREATE UNIQUE INDEX "PlatformSession_refreshTokenHash_key" ON "PlatformSession"("refreshTokenHash");

CREATE UNIQUE INDEX "PlatformSession_replacedById_key" ON "PlatformSession"("replacedById");

CREATE INDEX "PlatformSession_userId_status_idx" ON "PlatformSession"("userId", "status");

CREATE INDEX "PlatformSession_familyId_status_idx" ON "PlatformSession"("familyId", "status");

CREATE INDEX "PlatformSession_status_expiresAt_idx" ON "PlatformSession"("status", "expiresAt");

CREATE INDEX "PlatformSession_status_absoluteExpiresAt_idx" ON "PlatformSession"("status", "absoluteExpiresAt");

CREATE INDEX "PlatformSession_familyId_createdAt_idx" ON "PlatformSession"("familyId", "createdAt");

CREATE INDEX "PlatformSession_status_lockedAt_idx" ON "PlatformSession"("status", "lockedAt");

CREATE UNIQUE INDEX "PlatformSessionRefreshCredential_hash_key" ON "PlatformSessionRefreshCredential"("hash");

CREATE UNIQUE INDEX "PlatformSessionRefreshCredential_replacedById_key" ON "PlatformSessionRefreshCredential"("replacedById");

CREATE INDEX "PlatformSessionRefreshCredential_platformSessionId_status_idx" ON "PlatformSessionRefreshCredential"("platformSessionId", "status");

CREATE INDEX "PlatformSessionRefreshCredential_platformSessionId_issuedAt_idx" ON "PlatformSessionRefreshCredential"("platformSessionId", "issuedAt");

CREATE INDEX "PlatformSessionRefreshCredential_status_issuedAt_idx" ON "PlatformSessionRefreshCredential"("status", "issuedAt");
-- ---------------------------------------------------------------------------
-- 5. Platform foreign keys (schema-declared).
-- ---------------------------------------------------------------------------
ALTER TABLE "PlatformAccount" ADD CONSTRAINT "PlatformAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformRolePermission" ADD CONSTRAINT "PlatformRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformRolePermission" ADD CONSTRAINT "PlatformRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformRoleAssignment" ADD CONSTRAINT "PlatformRoleAssignment_platformAccountId_fkey" FOREIGN KEY ("platformAccountId") REFERENCES "PlatformAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformRoleAssignment" ADD CONSTRAINT "PlatformRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformRoleAssignment" ADD CONSTRAINT "PlatformRoleAssignment_createdByPlatformUserId_fkey" FOREIGN KEY ("createdByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformInvitation" ADD CONSTRAINT "PlatformInvitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "PlatformRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformInvitation" ADD CONSTRAINT "PlatformInvitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformInvitation" ADD CONSTRAINT "PlatformInvitation_revokedByPlatformUserId_fkey" FOREIGN KEY ("revokedByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformInvitation" ADD CONSTRAINT "PlatformInvitation_createdByPlatformUserId_fkey" FOREIGN KEY ("createdByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "PlatformSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_platformAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformAccount"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformSessionRefreshCredential" ADD CONSTRAINT "PlatformSessionRefreshCredential_platformSessionId_fkey" FOREIGN KEY ("platformSessionId") REFERENCES "PlatformSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlatformSessionRefreshCredential" ADD CONSTRAINT "PlatformSessionRefreshCredential_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "PlatformSessionRefreshCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Shared permission catalogue extension (append-only). The two Task 0021
--    platform permissions use stable, migration-owned identifiers. The S0.4
--    Permission table trigger that rejects catalogue mutation is suspended and
--    restored immediately, exactly as Task 0018 did for its catalogue entry.
-- ---------------------------------------------------------------------------
ALTER TABLE "Permission"
  DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:platform.administration.read')::uuid,
    'platform.administration.read',
    'Read platform administration state'
  ),
  (
    md5('medsphere:permission:platform.administration.manage')::uuid,
    'platform.administration.manage',
    'Manage platform administration state'
  )
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Permission"
  ENABLE TRIGGER "Permission_reject_insert_update_delete";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "name" IN ('platform.administration.read', 'platform.administration.manage')
      AND "id" NOT IN (
        md5('medsphere:permission:platform.administration.read')::uuid,
        md5('medsphere:permission:platform.administration.manage')::uuid
      )
  ) THEN
    RAISE EXCEPTION 'Task 0021 migration blocked: platform permission identifiers do not match the authoritative catalogue';
  END IF;
END $$;
-- ---------------------------------------------------------------------------
-- 7. Seed the protected global platform roles (append-only, immutable).
-- ---------------------------------------------------------------------------
INSERT INTO "PlatformRole" (
  "id",
  "key",
  "name",
  "description",
  "isProtected",
  "version",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    md5('medsphere:platform-role:PLATFORM_OWNER')::uuid,
    'PLATFORM_OWNER',
    'Platform Owner',
    'Protected initial platform owner. Grants platform administration read and manage.',
    true,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    md5('medsphere:platform-role:PLATFORM_ADMIN')::uuid,
    'PLATFORM_ADMIN',
    'Platform Administrator',
    'Platform administrator. Grants platform administration read only.',
    true,
    1,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("key") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PlatformRole"
    WHERE "key" IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
      AND ("isProtected" <> true OR "deletedAt" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Task 0021 migration blocked: protected platform roles must remain protected and undeleted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "PlatformRole"
    WHERE "key" IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN')
      AND "id" NOT IN (
        md5('medsphere:platform-role:PLATFORM_OWNER')::uuid,
        md5('medsphere:platform-role:PLATFORM_ADMIN')::uuid
      )
  ) THEN
    RAISE EXCEPTION 'Task 0021 migration blocked: platform role identifiers do not match the authoritative catalogue';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Platform role -> permission bindings (structurally separate from tenant
--    RolePermission).
-- ---------------------------------------------------------------------------
INSERT INTO "PlatformRolePermission" ("id", "roleId", "permissionId", "createdAt")
VALUES
  (
    md5('medsphere:platform-role-permission:OWNER:administration-read')::uuid,
    md5('medsphere:platform-role:PLATFORM_OWNER')::uuid,
    md5('medsphere:permission:platform.administration.read')::uuid,
    CURRENT_TIMESTAMP
  ),
  (
    md5('medsphere:platform-role-permission:OWNER:administration-manage')::uuid,
    md5('medsphere:platform-role:PLATFORM_OWNER')::uuid,
    md5('medsphere:permission:platform.administration.manage')::uuid,
    CURRENT_TIMESTAMP
  ),
  (
    md5('medsphere:platform-role-permission:ADMIN:administration-read')::uuid,
    md5('medsphere:platform-role:PLATFORM_ADMIN')::uuid,
    md5('medsphere:permission:platform.administration.read')::uuid,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Data-model invariants proven by the database.
-- ---------------------------------------------------------------------------

-- 9a. One platform account per global user (unique userId above). The granted
--     role key consistency check lives in a write-time trigger below because
--     PostgreSQL CHECK constraints cannot reference another table.

-- 9b. Platform role-assignment consistency + protected-owner invariants are
--     enforced by write-time triggers (roles are immutable, so the granted
--     key can only ever be the seeded PLATFORM_OWNER / PLATFORM_ADMIN keys).
CREATE OR REPLACE FUNCTION enforce_platform_role_assignment_invariant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."grantedRoleKey" <> (
    SELECT pr."key"
    FROM "PlatformRole" pr
    WHERE pr."id" = NEW."roleId"
  ) THEN
    RAISE EXCEPTION 'PlatformRoleAssignment grantedRoleKey must match the granted PlatformRole key';
  END IF;

  IF NEW."grantedRoleKey" NOT IN ('PLATFORM_OWNER', 'PLATFORM_ADMIN') THEN
    RAISE EXCEPTION 'PlatformRoleAssignment only supports approved platform roles';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformRoleAssignment_enforce_invariant"
BEFORE INSERT OR UPDATE ON "PlatformRoleAssignment"
FOR EACH ROW
EXECUTE FUNCTION enforce_platform_role_assignment_invariant();

-- 9c. No tenant/membership context may appear on platform rows. This is
--     structural (no such columns exist anywhere here), plus a belt-and-
--     suspenders trigger that makes the separation explicit at the DB layer.
CREATE OR REPLACE FUNCTION enforce_platform_row_no_tenant_context()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'PlatformAccount' THEN
    IF NEW."userId" IS NULL OR EXISTS (
      SELECT 1 FROM "User" u WHERE u."id" = NEW."userId" AND u."deletedAt" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'PlatformAccount must reference an existing, non-deleted global user';
    END IF;
  ELSIF TG_TABLE_NAME = 'PlatformSession' THEN
    IF NEW."userId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "PlatformAccount" pa WHERE pa."userId" = NEW."userId"
    ) THEN
      RAISE EXCEPTION 'PlatformSession must belong to an existing platform account';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformAccount_enforce_no_tenant_context"
BEFORE INSERT OR UPDATE ON "PlatformAccount"
FOR EACH ROW
EXECUTE FUNCTION enforce_platform_row_no_tenant_context();

CREATE TRIGGER "PlatformSession_enforce_no_tenant_context"
BEFORE INSERT OR UPDATE ON "PlatformSession"
FOR EACH ROW
EXECUTE FUNCTION enforce_platform_row_no_tenant_context();

-- ---------------------------------------------------------------------------
-- 10. Protected platform roles must be immutable at runtime. Normal API calls
--     cannot create, rename, delete, or silently replace the protected owner
--     role. This trigger is additive (append-only migrations leave it in place)
--     and mirrors the accepted audit-event immutability convention.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_platform_role_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'PlatformRole is append-only and immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PlatformRole_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PlatformRole"
FOR EACH ROW
EXECUTE FUNCTION reject_platform_role_mutation();

-- ---------------------------------------------------------------------------
-- 11. At most one active PLATFORM_OWNER at the database level (the important
--     protected-owner invariant is proven in pure SQL, not only in services).
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "PlatformRoleAssignment_one_active_owner_key"
ON "PlatformRoleAssignment"((TRUE))
WHERE "grantedRoleKey" = 'PLATFORM_OWNER';

-- ---------------------------------------------------------------------------
-- 12. Platform session invalidation on account suspension is enforced at the
--     DB-invariant level with the same immediate-revocation semantics the
--     tenant session layer uses (a suspended platform account fails every live
--     session lookup).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 13. Extend the immutable audit-event allowlist with the Task 0021 platform
--     event types, preserving every previously accepted event type (the same
--     append-only pattern every prior task used). This keeps the DB-level
--     event-type allowlist exactly aligned with the shared AuditWriter
--     catalogue in @medsphere/database so a platform action can never be
--     recorded under a fabricated event type.
-- ---------------------------------------------------------------------------
ALTER TABLE "AuditEvent"
  DROP CONSTRAINT "AuditEvent_event_type_check";

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_event_type_check"
  CHECK ("eventType" IN (
    'authorization.role.created', 'authorization.role.updated',
    'authorization.role.deleted', 'authorization.assignment.added',
    'authorization.assignment.removed', 'authorization.provider-access.added',
    'authorization.provider-access.removed', 'authorization.permission.denied',
    'authorization.membership.suspended', 'authorization.membership.revoked',
    'authentication.session.created', 'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed', 'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded', 'authentication.sessions.logout.succeeded',
    'authentication.session.locked', 'authentication.session.unlocked',
    'authentication.session.unlock.failed', 'authentication.session.logout.locked',
    'authentication.session.switched', 'authentication.session.reauthenticated',
    'authentication.verification.completed', 'authentication.account.activated',
    'authentication.otp.requested',
    'authentication.organization.join.requested',
    'authentication.organization.join.code.rejected',
    'authentication.organization.join.code.issued',
    'authentication.organization.join.code.revoked',
    'privacy.consent.granted', 'privacy.consent.withdrawn', 'privacy.preference.changed',
    'inventory.listing.configured', 'inventory.batch.received',
    'inventory.stock.adjusted', 'inventory.stock.transferred',
    'inventory.stock.damaged', 'inventory.batch.expired', 'inventory.batch.quarantined',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired',
    'platform.authentication.session.created',
    'platform.authentication.session.refresh.succeeded',
    'platform.authentication.session.refresh.failed',
    'platform.authentication.session.refresh.replayed',
    'platform.authentication.session.logout.succeeded',
    'platform.authentication.session.locked',
    'platform.authentication.session.unlocked',
    'platform.invitation.created', 'platform.invitation.revoked', 'platform.invitation.accepted',
    'platform.role.assigned', 'platform.admin.suspended', 'platform.admin.reactivated',
    'platform.session.revoked', 'platform.owner.bootstrap'
  ));
