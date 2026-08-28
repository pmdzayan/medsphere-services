-- Task 0010: secure organization-type + reusable, revocable organization
-- join-code onboarding. Adds Tenant.organizationType (bounded enum, never
-- a free-form string) and a new OrganizationJoinCode table storing only a
-- keyed HMAC-SHA256 hash of each code -- never the plaintext.

CREATE TYPE "OrganizationType" AS ENUM (
  'UNSPECIFIED',
  'PHARMACY',
  'HOSPITAL',
  'LABORATORY',
  'CLINIC',
  'BLOOD_BANK',
  'SUPPLIER',
  'NONE'
);

CREATE TYPE "JoinCodeStatus" AS ENUM (
  'ACTIVE',
  'REVOKED'
);

ALTER TABLE "Tenant"
  ADD COLUMN "organizationType" "OrganizationType" NOT NULL DEFAULT 'UNSPECIFIED';

CREATE TABLE "OrganizationJoinCode" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "status" "JoinCodeStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "redemptionCount" INTEGER NOT NULL DEFAULT 0,
  "createdByMembershipId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "OrganizationJoinCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationJoinCode_code_hash_check"
    CHECK ("codeHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "OrganizationJoinCode_redemption_count_check"
    CHECK ("redemptionCount" >= 0),
  CONSTRAINT "OrganizationJoinCode_version_check"
    CHECK ("version" > 0),
  CONSTRAINT "OrganizationJoinCode_revocation_state_check"
    CHECK (
      ("status" = 'ACTIVE' AND "revokedAt" IS NULL)
      OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "OrganizationJoinCode_codeHash_key"
  ON "OrganizationJoinCode"("codeHash");

CREATE INDEX "OrganizationJoinCode_tenantId_idx"
  ON "OrganizationJoinCode"("tenantId");

ALTER TABLE "OrganizationJoinCode"
  ADD CONSTRAINT "OrganizationJoinCode_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationJoinCode"
  ADD CONSTRAINT "OrganizationJoinCode_createdByMembershipId_tenantId_fkey"
  FOREIGN KEY ("createdByMembershipId", "tenantId")
  REFERENCES "TenantMembership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only tenant administrators receive the new management capability. The
-- immutable permission catalogue is modified exclusively by migration.
ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES (
  md5('medsphere:permission:organization.join-codes.manage')::uuid,
  'organization.join-codes.manage',
  'Issue, list, and revoke organization onboarding join codes'
);

ALTER TABLE "Permission"
ENABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "RolePermission" (
  "id", "tenantId", "roleId", "permissionId", "createdAt"
)
SELECT
  md5(r."id"::text || ':' || p."id"::text)::uuid,
  r."tenantId",
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r."name" = 'TENANT_ADMINISTRATOR'
  AND r."type" = 'SYSTEM'
  AND r."deletedAt" IS NULL
  AND p."name" = 'organization.join-codes.manage';

-- Extend the database audit-event allowlist for organization onboarding
-- events.
ALTER TABLE "AuditEvent"
  DROP CONSTRAINT "AuditEvent_event_type_check";

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_event_type_check"
  CHECK ("eventType" IN (
    'authorization.role.created',
    'authorization.role.updated',
    'authorization.role.deleted',
    'authorization.assignment.added',
    'authorization.assignment.removed',
    'authorization.provider-access.added',
    'authorization.provider-access.removed',
    'authorization.permission.denied',
    'authentication.session.created',
    'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed',
    'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded',
    'authentication.sessions.logout.succeeded',
    'authentication.verification.completed',
    'authentication.account.activated',
    'authentication.otp.requested',
    'authentication.organization.join.requested',
    'authentication.organization.join.code.rejected',
    'authentication.organization.join.code.issued',
    'authentication.organization.join.code.revoked',
    'inventory.listing.configured',
    'inventory.batch.received',
    'inventory.stock.adjusted',
    'inventory.stock.transferred',
    'inventory.stock.damaged',
    'inventory.batch.expired',
    'inventory.batch.quarantined',
    'inventory.reservation.created',
    'inventory.reservation.confirmed',
    'inventory.reservation.ready',
    'inventory.reservation.completed',
    'inventory.reservation.cancelled',
    'inventory.reservation.expired'
  ));
