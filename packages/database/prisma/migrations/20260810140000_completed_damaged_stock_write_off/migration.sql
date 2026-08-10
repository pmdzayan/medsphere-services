-- G3.9: atomic recording of an already confirmed damaged-stock write-off.

ALTER TABLE "StockMovement"
ADD COLUMN "resultingBatchVersion" INTEGER;

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_resulting_batch_version_check"
CHECK ("resultingBatchVersion" IS NULL OR "resultingBatchVersion" > 0);

-- Scope the stronger contract only to new G3.9 movements so accepted legacy
-- DAMAGED movements remain valid.
ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_damage_contract_check"
CHECK (
  "referenceType" IS DISTINCT FROM 'inventory.stock.damage'
  OR (
    "type" = 'DAMAGED'
    AND "delta" < 0
    AND "referenceId" = "batchId"::text
    AND "resultingBatchVersion" IS NOT NULL
    AND "commandHash" IS NOT NULL
    AND "commandHash" ~ '^[0-9a-f]{64}$'
    AND "actorType" = 'TENANT_USER'
    AND "actorMembershipId" IS NOT NULL
    AND length("idempotencyKey") BETWEEN 1 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
    AND "reason" IS NOT NULL
    AND length("reason") BETWEEN 1 AND 500
    AND "reason" = btrim("reason")
  )
);

ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES (
  md5('medsphere:permission:inventory.stock.damage')::uuid,
  'inventory.stock.damage',
  'Record an already confirmed damaged-stock write-off for an assigned provider batch'
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
  AND p."name" = 'inventory.stock.damage';

ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_event_type_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_event_type_check" CHECK (
  "eventType" IN (
    'authorization.role.created', 'authorization.role.updated',
    'authorization.role.deleted', 'authorization.assignment.added',
    'authorization.assignment.removed', 'authorization.provider-access.added',
    'authorization.provider-access.removed', 'authorization.permission.denied',
    'authentication.session.created', 'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed', 'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded', 'authentication.sessions.logout.succeeded',
    'inventory.listing.configured', 'inventory.batch.received',
    'inventory.stock.adjusted', 'inventory.stock.transferred',
    'inventory.stock.damaged',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired'
  )
);
