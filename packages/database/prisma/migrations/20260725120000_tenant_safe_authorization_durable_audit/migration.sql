-- S0.4 tenant-safe authorization and durable audit.
--
-- This migration intentionally fails closed when unaccepted prototype data
-- cannot be converted without guessing. Error messages expose only categories,
-- never user, tenant, role, permission, or audit values.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditLog") THEN
    RAISE EXCEPTION 'S0.4 migration blocked: mutable legacy audit rows require explicit remediation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Permission"
    WHERE "deletedAt" IS NOT NULL
       OR "name" NOT IN (
         'authorization.roles.read',
         'authorization.roles.create',
         'authorization.roles.update',
         'authorization.roles.delete',
         'authorization.permissions.read',
         'authorization.assignments.read',
         'authorization.assignments.manage',
         'audit.events.read'
       )
  ) THEN
    RAISE EXCEPTION 'S0.4 migration blocked: unsupported or deleted legacy permissions require explicit remediation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Role"
    WHERE ("type" = 'SYSTEM' AND ("name" <> 'TENANT_ADMINISTRATOR' OR "deletedAt" IS NOT NULL))
       OR ("name" = 'TENANT_ADMINISTRATOR' AND ("type" <> 'SYSTEM' OR "deletedAt" IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'S0.4 migration blocked: invalid built-in legacy roles require explicit remediation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "RolePermission" rp
    JOIN "Role" r ON r."id" = rp."roleId"
    JOIN "Permission" p ON p."id" = rp."permissionId"
    WHERE r."tenantId" <> p."tenantId"
       OR r."deletedAt" IS NOT NULL
       OR p."deletedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'S0.4 migration blocked: invalid legacy role-permission mappings require explicit remediation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "UserRole" ur
    JOIN "Role" r ON r."id" = ur."roleId"
    LEFT JOIN "TenantMembership" tm
      ON tm."userId" = ur."userId"
     AND tm."tenantId" = r."tenantId"
    WHERE r."deletedAt" IS NOT NULL
       OR tm."id" IS NULL
       OR tm."deletedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'S0.4 migration blocked: invalid legacy role assignments require explicit remediation';
  END IF;
END $$;

-- Composite candidate keys allow foreign keys to prove tenant equality.
CREATE UNIQUE INDEX "TenantMembership_id_tenantId_key"
ON "TenantMembership"("id", "tenantId");

CREATE UNIQUE INDEX "Role_id_tenantId_key"
ON "Role"("id", "tenantId");

-- Move role assignment ownership from global User to TenantMembership.
ALTER TABLE "UserRole"
ADD COLUMN "tenantId" UUID,
ADD COLUMN "membershipId" UUID;

UPDATE "UserRole" ur
SET
  "tenantId" = r."tenantId",
  "membershipId" = tm."id"
FROM "Role" r
JOIN "TenantMembership" tm
  ON tm."tenantId" = r."tenantId"
WHERE r."id" = ur."roleId"
  AND tm."userId" = ur."userId";

ALTER TABLE "UserRole"
ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "membershipId" SET NOT NULL;

ALTER TABLE "UserRole"
DROP CONSTRAINT "UserRole_userId_fkey",
DROP CONSTRAINT "UserRole_roleId_fkey";

DROP INDEX "UserRole_userId_idx";
DROP INDEX "UserRole_roleId_idx";
DROP INDEX "UserRole_userId_roleId_key";

ALTER TABLE "UserRole" DROP COLUMN "userId";
ALTER TABLE "UserRole" RENAME TO "MembershipRole";
ALTER TABLE "MembershipRole"
RENAME CONSTRAINT "UserRole_pkey" TO "MembershipRole_pkey";

CREATE UNIQUE INDEX "MembershipRole_membershipId_roleId_key"
ON "MembershipRole"("membershipId", "roleId");

CREATE INDEX "MembershipRole_tenantId_membershipId_idx"
ON "MembershipRole"("tenantId", "membershipId");

CREATE INDEX "MembershipRole_tenantId_roleId_idx"
ON "MembershipRole"("tenantId", "roleId");

ALTER TABLE "MembershipRole"
ADD CONSTRAINT "MembershipRole_membershipId_tenantId_fkey"
FOREIGN KEY ("membershipId", "tenantId")
REFERENCES "TenantMembership"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipRole"
ADD CONSTRAINT "MembershipRole_roleId_tenantId_fkey"
FOREIGN KEY ("roleId", "tenantId")
REFERENCES "Role"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace tenant-owned permission rows with one immutable global catalogue.
CREATE TABLE "PermissionCatalog" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(240) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PermissionCatalog_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PermissionCatalog" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:authorization.roles.read')::uuid,
    'authorization.roles.read',
    'Read roles in the active tenant'
  ),
  (
    md5('medsphere:permission:authorization.roles.create')::uuid,
    'authorization.roles.create',
    'Create custom roles in the active tenant'
  ),
  (
    md5('medsphere:permission:authorization.roles.update')::uuid,
    'authorization.roles.update',
    'Update custom roles in the active tenant'
  ),
  (
    md5('medsphere:permission:authorization.roles.delete')::uuid,
    'authorization.roles.delete',
    'Soft-delete custom roles in the active tenant'
  ),
  (
    md5('medsphere:permission:authorization.permissions.read')::uuid,
    'authorization.permissions.read',
    'Read the accepted permission catalogue'
  ),
  (
    md5('medsphere:permission:authorization.assignments.read')::uuid,
    'authorization.assignments.read',
    'Read membership role assignments in the active tenant'
  ),
  (
    md5('medsphere:permission:authorization.assignments.manage')::uuid,
    'authorization.assignments.manage',
    'Add or remove membership role assignments in the active tenant'
  ),
  (
    md5('medsphere:permission:audit.events.read')::uuid,
    'audit.events.read',
    'Read audit events in the active tenant'
  );

CREATE UNIQUE INDEX "PermissionCatalog_name_key"
ON "PermissionCatalog"("name");

ALTER TABLE "RolePermission"
ADD COLUMN "tenantId" UUID,
ADD COLUMN "catalogPermissionId" UUID;

UPDATE "RolePermission" rp
SET
  "tenantId" = r."tenantId",
  "catalogPermissionId" = pc."id"
FROM "Role" r, "Permission" p, "PermissionCatalog" pc
WHERE r."id" = rp."roleId"
  AND p."id" = rp."permissionId"
  AND pc."name" = p."name";

ALTER TABLE "RolePermission"
ALTER COLUMN "tenantId" SET NOT NULL,
ALTER COLUMN "catalogPermissionId" SET NOT NULL;

ALTER TABLE "RolePermission"
DROP CONSTRAINT "RolePermission_roleId_fkey",
DROP CONSTRAINT "RolePermission_permissionId_fkey";

DROP INDEX "RolePermission_roleId_idx";
DROP INDEX "RolePermission_permissionId_idx";
DROP INDEX "RolePermission_roleId_permissionId_key";

ALTER TABLE "RolePermission" DROP COLUMN "permissionId";
DROP TABLE "Permission";

ALTER TABLE "PermissionCatalog" RENAME TO "Permission";
ALTER TABLE "Permission"
RENAME CONSTRAINT "PermissionCatalog_pkey" TO "Permission_pkey";
ALTER INDEX "PermissionCatalog_name_key" RENAME TO "Permission_name_key";

ALTER TABLE "RolePermission"
RENAME COLUMN "catalogPermissionId" TO "permissionId";

CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key"
ON "RolePermission"("roleId", "permissionId");

CREATE INDEX "RolePermission_tenantId_roleId_idx"
ON "RolePermission"("tenantId", "roleId");

CREATE INDEX "RolePermission_permissionId_idx"
ON "RolePermission"("permissionId");

ALTER TABLE "RolePermission"
ADD CONSTRAINT "RolePermission_roleId_tenantId_fkey"
FOREIGN KEY ("roleId", "tenantId")
REFERENCES "Role"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission"
ADD CONSTRAINT "RolePermission_permissionId_fkey"
FOREIGN KEY ("permissionId") REFERENCES "Permission"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create the only accepted built-in role independently inside every tenant.
INSERT INTO "Role" (
  "id",
  "tenantId",
  "name",
  "description",
  "type",
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt"
)
SELECT
  md5(t."id"::text || ':tenant-administrator')::uuid,
  t."id",
  'TENANT_ADMINISTRATOR',
  'Built-in tenant authorization administrator',
  'SYSTEM'::"RoleType",
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1
  FROM "Role" r
  WHERE r."tenantId" = t."id"
    AND r."name" = 'TENANT_ADMINISTRATOR'
);

