-- G3.2 migration-owned permissions for the first accepted inventory commands.

ALTER TABLE "StockMovement"
ADD COLUMN "commandHash" VARCHAR(64);

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_command_hash_check"
CHECK ("commandHash" IS NULL OR "commandHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:inventory.listings.manage')::uuid,
    'inventory.listings.manage',
    'Create and version-update inventory listings for an assigned provider'
  ),
  (
    md5('medsphere:permission:inventory.stock.receive')::uuid,
    'inventory.stock.receive',
    'Receive a new stock batch for an assigned provider'
  ),
  (
    md5('medsphere:permission:inventory.stock.adjust')::uuid,
    'inventory.stock.adjust',
    'Record a versioned stock-count adjustment for an assigned provider'
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
    'inventory.listings.manage',
    'inventory.stock.receive',
    'inventory.stock.adjust'
  );
