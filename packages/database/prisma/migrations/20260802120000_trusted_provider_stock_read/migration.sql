-- G3.1 trusted provider access and the first accepted inventory read boundary.

CREATE TABLE "MembershipProviderAccess" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MembershipProviderAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MembershipProviderAccess_membershipId_providerId_key"
ON "MembershipProviderAccess"("membershipId", "providerId");

CREATE INDEX "MembershipProviderAccess_tenantId_membershipId_idx"
ON "MembershipProviderAccess"("tenantId", "membershipId");

CREATE INDEX "MembershipProviderAccess_tenantId_providerId_idx"
ON "MembershipProviderAccess"("tenantId", "providerId");

ALTER TABLE "MembershipProviderAccess"
ADD CONSTRAINT "MembershipProviderAccess_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MembershipProviderAccess"
ADD CONSTRAINT "MembershipProviderAccess_membershipId_tenantId_fkey"
FOREIGN KEY ("membershipId", "tenantId")
REFERENCES "TenantMembership"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipProviderAccess"
ADD CONSTRAINT "MembershipProviderAccess_providerId_tenantId_fkey"
FOREIGN KEY ("providerId", "tenantId")
REFERENCES "Provider"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- The catalogue is immutable at runtime. Migrations alone may extend it for
-- routes accepted by a reviewed sprint.
ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:authorization.provider-access.read')::uuid,
    'authorization.provider-access.read',
    'Read provider assignments for memberships in the active tenant'
  ),
  (
    md5('medsphere:permission:authorization.provider-access.manage')::uuid,
    'authorization.provider-access.manage',
    'Add or remove provider assignments in the active tenant'
  ),
  (
    md5('medsphere:permission:inventory.stock.read')::uuid,
    'inventory.stock.read',
    'Read batch-derived stock for an assigned provider in the active tenant'
  );

ALTER TABLE "Permission"
ENABLE TRIGGER "Permission_reject_insert_update_delete";

-- Built-in tenant administrators receive the newly accepted permissions.
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
  AND p."name" IN (
    'authorization.provider-access.read',
    'authorization.provider-access.manage',
    'inventory.stock.read'
  );

-- Preserve administrator operability without granting ordinary memberships
-- tenant-wide provider access.
INSERT INTO "MembershipProviderAccess" (
  "id", "tenantId", "membershipId", "providerId", "createdAt"
)
SELECT
  md5(mr."membershipId"::text || ':' || p."id"::text)::uuid,
  mr."tenantId",
  mr."membershipId",
  p."id",
  CURRENT_TIMESTAMP
FROM "MembershipRole" mr
JOIN "TenantMembership" tm
  ON tm."id" = mr."membershipId"
 AND tm."tenantId" = mr."tenantId"
JOIN "Role" r
  ON r."id" = mr."roleId"
 AND r."tenantId" = mr."tenantId"
JOIN "Provider" p
  ON p."tenantId" = mr."tenantId"
WHERE tm."status" = 'ACTIVE'
  AND tm."deletedAt" IS NULL
  AND r."name" = 'TENANT_ADMINISTRATOR'
  AND r."type" = 'SYSTEM'
  AND r."deletedAt" IS NULL
  AND p."isActive" = true
  AND p."deletedAt" IS NULL;

ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_event_type_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_event_type_check" CHECK (
  "eventType" IN (
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
    'inventory.listing.configured',
    'inventory.batch.received',
    'inventory.stock.adjusted',
    'inventory.reservation.created',
    'inventory.reservation.confirmed',
    'inventory.reservation.ready',
    'inventory.reservation.completed',
    'inventory.reservation.cancelled',
    'inventory.reservation.expired'
  )
);