-- Built-in role permissions are migration-owned and replaced with the exact
-- S0.4 catalogue.
DELETE FROM "RolePermission" rp
USING "Role" r
WHERE r."id" = rp."roleId"
  AND r."name" = 'TENANT_ADMINISTRATOR'
  AND r."type" = 'SYSTEM';

INSERT INTO "RolePermission" (
  "id",
  "tenantId",
  "roleId",
  "permissionId",
  "createdAt"
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
  AND r."type" = 'SYSTEM';

-- Replace the unaccepted mutable audit prototype with typed append-only events.
DROP TABLE "AuditLog";
DROP TYPE "AuditAction";

CREATE TYPE "AuditActorType" AS ENUM (
  'TENANT_USER',
  'PLATFORM_USER',
  'SYSTEM'
);

CREATE TYPE "AuditScope" AS ENUM (
  'TENANT',
  'PLATFORM'
);

CREATE TYPE "AuditOutcome" AS ENUM (
  'SUCCEEDED',
  'DENIED',
  'FAILED'
);

CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL,
  "scope" "AuditScope" NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  "outcome" "AuditOutcome" NOT NULL,
  "tenantId" UUID,
  "actorMembershipId" UUID,
  "platformActorUserId" UUID,
  "eventType" VARCHAR(120) NOT NULL,
  "resourceType" VARCHAR(80),
  "resourceId" VARCHAR(120),
  "requestId" VARCHAR(120),
  "ipAddress" INET,
  "userAgent" VARCHAR(512),
  "metadata" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_actor_scope_check" CHECK (
    (
      "scope" = 'TENANT'
      AND "actorType" = 'TENANT_USER'
      AND "tenantId" IS NOT NULL
      AND "actorMembershipId" IS NOT NULL
      AND "platformActorUserId" IS NULL
    )
    OR
    (
      "scope" = 'PLATFORM'
      AND "actorType" = 'PLATFORM_USER'
      AND "tenantId" IS NULL
      AND "actorMembershipId" IS NULL
      AND "platformActorUserId" IS NOT NULL
    )
    OR
    (
      "scope" = 'PLATFORM'
      AND "actorType" = 'SYSTEM'
      AND "tenantId" IS NULL
      AND "actorMembershipId" IS NULL
      AND "platformActorUserId" IS NULL
    )
  ),
  CONSTRAINT "AuditEvent_resource_pair_check" CHECK (
    ("resourceType" IS NULL AND "resourceId" IS NULL)
    OR ("resourceType" IS NOT NULL AND "resourceId" IS NOT NULL)
  ),
  CONSTRAINT "AuditEvent_metadata_object_check" CHECK (
    jsonb_typeof("metadata") = 'object'
  ),
  CONSTRAINT "AuditEvent_metadata_size_check" CHECK (
    octet_length("metadata"::text) <= 16384
  ),
  CONSTRAINT "AuditEvent_event_type_check" CHECK (
    "eventType" IN (
      'authorization.role.created',
      'authorization.role.updated',
      'authorization.role.deleted',
      'authorization.assignment.added',
      'authorization.assignment.removed',
      'authorization.permission.denied',
      'authentication.session.created',
      'authentication.session.refresh.succeeded',
      'authentication.session.refresh.failed',
      'authentication.session.refresh.replayed',
      'authentication.session.logout.succeeded',
      'authentication.sessions.logout.succeeded'
    )
  )
);

