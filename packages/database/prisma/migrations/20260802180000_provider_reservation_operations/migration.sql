-- G3.3 migration-owned permissions for assigned-provider reservation operations.

ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:inventory.reservations.read')::uuid,
    'inventory.reservations.read',
    'Read operational medicine reservations for an assigned provider'
  ),
  (
    md5('medsphere:permission:inventory.reservations.manage')::uuid,
    'inventory.reservations.manage',
    'Transition operational medicine reservations for an assigned provider'
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
  AND p."name" IN (
    'inventory.reservations.read',
    'inventory.reservations.manage'
  );
