-- G3.11: one-way manual batch quarantine without physical stock removal.

ALTER TYPE "BatchStatus" ADD VALUE IF NOT EXISTS 'QUARANTINED';

CREATE TYPE "BatchQuarantineReason" AS ENUM (
  'QUALITY_SUSPECT',
  'TEMPERATURE_EXCURSION',
  'PACKAGING_COMPROMISED',
  'STORAGE_DEVIATION'
);

CREATE TABLE "BatchQuarantineRecord" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "inventoryId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "reasonCode" "BatchQuarantineReason" NOT NULL,
  "onHandQuantity" INTEGER NOT NULL,
  "affectedReservationCount" INTEGER NOT NULL,
  "releasedUnitCount" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "commandHash" VARCHAR(64) NOT NULL,
  "resultingBatchVersion" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchQuarantineRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BatchQuarantineRecord_values_check" CHECK (
    "onHandQuantity" >= 0
    AND "affectedReservationCount" >= 0
    AND "releasedUnitCount" >= 0
    AND "resultingBatchVersion" > 0
    AND length("idempotencyKey") BETWEEN 8 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
    AND "commandHash" ~ '^[0-9a-f]{64}$'
    AND "createdAt" = "occurredAt"
  )
);

CREATE UNIQUE INDEX "BatchQuarantineRecord_batchId_key"
  ON "BatchQuarantineRecord"("batchId");
CREATE UNIQUE INDEX "BatchQuarantineRecord_tenantId_idempotencyKey_key"
  ON "BatchQuarantineRecord"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "BatchQuarantineRecord_batch_scope_key"
  ON "BatchQuarantineRecord"("batchId", "tenantId", "inventoryId", "providerId", "productId");
CREATE INDEX "BatchQuarantineRecord_tenant_provider_occurred_idx"
  ON "BatchQuarantineRecord"("tenantId", "providerId", "occurredAt" DESC, "id" DESC);
CREATE INDEX "BatchQuarantineRecord_actor_occurred_idx"
  ON "BatchQuarantineRecord"("actorMembershipId", "occurredAt" DESC, "id" DESC);

ALTER TABLE "BatchQuarantineRecord" ADD CONSTRAINT "BatchQuarantineRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchQuarantineRecord" ADD CONSTRAINT "BatchQuarantineRecord_inventory_scope_fkey"
  FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId")
  REFERENCES "Inventory"("id", "tenantId", "providerId", "productId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchQuarantineRecord" ADD CONSTRAINT "BatchQuarantineRecord_provider_scope_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchQuarantineRecord" ADD CONSTRAINT "BatchQuarantineRecord_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchQuarantineRecord" ADD CONSTRAINT "BatchQuarantineRecord_batch_scope_fkey"
  FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId")
  REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchQuarantineRecord" ADD CONSTRAINT "BatchQuarantineRecord_actor_scope_fkey"
  FOREIGN KEY ("actorMembershipId", "tenantId")
  REFERENCES "TenantMembership"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_batch_quarantine_record_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BatchQuarantineRecord is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BatchQuarantineRecord_append_only"
  BEFORE UPDATE OR DELETE ON "BatchQuarantineRecord"
  FOR EACH ROW EXECUTE FUNCTION "reject_batch_quarantine_record_mutation"();

ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES (
  md5('medsphere:permission:inventory.batch.quarantine')::uuid,
  'inventory.batch.quarantine',
  'Quarantine an active batch for an assigned provider without removing physical stock'
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
  AND p."name" = 'inventory.batch.quarantine';

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
    'inventory.stock.damaged', 'inventory.batch.expired',
    'inventory.batch.quarantined',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired'
  )
);

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_batch_quarantine_metadata_check" CHECK (
  "eventType" <> 'inventory.batch.quarantined' OR (
    "scope" = 'TENANT' AND "actorType" = 'TENANT_USER'
    AND "tenantId" IS NOT NULL AND "actorMembershipId" IS NOT NULL
    AND "platformActorUserId" IS NULL
    AND "resourceType" = 'Batch' AND "resourceId" IS NOT NULL
    AND jsonb_typeof("metadata") = 'object'
    AND "metadata" ?& ARRAY[
      'productId', 'reasonCode', 'onHandQuantity', 'affectedReservations',
      'releasedUnits', 'resultingVersion'
    ]
    AND "metadata" - ARRAY[
      'productId', 'reasonCode', 'onHandQuantity', 'affectedReservations',
      'releasedUnits', 'resultingVersion'
    ] = '{}'::jsonb
    AND jsonb_typeof("metadata"->'productId') = 'string'
    AND ("metadata"->>'productId')::uuid IS NOT NULL
    AND jsonb_typeof("metadata"->'reasonCode') = 'string'
    AND "metadata"->>'reasonCode' IN (
      'QUALITY_SUSPECT', 'TEMPERATURE_EXCURSION',
      'PACKAGING_COMPROMISED', 'STORAGE_DEVIATION'
    )
    AND jsonb_typeof("metadata"->'onHandQuantity') = 'number'
    AND ("metadata"->>'onHandQuantity')::numeric >= 0
    AND floor(("metadata"->>'onHandQuantity')::numeric) = ("metadata"->>'onHandQuantity')::numeric
    AND jsonb_typeof("metadata"->'affectedReservations') = 'number'
    AND ("metadata"->>'affectedReservations')::numeric >= 0
    AND floor(("metadata"->>'affectedReservations')::numeric) = ("metadata"->>'affectedReservations')::numeric
    AND jsonb_typeof("metadata"->'releasedUnits') = 'number'
    AND ("metadata"->>'releasedUnits')::numeric >= 0
    AND floor(("metadata"->>'releasedUnits')::numeric) = ("metadata"->>'releasedUnits')::numeric
    AND jsonb_typeof("metadata"->'resultingVersion') = 'number'
    AND ("metadata"->>'resultingVersion')::numeric > 0
    AND floor(("metadata"->>'resultingVersion')::numeric) = ("metadata"->>'resultingVersion')::numeric
  )
);

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_reservation_quarantine_cause_check" CHECK (
  "eventType" <> 'inventory.reservation.cancelled'
  OR NOT ("metadata" ? 'cause')
  OR (
    "scope" = 'TENANT' AND "actorType" = 'SYSTEM'
    AND "actorMembershipId" IS NULL AND "platformActorUserId" IS NULL
    AND "metadata"->>'cause' = 'BATCH_QUARANTINE'
  )
);
