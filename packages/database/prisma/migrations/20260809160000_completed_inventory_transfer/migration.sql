ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_id_tenantId_inventoryId_batchId_providerId_pr_key" UNIQUE ("id", "tenantId", "inventoryId", "batchId", "providerId", "productId");

CREATE TABLE "InventoryTransfer" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL,
  "sourceProviderId" UUID NOT NULL, "destinationProviderId" UUID NOT NULL,
  "productId" UUID NOT NULL, "sourceInventoryId" UUID NOT NULL,
  "destinationInventoryId" UUID NOT NULL, "sourceBatchId" UUID NOT NULL,
  "destinationBatchId" UUID NOT NULL, "quantity" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL, "commandHash" VARCHAR(64) NOT NULL,
  "sourceOnHandAfter" INTEGER NOT NULL, "destinationOnHandAfter" INTEGER NOT NULL,
  "sourceBatchVersion" INTEGER NOT NULL, "destinationBatchVersion" INTEGER NOT NULL,
  "sourceMovementId" UUID NOT NULL, "destinationMovementId" UUID NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryTransfer_values_check" CHECK (
    "sourceProviderId" <> "destinationProviderId" AND "quantity" > 0
    AND length("idempotencyKey") BETWEEN 1 AND 120
    AND "commandHash" ~ '^[0-9a-f]{64}$'
    AND "sourceOnHandAfter" >= 0 AND "destinationOnHandAfter" >= 0
    AND "sourceBatchVersion" > 0 AND "destinationBatchVersion" > 0
  )
);
CREATE UNIQUE INDEX "InventoryTransfer_tenantId_idempotencyKey_key" ON "InventoryTransfer"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "InventoryTransfer_sourceMovementId_key" ON "InventoryTransfer"("sourceMovementId");
CREATE UNIQUE INDEX "InventoryTransfer_destinationMovementId_key" ON "InventoryTransfer"("destinationMovementId");
CREATE INDEX "InventoryTransfer_tenantId_sourceProviderId_completedAt_id_idx" ON "InventoryTransfer"("tenantId", "sourceProviderId", "completedAt" DESC, "id" DESC);
CREATE INDEX "InventoryTransfer_tenantId_destinationProviderId_completedA_idx" ON "InventoryTransfer"("tenantId", "destinationProviderId", "completedAt" DESC, "id" DESC);
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_sourceProviderId_tenantId_fkey" FOREIGN KEY ("sourceProviderId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationProviderId_tenantId_fkey" FOREIGN KEY ("destinationProviderId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_sourceInventoryId_tenantId_sourceProvide_fkey" FOREIGN KEY ("sourceInventoryId", "tenantId", "sourceProviderId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationInventoryId_tenantId_destinat_fkey" FOREIGN KEY ("destinationInventoryId", "tenantId", "destinationProviderId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_sourceBatchId_tenantId_sourceInventoryId_fkey" FOREIGN KEY ("sourceBatchId", "tenantId", "sourceInventoryId", "sourceProviderId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationBatchId_tenantId_destinationI_fkey" FOREIGN KEY ("destinationBatchId", "tenantId", "destinationInventoryId", "destinationProviderId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_sourceMovementId_tenantId_sourceInventor_fkey" FOREIGN KEY ("sourceMovementId", "tenantId", "sourceInventoryId", "sourceBatchId", "sourceProviderId", "productId") REFERENCES "StockMovement"("id", "tenantId", "inventoryId", "batchId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_destinationMovementId_tenantId_destinati_fkey" FOREIGN KEY ("destinationMovementId", "tenantId", "destinationInventoryId", "destinationBatchId", "destinationProviderId", "productId") REFERENCES "StockMovement"("id", "tenantId", "inventoryId", "batchId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "reject_inventory_transfer_mutation"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'InventoryTransfer is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "InventoryTransfer_append_only" BEFORE UPDATE OR DELETE ON "InventoryTransfer" FOR EACH ROW EXECUTE FUNCTION "reject_inventory_transfer_mutation"();

ALTER TABLE "Permission" DISABLE TRIGGER "Permission_reject_insert_update_delete";
INSERT INTO "Permission" ("id", "name", "description") VALUES (md5('medsphere:permission:inventory.stock.transfer')::uuid, 'inventory.stock.transfer', 'Record an atomic completed stock transfer between two assigned providers');
ALTER TABLE "Permission" ENABLE TRIGGER "Permission_reject_insert_update_delete";
INSERT INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT md5(r."id"::text || ':' || p."id"::text)::uuid, r."tenantId", r."id", p."id", CURRENT_TIMESTAMP
FROM "Role" r CROSS JOIN "Permission" p WHERE r."name" = 'TENANT_ADMINISTRATOR' AND r."type" = 'SYSTEM' AND r."deletedAt" IS NULL AND p."name" = 'inventory.stock.transfer';
