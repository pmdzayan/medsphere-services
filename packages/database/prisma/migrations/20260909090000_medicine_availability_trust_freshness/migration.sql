-- Task 0025: medicine availability trust & inventory freshness foundation.
--
-- Appends closed-catalogue physical-stock observation evidence for eligible
-- inventory commands. The accepted Batch model remains the ONLY quantity
-- authority; this table records only WHAT qualified as a real physical-stock
-- observation and WHEN it occurred, so freshness/trust interpretation has a
-- trustworthy basis.
--
-- The AvailabilityEvidenceSource catalogue is strictly BATCH-BOUND:
-- MANUAL_PHYSICAL_COUNT and POS_SYNC are valid only when the external
-- observation has been normalized to a real AIM batch. PHARMACIST_CONFIRMATION
-- is deliberately NOT in this catalogue because a pharmacist confirmation is
-- temporary provider/product availability evidence that must not require an
-- AIM batch; it is reserved for a future provider/product-level evidence model
-- combined by the canonical trust layer.
--
-- Historical inventory deliberately receives NO observation rows in this
-- migration. Existing batches therefore stay UNKNOWN/not-fresh until a real
-- qualifying physical-stock observation establishes one in the future. In Task
-- 0025 the only live producer is new batch receipt; generic adjustment,
-- transfer, and damage commands do not reset physical-observation freshness. Nothing in this migration fabricates freshness.

CREATE TYPE "AvailabilityEvidenceSource" AS ENUM (
  'AIM_MANAGED_INVENTORY',
  'MANUAL_PHYSICAL_COUNT',
  'POS_SYNC'
);

CREATE TABLE "BatchStockObservation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "inventoryId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "source" "AvailabilityEvidenceSource" NOT NULL,
  "observedOnHandQuantity" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "movementId" UUID,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchStockObservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BatchStockObservation_values_check" CHECK (
    "observedOnHandQuantity" >= 0
    AND length("idempotencyKey") BETWEEN 1 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
  )
);

CREATE UNIQUE INDEX "BatchStockObservation_tenantId_idempotencyKey_key"
  ON "BatchStockObservation"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "BatchStockObservation_batchId_occurredAt_source_key"
  ON "BatchStockObservation"("batchId", "occurredAt", "source");
CREATE INDEX "BatchStockObservation_batch_occurredAt_idx"
  ON "BatchStockObservation"("batchId", "occurredAt" DESC, "id" DESC);
CREATE INDEX "BatchStockObservation_tenant_provider_product_occurredAt_idx"
  ON "BatchStockObservation"("tenantId", "providerId", "productId", "occurredAt" DESC, "id" DESC);
CREATE INDEX "BatchStockObservation_tenant_inventory_occurredAt_idx"
  ON "BatchStockObservation"("tenantId", "inventoryId", "occurredAt" DESC, "id" DESC);

ALTER TABLE "BatchStockObservation" ADD CONSTRAINT "BatchStockObservation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchStockObservation" ADD CONSTRAINT "BatchStockObservation_inventory_scope_fkey"
  FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId")
  REFERENCES "Inventory"("id", "tenantId", "providerId", "productId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchStockObservation" ADD CONSTRAINT "BatchStockObservation_batch_scope_fkey"
  FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId")
  REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchStockObservation" ADD CONSTRAINT "BatchStockObservation_provider_scope_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchStockObservation" ADD CONSTRAINT "BatchStockObservation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchStockObservation" ADD CONSTRAINT "BatchStockObservation_movement_scope_fkey"
  FOREIGN KEY ("movementId", "tenantId", "inventoryId", "batchId", "providerId", "productId")
  REFERENCES "StockMovement"("id", "tenantId", "inventoryId", "batchId", "providerId", "productId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Evidence rows are immutable: current evidence is versioning by monotonic
-- occurredAt ordering, never in-place mutation. Historical trust evidence
-- must never be editable or deletable after the fact.
CREATE FUNCTION "reject_batch_stock_observation_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'BatchStockObservation is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BatchStockObservation_append_only"
  BEFORE UPDATE OR DELETE ON "BatchStockObservation"
  FOR EACH ROW EXECUTE FUNCTION "reject_batch_stock_observation_mutation"();