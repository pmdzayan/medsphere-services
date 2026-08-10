-- G3.10: truthful physical batch-expiry reconciliation without disposal.

CREATE TABLE "BatchExpiryRecord" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "inventoryId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "expiryDate" TIMESTAMP(3) NOT NULL,
  "onHandQuantity" INTEGER NOT NULL,
  "resultingBatchVersion" INTEGER NOT NULL,
  "reconciledAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchExpiryRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BatchExpiryRecord_values_check" CHECK (
    "onHandQuantity" >= 0 AND "resultingBatchVersion" > 0
    AND "createdAt" = "reconciledAt"
  )
);

CREATE UNIQUE INDEX "BatchExpiryRecord_batchId_key"
  ON "BatchExpiryRecord"("batchId");
CREATE UNIQUE INDEX "BatchExpiryRecord_batchId_tenantId_inventoryId_provider_key"
  ON "BatchExpiryRecord"("batchId", "tenantId", "inventoryId", "providerId", "productId", "expiryDate");
CREATE UNIQUE INDEX "Batch_id_tenantId_inventoryId_providerId_product_expiry_key"
  ON "Batch"("id", "tenantId", "inventoryId", "providerId", "productId", "expiryDate");
CREATE INDEX "BatchExpiryRecord_tenantId_reconciledAt_id_idx"
  ON "BatchExpiryRecord"("tenantId", "reconciledAt" DESC, "id" DESC);
CREATE INDEX "BatchExpiryRecord_tenantId_providerId_productId_reconcil_idx"
  ON "BatchExpiryRecord"("tenantId", "providerId", "productId", "reconciledAt" DESC);
CREATE INDEX "Batch_due_expiry_idx"
  ON "Batch"("expiryDate", "tenantId", "id")
  WHERE "deletedAt" IS NULL AND "status" = 'ACTIVE';

ALTER TABLE "BatchExpiryRecord" ADD CONSTRAINT "BatchExpiryRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchExpiryRecord" ADD CONSTRAINT "BatchExpiryRecord_inventory_scope_fkey"
  FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId")
  REFERENCES "Inventory"("id", "tenantId", "providerId", "productId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchExpiryRecord" ADD CONSTRAINT "BatchExpiryRecord_provider_scope_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchExpiryRecord" ADD CONSTRAINT "BatchExpiryRecord_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchExpiryRecord" ADD CONSTRAINT "BatchExpiryRecord_batch_scope_fkey"
  FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId", "expiryDate")
  REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId", "expiryDate")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_batch_expiry_record_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BatchExpiryRecord is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BatchExpiryRecord_append_only"
  BEFORE UPDATE OR DELETE ON "BatchExpiryRecord"
  FOR EACH ROW EXECUTE FUNCTION "reject_batch_expiry_record_mutation"();

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
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired'
  )
);

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_batch_expiry_metadata_check" CHECK (
  "eventType" <> 'inventory.batch.expired' OR (
    "scope" = 'TENANT' AND "actorType" = 'SYSTEM'
    AND "tenantId" IS NOT NULL AND "resourceType" = 'Batch'
    AND "resourceId" IS NOT NULL AND "resourceId"::uuid IS NOT NULL
    AND "actorMembershipId" IS NULL AND "platformActorUserId" IS NULL
    AND jsonb_typeof("metadata") = 'object'
    AND "metadata" ?& ARRAY[
      'productId', 'onHandQuantity', 'affectedReservations', 'releasedUnits',
      'resultingVersion'
    ]
    AND "metadata" - ARRAY[
      'productId', 'onHandQuantity', 'affectedReservations', 'releasedUnits',
      'resultingVersion'
    ] = '{}'::jsonb
    AND jsonb_typeof("metadata"->'productId') = 'string'
    AND ("metadata"->>'productId')::uuid IS NOT NULL
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

ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_reservation_expiry_cause_check" CHECK (
  "eventType" <> 'inventory.reservation.expired'
  OR NOT ("metadata" ? 'cause')
  OR (
    "scope" = 'TENANT' AND "actorType" = 'SYSTEM'
    AND "metadata"->>'cause' = 'BATCH_EXPIRY'
  )
);