CREATE INDEX "AuditEvent_tenantId_occurredAt_id_idx"
ON "AuditEvent"("tenantId", "occurredAt" DESC, "id" DESC);

CREATE INDEX "AuditEvent_tenantId_eventType_occurredAt_idx"
ON "AuditEvent"("tenantId", "eventType", "occurredAt" DESC);

CREATE INDEX "AuditEvent_actorMembershipId_occurredAt_idx"
ON "AuditEvent"("actorMembershipId", "occurredAt" DESC);

CREATE INDEX "AuditEvent_platformActorUserId_occurredAt_idx"
ON "AuditEvent"("platformActorUserId", "occurredAt" DESC);

CREATE INDEX "AuditEvent_resourceType_resourceId_occurredAt_idx"
ON "AuditEvent"("resourceType", "resourceId", "occurredAt" DESC);

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_actorMembershipId_tenantId_fkey"
FOREIGN KEY ("actorMembershipId", "tenantId")
REFERENCES "TenantMembership"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditEvent"
ADD CONSTRAINT "AuditEvent_platformActorUserId_fkey"
FOREIGN KEY ("platformActorUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent is append-only';
END;
$$;

CREATE TRIGGER "AuditEvent_reject_update_delete"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW
EXECUTE FUNCTION reject_audit_event_mutation();
