-- CreateEnum
CREATE TYPE "PharmacyReturnReason" AS ENUM ('CUSTOMER_REQUEST', 'WRONG_ITEM', 'DAMAGED_PACKAGE', 'PRODUCT_DEFECT', 'OTHER');

-- CreateEnum
CREATE TYPE "BatchRecallReason" AS ENUM ('MANUFACTURER_RECALL', 'REGULATORY_RECALL', 'QUALITY_ALERT', 'OTHER');

-- CreateEnum
CREATE TYPE "InventoryExceptionAction" AS ENUM ('QUARANTINE_RELEASE', 'DISPOSAL', 'SUPPLIER_RETURN');

-- CreateEnum
CREATE TYPE "InventoryExceptionDecisionOutcome" AS ENUM ('APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "BatchStatus" ADD VALUE 'RECALLED';

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'DISPOSAL';

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

