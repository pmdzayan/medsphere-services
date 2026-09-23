-- CreateEnum
CREATE TYPE "PharmacyReturnReason" AS ENUM ('CUSTOMER_REQUEST', 'WRONG_ITEM', 'DAMAGED_PACKAGE', 'PRODUCT_DEFECT', 'OTHER');

-- CreateEnum
CREATE TYPE "BatchRecallReason" AS ENUM ('MANUFACTURER_RECALL', 'REGULATORY_RECALL', 'QUALITY_ALERT', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryExceptionAction" AS ENUM ('QUARANTINE_RELEASE', 'DISPOSAL', 'SUPPLIER_RETURN');

-- CreateEnum
CREATE TYPE "InventoryExceptionDecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PharmacySaleReturn" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reasonCode" "PharmacyReturnReason" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "refundMethod" "PharmacyPaymentMethod" NOT NULL,
    "refundExternalReference" VARCHAR(80),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "taxableTotal" DECIMAL(12,2) NOT NULL,
    "cgstTotal" DECIMAL(12,2) NOT NULL,
    "sgstTotal" DECIMAL(12,2) NOT NULL,
    "igstTotal" DECIMAL(12,2) NOT NULL,
    "cessTotal" DECIMAL(12,2) NOT NULL,
    "refundTotal" DECIMAL(12,2) NOT NULL,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySaleReturnLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "saleLineId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "taxableValue" DECIMAL(12,2) NOT NULL,
    "cgstAmount" DECIMAL(12,2) NOT NULL,
    "sgstAmount" DECIMAL(12,2) NOT NULL,
    "igstAmount" DECIMAL(12,2) NOT NULL,
    "cessAmount" DECIMAL(12,2) NOT NULL,
    "refundTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySaleReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySaleReturnAllocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "returnId" UUID NOT NULL,
    "returnLineId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "saleLineId" UUID NOT NULL,
    "saleAllocationId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "stockMovementId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySaleReturnAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchRecallRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reasonCode" "BatchRecallReason" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "onHandQuantity" INTEGER NOT NULL,
    "affectedReservationCount" INTEGER NOT NULL,
    "releasedUnitCount" INTEGER NOT NULL,
    "resultingBatchVersion" INTEGER NOT NULL,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatchRecallRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryExceptionRequest" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "requestedByMembershipId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "action" "InventoryExceptionAction" NOT NULL,
    "quantity" INTEGER,
    "reason" VARCHAR(500) NOT NULL,
    "requestedBatchVersion" INTEGER NOT NULL,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryExceptionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryExceptionDecision" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "decidedByMembershipId" UUID NOT NULL,
    "decidedByUserId" UUID NOT NULL,
    "outcome" "InventoryExceptionDecisionOutcome" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "movementId" UUID,
    "onHandBefore" INTEGER,
    "onHandAfter" INTEGER,
    "resultingBatchVersion" INTEGER,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryExceptionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PharmacySaleReturn_tenantId_providerId_occurredAt_id_idx" ON "PharmacySaleReturn"("tenantId", "providerId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "PharmacySaleReturn_saleId_occurredAt_id_idx" ON "PharmacySaleReturn"("saleId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleReturn_tenantId_idempotencyKey_key" ON "PharmacySaleReturn"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleReturn_id_tenantId_providerId_key" ON "PharmacySaleReturn"("id", "tenantId", "providerId");

-- CreateIndex
CREATE INDEX "PharmacySaleReturnLine_tenantId_providerId_saleId_idx" ON "PharmacySaleReturnLine"("tenantId", "providerId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleReturnLine_returnId_saleLineId_key" ON "PharmacySaleReturnLine"("returnId", "saleLineId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleReturnLine_scope_key" ON "PharmacySaleReturnLine"("id", "tenantId", "providerId", "saleId", "saleLineId", "inventoryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleReturnAllocation_stockMovementId_key" ON "PharmacySaleReturnAllocation"("stockMovementId");

-- CreateIndex
CREATE INDEX "PharmacySaleReturnAllocation_tenantId_providerId_batchId_idx" ON "PharmacySaleReturnAllocation"("tenantId", "providerId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleReturnAllocation_returnLineId_saleAllocationId_key" ON "PharmacySaleReturnAllocation"("returnLineId", "saleAllocationId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleReturnAllocation_movement_scope_key" ON "PharmacySaleReturnAllocation"("stockMovementId", "tenantId", "inventoryId", "batchId", "providerId", "productId");

-- CreateIndex
CREATE INDEX "BatchRecallRecord_tenantId_providerId_occurredAt_id_idx" ON "BatchRecallRecord"("tenantId", "providerId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BatchRecallRecord_batchId_key" ON "BatchRecallRecord"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchRecallRecord_tenantId_idempotencyKey_key" ON "BatchRecallRecord"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryExceptionRequest_tenantId_providerId_requestedAt_i_idx" ON "InventoryExceptionRequest"("tenantId", "providerId", "requestedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryExceptionRequest_tenantId_idempotencyKey_key" ON "InventoryExceptionRequest"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryExceptionRequest_id_tenantId_providerId_batchId_key" ON "InventoryExceptionRequest"("id", "tenantId", "providerId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryExceptionDecision_requestId_key" ON "InventoryExceptionDecision"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryExceptionDecision_movementId_key" ON "InventoryExceptionDecision"("movementId");

-- CreateIndex
CREATE INDEX "InventoryExceptionDecision_tenantId_providerId_occurredAt_i_idx" ON "InventoryExceptionDecision"("tenantId", "providerId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryExceptionDecision_tenantId_idempotencyKey_key" ON "InventoryExceptionDecision"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryExceptionDecision_request_scope_key" ON "InventoryExceptionDecision"("requestId", "tenantId", "providerId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleAllocation_return_scope_key" ON "PharmacySaleAllocation"("id", "tenantId", "providerId", "saleId", "lineId", "inventoryId", "productId", "batchId");

-- AddForeignKey
ALTER TABLE "PharmacySaleReturn" ADD CONSTRAINT "PharmacySaleReturn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturn" ADD CONSTRAINT "PharmacySaleReturn_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturn" ADD CONSTRAINT "PharmacySaleReturn_saleId_tenantId_providerId_fkey" FOREIGN KEY ("saleId", "tenantId", "providerId") REFERENCES "PharmacySale"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturn" ADD CONSTRAINT "PharmacySaleReturn_actorMembership_actorUser_tenant_fkey" FOREIGN KEY ("actorMembershipId", "actorUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnLine" ADD CONSTRAINT "PharmacySaleReturnLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnLine" ADD CONSTRAINT "PharmacySaleReturnLine_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnLine" ADD CONSTRAINT "PharmacySaleReturnLine_returnId_tenantId_providerId_fkey" FOREIGN KEY ("returnId", "tenantId", "providerId") REFERENCES "PharmacySaleReturn"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnLine" ADD CONSTRAINT "PharmacySaleReturnLine_saleLineId_tenantId_saleId_provider_fkey" FOREIGN KEY ("saleLineId", "tenantId", "saleId", "providerId", "inventoryId", "productId") REFERENCES "PharmacySaleLine"("id", "tenantId", "saleId", "providerId", "inventoryId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnAllocation" ADD CONSTRAINT "PharmacySaleReturnAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnAllocation" ADD CONSTRAINT "PharmacySaleReturnAllocation_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnAllocation" ADD CONSTRAINT "PharmacySaleReturnAllocation_return_line_scope_fkey" FOREIGN KEY ("returnLineId", "tenantId", "providerId", "saleId", "saleLineId", "inventoryId", "productId") REFERENCES "PharmacySaleReturnLine"("id", "tenantId", "providerId", "saleId", "saleLineId", "inventoryId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnAllocation" ADD CONSTRAINT "PharmacySaleReturnAllocation_sale_allocation_scope_fkey" FOREIGN KEY ("saleAllocationId", "tenantId", "providerId", "saleId", "saleLineId", "inventoryId", "productId", "batchId") REFERENCES "PharmacySaleAllocation"("id", "tenantId", "providerId", "saleId", "lineId", "inventoryId", "productId", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnAllocation" ADD CONSTRAINT "PharmacySaleReturnAllocation_batchId_tenantId_inventoryId__fkey" FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleReturnAllocation" ADD CONSTRAINT "PharmacySaleReturnAllocation_stockMovementId_tenantId_inve_fkey" FOREIGN KEY ("stockMovementId", "tenantId", "inventoryId", "batchId", "providerId", "productId") REFERENCES "StockMovement"("id", "tenantId", "inventoryId", "batchId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecallRecord" ADD CONSTRAINT "BatchRecallRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecallRecord" ADD CONSTRAINT "BatchRecallRecord_inventoryId_tenantId_providerId_productI_fkey" FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecallRecord" ADD CONSTRAINT "BatchRecallRecord_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecallRecord" ADD CONSTRAINT "BatchRecallRecord_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecallRecord" ADD CONSTRAINT "BatchRecallRecord_batchId_tenantId_inventoryId_providerId__fkey" FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecallRecord" ADD CONSTRAINT "BatchRecallRecord_actorMembership_actorUser_tenant_fkey" FOREIGN KEY ("actorMembershipId", "actorUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionRequest" ADD CONSTRAINT "InventoryExceptionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionRequest" ADD CONSTRAINT "InventoryExceptionRequest_inventoryId_tenantId_providerId__fkey" FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionRequest" ADD CONSTRAINT "InventoryExceptionRequest_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionRequest" ADD CONSTRAINT "InventoryExceptionRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionRequest" ADD CONSTRAINT "InventoryExceptionRequest_batchId_tenantId_inventoryId_pro_fkey" FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionRequest" ADD CONSTRAINT "InventoryExceptionRequest_actorMembership_actorUser_tenant_fkey" FOREIGN KEY ("requestedByMembershipId", "requestedByUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionDecision" ADD CONSTRAINT "InventoryExceptionDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionDecision" ADD CONSTRAINT "InventoryExceptionDecision_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionDecision" ADD CONSTRAINT "InventoryExceptionDecision_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionDecision" ADD CONSTRAINT "InventoryExceptionDecision_requestId_tenantId_providerId_b_fkey" FOREIGN KEY ("requestId", "tenantId", "providerId", "batchId") REFERENCES "InventoryExceptionRequest"("id", "tenantId", "providerId", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionDecision" ADD CONSTRAINT "InventoryExceptionDecision_actor_scope_fkey" FOREIGN KEY ("decidedByMembershipId", "decidedByUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryExceptionDecision" ADD CONSTRAINT "InventoryExceptionDecision_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Task 0044 integrity hardening.
-- All evidence is append-only. Financial correction rows never rewrite the
-- immutable Task 0043 invoice/sale snapshots.
-- ---------------------------------------------------------------------------
ALTER TABLE "PharmacySaleReturn"
  ADD CONSTRAINT "PharmacySaleReturn_values_check" CHECK (
    "subtotal" >= 0
    AND "discountTotal" >= 0
    AND "taxableTotal" >= 0
    AND "cgstTotal" >= 0
    AND "sgstTotal" >= 0
    AND "igstTotal" >= 0
    AND "cessTotal" >= 0
    AND "refundTotal" > 0
    AND length("reason") BETWEEN 1 AND 500
    AND "reason" = btrim("reason")
    AND length("idempotencyKey") BETWEEN 8 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
    AND "commandHash" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "PharmacySaleReturnLine"
  ADD CONSTRAINT "PharmacySaleReturnLine_values_check" CHECK (
    "quantity" > 0
    AND "subtotal" >= 0
    AND "discountAmount" >= 0
    AND "taxableValue" >= 0
    AND "cgstAmount" >= 0
    AND "sgstAmount" >= 0
    AND "igstAmount" >= 0
    AND "cessAmount" >= 0
    AND "refundTotal" > 0
  );

ALTER TABLE "PharmacySaleReturnAllocation"
  ADD CONSTRAINT "PharmacySaleReturnAllocation_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "BatchRecallRecord"
  ADD CONSTRAINT "BatchRecallRecord_values_check" CHECK (
    "onHandQuantity" >= 0
    AND "affectedReservationCount" >= 0
    AND "releasedUnitCount" >= 0
    AND "resultingBatchVersion" > 0
    AND length("reason") BETWEEN 1 AND 500
    AND "reason" = btrim("reason")
    AND length("idempotencyKey") BETWEEN 8 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
    AND "commandHash" ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE "InventoryExceptionRequest"
  ADD CONSTRAINT "InventoryExceptionRequest_values_check" CHECK (
    "requestedBatchVersion" > 0
    AND length("reason") BETWEEN 1 AND 500
    AND "reason" = btrim("reason")
    AND length("idempotencyKey") BETWEEN 8 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
    AND "commandHash" ~ '^[0-9a-f]{64}$'
    AND (
      ("action" = 'QUARANTINE_RELEASE' AND "quantity" IS NULL)
      OR ("action" IN ('DISPOSAL', 'SUPPLIER_RETURN') AND "quantity" > 0)
    )
  );

ALTER TABLE "InventoryExceptionDecision"
  ADD CONSTRAINT "InventoryExceptionDecision_values_check" CHECK (
    length("reason") BETWEEN 1 AND 500
    AND "reason" = btrim("reason")
    AND length("idempotencyKey") BETWEEN 8 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
    AND "commandHash" ~ '^[0-9a-f]{64}$'
    AND (
      (
        "outcome" = 'REJECTED'
        AND "movementId" IS NULL
        AND "onHandBefore" IS NULL
        AND "onHandAfter" IS NULL
        AND "resultingBatchVersion" IS NULL
      )
      OR (
        "outcome" = 'APPROVED'
        AND "onHandBefore" IS NOT NULL
        AND "onHandAfter" IS NOT NULL
        AND "onHandBefore" >= 0
        AND "onHandAfter" >= 0
        AND "resultingBatchVersion" IS NOT NULL
        AND "resultingBatchVersion" > 0
      )
    )
  );

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_task_0044_contract_check" CHECK (
    "referenceType" NOT IN (
      'pharmacy.sale.return',
      'inventory.exception.disposal',
      'inventory.exception.supplier-return'
    )
    OR (
      "actorType" = 'TENANT_USER'
      AND "actorMembershipId" IS NOT NULL
      AND "resultingBatchVersion" IS NOT NULL
      AND "resultingBatchVersion" > 0
      AND "commandHash" IS NOT NULL
      AND "commandHash" ~ '^[0-9a-f]{64}$'
      AND length("idempotencyKey") BETWEEN 1 AND 120
      AND "idempotencyKey" = btrim("idempotencyKey")
      AND (
        (
          "referenceType" = 'pharmacy.sale.return'
          AND "type" = 'RETURN_IN'
          AND "delta" > 0
        )
        OR (
          "referenceType" = 'inventory.exception.disposal'
          AND "type" = 'DISPOSAL'
          AND "delta" < 0
        )
        OR (
          "referenceType" = 'inventory.exception.supplier-return'
          AND "type" = 'RETURN_OUT'
          AND "delta" < 0
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION reject_task_0044_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Task 0044 evidence rows are append-only';
END;
$$;

CREATE TRIGGER "PharmacySaleReturn_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySaleReturn"
FOR EACH ROW EXECUTE FUNCTION reject_task_0044_evidence_mutation();

CREATE TRIGGER "PharmacySaleReturnLine_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySaleReturnLine"
FOR EACH ROW EXECUTE FUNCTION reject_task_0044_evidence_mutation();

CREATE TRIGGER "PharmacySaleReturnAllocation_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySaleReturnAllocation"
FOR EACH ROW EXECUTE FUNCTION reject_task_0044_evidence_mutation();

CREATE TRIGGER "BatchRecallRecord_reject_update_delete"
BEFORE UPDATE OR DELETE ON "BatchRecallRecord"
FOR EACH ROW EXECUTE FUNCTION reject_task_0044_evidence_mutation();

CREATE TRIGGER "InventoryExceptionRequest_reject_update_delete"
BEFORE UPDATE OR DELETE ON "InventoryExceptionRequest"
FOR EACH ROW EXECUTE FUNCTION reject_task_0044_evidence_mutation();

CREATE TRIGGER "InventoryExceptionDecision_reject_update_delete"
BEFORE UPDATE OR DELETE ON "InventoryExceptionDecision"
FOR EACH ROW EXECUTE FUNCTION reject_task_0044_evidence_mutation();

CREATE OR REPLACE FUNCTION validate_task_0044_return_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  movement_row "StockMovement"%ROWTYPE;
  return_row "PharmacySaleReturn"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT movement_row
  FROM "StockMovement"
  WHERE "id" = NEW."stockMovementId";

  SELECT * INTO STRICT return_row
  FROM "PharmacySaleReturn"
  WHERE "id" = NEW."returnId"
    AND "tenantId" = NEW."tenantId"
    AND "providerId" = NEW."providerId";

  IF movement_row."referenceType" <> 'pharmacy.sale.return'
     OR movement_row."referenceId" <> NEW."returnId"::text
     OR movement_row."type" <> 'RETURN_IN'
     OR movement_row."delta" <> NEW."quantity"
     OR movement_row."actorMembershipId" <> return_row."actorMembershipId"
  THEN
    RAISE EXCEPTION 'Task 0044 return allocation movement mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "PharmacySaleReturnAllocation_validate_movement"
BEFORE INSERT ON "PharmacySaleReturnAllocation"
FOR EACH ROW EXECUTE FUNCTION validate_task_0044_return_allocation();

CREATE OR REPLACE FUNCTION validate_task_0044_exception_decision()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  request_row "InventoryExceptionRequest"%ROWTYPE;
  movement_row "StockMovement"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT request_row
  FROM "InventoryExceptionRequest"
  WHERE "id" = NEW."requestId"
    AND "tenantId" = NEW."tenantId"
    AND "providerId" = NEW."providerId"
    AND "batchId" = NEW."batchId";

  IF request_row."requestedByMembershipId" = NEW."decidedByMembershipId"
     OR request_row."requestedByUserId" = NEW."decidedByUserId"
  THEN
    RAISE EXCEPTION 'Task 0044 exception approval requires a different actor';
  END IF;

  IF NEW."outcome" = 'REJECTED' THEN
    RETURN NEW;
  END IF;

  IF request_row."action" = 'QUARANTINE_RELEASE' THEN
    IF NEW."movementId" IS NOT NULL OR NEW."onHandBefore" <> NEW."onHandAfter" THEN
      RAISE EXCEPTION 'Task 0044 quarantine release must not create stock';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."movementId" IS NULL THEN
    RAISE EXCEPTION 'Task 0044 physical disposition approval requires a stock movement';
  END IF;

  SELECT * INTO STRICT movement_row
  FROM "StockMovement"
  WHERE "id" = NEW."movementId";

  IF movement_row."tenantId" <> NEW."tenantId"
     OR movement_row."providerId" <> NEW."providerId"
     OR movement_row."batchId" <> NEW."batchId"
     OR movement_row."inventoryId" <> request_row."inventoryId"
     OR movement_row."productId" <> request_row."productId"
     OR movement_row."referenceId" <> NEW."requestId"::text
     OR movement_row."onHandBefore" <> NEW."onHandBefore"
     OR movement_row."onHandAfter" <> NEW."onHandAfter"
     OR movement_row."resultingBatchVersion" <> NEW."resultingBatchVersion"
     OR movement_row."actorMembershipId" <> NEW."decidedByMembershipId"
  THEN
    RAISE EXCEPTION 'Task 0044 exception decision movement scope mismatch';
  END IF;

  IF request_row."action" = 'DISPOSAL'
     AND (movement_row."referenceType" <> 'inventory.exception.disposal'
          OR movement_row."type" <> 'DISPOSAL'
          OR movement_row."delta" <> -request_row."quantity")
  THEN
    RAISE EXCEPTION 'Task 0044 disposal movement mismatch';
  END IF;

  IF request_row."action" = 'SUPPLIER_RETURN'
     AND (movement_row."referenceType" <> 'inventory.exception.supplier-return'
          OR movement_row."type" <> 'RETURN_OUT'
          OR movement_row."delta" <> -request_row."quantity")
  THEN
    RAISE EXCEPTION 'Task 0044 supplier-return movement mismatch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "InventoryExceptionDecision_validate_scope"
BEFORE INSERT ON "InventoryExceptionDecision"
FOR EACH ROW EXECUTE FUNCTION validate_task_0044_exception_decision();

-- Least-privilege Task 0044 permissions.
ALTER TABLE "Permission"
  DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (md5('medsphere:permission:billing.pos.return')::uuid,
   'billing.pos.return',
   'Record bounded customer return and refund evidence against an assigned-pharmacy POS sale'),
  (md5('medsphere:permission:inventory.batch.recall')::uuid,
   'inventory.batch.recall',
   'Recall an assigned-provider batch and immediately remove it from availability'),
  (md5('medsphere:permission:inventory.exception.request')::uuid,
   'inventory.exception.request',
   'Request a bounded inventory exception disposition for an assigned provider'),
  (md5('medsphere:permission:inventory.exception.approve')::uuid,
   'inventory.exception.approve',
   'Approve or reject a bounded inventory exception disposition for an assigned provider')
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Permission"
  ENABLE TRIGGER "Permission_reject_insert_update_delete";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('billing.pos.return'),
      ('inventory.batch.recall'),
      ('inventory.exception.request'),
      ('inventory.exception.approve')
    ) AS required(name)
    JOIN "Permission" p ON p."name" = required.name
    WHERE p."id" <> md5('medsphere:permission:' || required.name)::uuid
  ) THEN
    RAISE EXCEPTION 'Task 0044 migration blocked: permission identifier does not match the authoritative catalogue';
  END IF;
END $$;

INSERT INTO "RolePermission" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT
  md5(r."id"::text || ':' || p."id"::text)::uuid,
  r."tenantId",
  r."id",
  p."id",
  CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
  ON p."name" IN (
    'billing.pos.return',
    'inventory.batch.recall',
    'inventory.exception.request',
    'inventory.exception.approve'
  )
WHERE r."name" = 'TENANT_ADMINISTRATOR'
  AND r."type" = 'SYSTEM'
  AND r."deletedAt" IS NULL
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "AuditEvent"
  DROP CONSTRAINT "AuditEvent_event_type_check";

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_event_type_check"
  CHECK ("eventType" IN (
    'authorization.role.created', 'authorization.role.updated',
    'authorization.role.deleted', 'authorization.assignment.added',
    'authorization.assignment.removed', 'authorization.provider-access.added',
    'authorization.provider-access.removed', 'authorization.permission.denied',
    'authorization.membership.suspended', 'authorization.membership.revoked',
    'authentication.session.created', 'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed', 'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded', 'authentication.sessions.logout.succeeded',
    'authentication.session.locked', 'authentication.session.unlocked',
    'authentication.session.unlock.failed', 'authentication.session.logout.locked',
    'authentication.session.switched', 'authentication.session.reauthenticated',
    'authentication.verification.completed', 'authentication.account.activated',
    'authentication.otp.requested',
    'authentication.organization.join.requested',
    'authentication.organization.join.code.rejected',
    'authentication.organization.join.code.issued',
    'authentication.organization.join.code.revoked',
    'privacy.consent.granted', 'privacy.consent.withdrawn', 'privacy.preference.changed',
    'patient.profile.updated',
    'inventory.listing.configured', 'inventory.batch.received',
    'inventory.stock.adjusted', 'inventory.stock.transferred',
    'inventory.stock.damaged', 'inventory.batch.expired', 'inventory.batch.quarantined',
    'inventory.batch.recalled',
    'inventory.exception.requested', 'inventory.exception.approved',
    'inventory.exception.rejected',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired',
    'inventory.availability-request.responded',
    'inventory.availability-request.preference.configured',
    'inventory.import.staged', 'inventory.import.applied',
    'platform.authentication.session.created',
    'platform.authentication.session.refresh.succeeded',
    'platform.authentication.session.refresh.failed',
    'platform.authentication.session.refresh.replayed',
    'platform.authentication.session.logout.succeeded',
    'platform.authentication.session.locked',
    'platform.authentication.session.unlocked',
    'platform.invitation.created', 'platform.invitation.revoked', 'platform.invitation.accepted',
    'platform.role.assigned', 'platform.admin.suspended', 'platform.admin.reactivated',
    'platform.session.revoked', 'platform.owner.bootstrap',
    'pharmacy.verification.submitted', 'pharmacy.verification.resubmitted',
    'pharmacy.verification.review-started', 'pharmacy.verification.approved',
    'pharmacy.verification.rejected', 'pharmacy.verification.suspended',
    'pharmacy.verification.expired',
    'billing.pos.fiscal-profile.configured',
    'billing.pos.inventory-fiscal-profile.configured',
    'billing.pos.sale.completed',
    'billing.pos.invoice.reprinted',
    'billing.pos.sale.voided',
    'billing.pos.return.completed'
  ));


-- Task 0044 recall cancellations are exact-user actions. Preserve the prior
-- quarantine SYSTEM cause while allowing the new recall cause only for an
-- authenticated tenant user. The Task 0019 historical-upgrade verifier
-- intentionally deploys every later migration before reinstalling the exact-user
-- migration, so this migration cannot statically reference AuditEvent.actorUserId.
-- A dynamic trigger below rejects recall evidence until that column exists and is
-- populated; once Task 0019 is installed, its composite FK proves the exact
-- membership+user+tenant attribution.
ALTER TABLE "AuditEvent"
  DROP CONSTRAINT IF EXISTS "AuditEvent_reservation_quarantine_cause_check";

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_reservation_unavailability_cause_check" CHECK (
    "eventType" <> 'inventory.reservation.cancelled'
    OR NOT ("metadata" ? 'cause')
    OR (
      (
        "metadata"->>'cause' = 'BATCH_QUARANTINE'
        AND "scope" = 'TENANT'
        AND "actorType" = 'SYSTEM'
        AND "actorMembershipId" IS NULL
        AND "platformActorUserId" IS NULL
      )
      OR
      (
        "metadata"->>'cause' = 'BATCH_RECALL'
        AND "scope" = 'TENANT'
        AND "actorType" = 'TENANT_USER'
        AND "actorMembershipId" IS NOT NULL
        AND "platformActorUserId" IS NULL
      )
    )
  );

CREATE OR REPLACE FUNCTION validate_task_0044_recall_audit_actor()
RETURNS trigger
LANGUAGE plpgsql
AS $task0044$
BEGIN
  IF NEW."eventType" = 'inventory.reservation.cancelled'
     AND NEW."metadata"->>'cause' = 'BATCH_RECALL'
     AND NULLIF(to_jsonb(NEW)->>'actorUserId', '') IS NULL
  THEN
    RAISE EXCEPTION 'Task 0044 recall cancellation requires exact-user attribution';
  END IF;
  RETURN NEW;
END;
$task0044$;

CREATE TRIGGER "AuditEvent_task_0044_recall_actor"
BEFORE INSERT ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION validate_task_0044_recall_audit_actor();
