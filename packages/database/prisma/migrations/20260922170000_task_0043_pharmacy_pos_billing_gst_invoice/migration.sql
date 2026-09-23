-- CreateEnum
CREATE TYPE "PharmacyFiscalRegistrationType" AS ENUM ('GST_REGULAR', 'GST_COMPOSITION', 'UNREGISTERED');

-- CreateEnum
CREATE TYPE "PharmacySaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PharmacyPaymentMethod" AS ENUM ('CASH', 'CARD', 'UPI', 'OTHER');

-- CreateEnum
CREATE TYPE "PharmacyInvoiceDocumentType" AS ENUM ('TAX_INVOICE', 'BILL_OF_SUPPLY', 'COMMERCIAL_RECEIPT');

-- CreateEnum
CREATE TYPE "PharmacySaleCommandType" AS ENUM ('CHECKOUT', 'VOID');

-- CreateTable
CREATE TABLE "PharmacyFiscalProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "registrationType" "PharmacyFiscalRegistrationType" NOT NULL,
    "legalName" VARCHAR(200) NOT NULL,
    "gstin" VARCHAR(15),
    "stateCode" VARCHAR(2) NOT NULL,
    "invoiceSeries" VARCHAR(4) NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyFiscalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryFiscalProfile" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "hsnCode" VARCHAR(8) NOT NULL,
    "uqc" VARCHAR(8) NOT NULL DEFAULT 'NOS',
    "cessPercentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryFiscalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySale" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reservationId" UUID,
    "status" "PharmacySaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "pricesIncludeTax" BOOLEAN NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "taxableTotal" DECIMAL(12,2) NOT NULL,
    "cgstTotal" DECIMAL(12,2) NOT NULL,
    "sgstTotal" DECIMAL(12,2) NOT NULL,
    "igstTotal" DECIMAL(12,2) NOT NULL,
    "cessTotal" DECIMAL(12,2) NOT NULL,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "cashTendered" DECIMAL(12,2),
    "changeDue" DECIMAL(12,2),
    "placeOfSupplyStateCode" VARCHAR(2) NOT NULL,
    "recipientName" VARCHAR(200),
    "recipientAddress" VARCHAR(500),
    "recipientGstin" VARCHAR(15),
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySaleLine" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "productNameSnapshot" VARCHAR(240) NOT NULL,
    "brandSnapshot" VARCHAR(240) NOT NULL,
    "strengthSnapshot" VARCHAR(80) NOT NULL,
    "dosageFormSnapshot" VARCHAR(80) NOT NULL,
    "hsnCodeSnapshot" VARCHAR(8) NOT NULL,
    "uqcSnapshot" VARCHAR(8) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "mrp" DECIMAL(12,2) NOT NULL,
    "grossValue" DECIMAL(12,2) NOT NULL,
    "discountPercentage" DECIMAL(5,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL,
    "taxableValue" DECIMAL(12,2) NOT NULL,
    "gstPercentage" DECIMAL(5,2) NOT NULL,
    "cessPercentage" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(12,2) NOT NULL,
    "sgstAmount" DECIMAL(12,2) NOT NULL,
    "igstAmount" DECIMAL(12,2) NOT NULL,
    "cessAmount" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySaleAllocation" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "inventoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "stockMovementId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySaleAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySalePayment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "method" "PharmacyPaymentMethod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "externalReference" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInvoiceSequence" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "financialYear" VARCHAR(7) NOT NULL,
    "series" VARCHAR(8) NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyInvoiceSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInvoice" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "documentType" "PharmacyInvoiceDocumentType" NOT NULL,
    "financialYear" VARCHAR(7) NOT NULL,
    "invoiceNumber" VARCHAR(16) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "supplierLegalName" VARCHAR(200) NOT NULL,
    "supplierAddress" VARCHAR(500) NOT NULL,
    "supplierGstin" VARCHAR(15),
    "supplierStateCode" VARCHAR(2) NOT NULL,
    "placeOfSupplyStateCode" VARCHAR(2) NOT NULL,
    "recipientName" VARCHAR(200),
    "recipientAddress" VARCHAR(500),
    "recipientGstin" VARCHAR(15),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountTotal" DECIMAL(12,2) NOT NULL,
    "taxableTotal" DECIMAL(12,2) NOT NULL,
    "cgstTotal" DECIMAL(12,2) NOT NULL,
    "sgstTotal" DECIMAL(12,2) NOT NULL,
    "igstTotal" DECIMAL(12,2) NOT NULL,
    "cessTotal" DECIMAL(12,2) NOT NULL,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInvoiceReprint" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyInvoiceReprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySaleCommand" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "commandType" "PharmacySaleCommandType" NOT NULL,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySaleCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacySaleVoid" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "actorMembershipId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "idempotencyKey" VARCHAR(120) NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacySaleVoid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyFiscalProfile_providerId_key" ON "PharmacyFiscalProfile"("providerId");

-- CreateIndex
CREATE INDEX "PharmacyFiscalProfile_tenantId_providerId_idx" ON "PharmacyFiscalProfile"("tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyFiscalProfile_providerId_tenantId_key" ON "PharmacyFiscalProfile"("providerId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyFiscalProfile_id_tenantId_providerId_key" ON "PharmacyFiscalProfile"("id", "tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryFiscalProfile_inventoryId_key" ON "InventoryFiscalProfile"("inventoryId");

-- CreateIndex
CREATE INDEX "InventoryFiscalProfile_tenantId_providerId_productId_idx" ON "InventoryFiscalProfile"("tenantId", "providerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryFiscalProfile_inventoryId_tenantId_providerId_prod_key" ON "InventoryFiscalProfile"("inventoryId", "tenantId", "providerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryFiscalProfile_id_tenantId_providerId_inventoryId_p_key" ON "InventoryFiscalProfile"("id", "tenantId", "providerId", "inventoryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySale_reservationId_key" ON "PharmacySale"("reservationId");

-- CreateIndex
CREATE INDEX "PharmacySale_tenantId_providerId_completedAt_id_idx" ON "PharmacySale"("tenantId", "providerId", "completedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "PharmacySale_actorMembershipId_completedAt_id_idx" ON "PharmacySale"("actorMembershipId", "completedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySale_tenantId_idempotencyKey_key" ON "PharmacySale"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySale_reservationId_tenantId_providerId_key" ON "PharmacySale"("reservationId", "tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySale_id_tenantId_providerId_key" ON "PharmacySale"("id", "tenantId", "providerId");

-- CreateIndex
CREATE INDEX "PharmacySaleLine_tenantId_providerId_productId_createdAt_idx" ON "PharmacySaleLine"("tenantId", "providerId", "productId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleLine_saleId_lineNumber_key" ON "PharmacySaleLine"("saleId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleLine_id_tenantId_saleId_providerId_inventoryId__key" ON "PharmacySaleLine"("id", "tenantId", "saleId", "providerId", "inventoryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleAllocation_stockMovementId_key" ON "PharmacySaleAllocation"("stockMovementId");

-- CreateIndex
CREATE INDEX "PharmacySaleAllocation_tenantId_providerId_batchId_idx" ON "PharmacySaleAllocation"("tenantId", "providerId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleAllocation_lineId_batchId_key" ON "PharmacySaleAllocation"("lineId", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleAllocation_stockMovementId_tenantId_inventoryId_key" ON "PharmacySaleAllocation"("stockMovementId", "tenantId", "inventoryId", "batchId", "providerId", "productId");

-- CreateIndex
CREATE INDEX "PharmacySalePayment_tenantId_providerId_saleId_idx" ON "PharmacySalePayment"("tenantId", "providerId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyInvoiceSequence_tenantId_providerId_financialYear_s_key" ON "PharmacyInvoiceSequence"("tenantId", "providerId", "financialYear", "series");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyInvoice_saleId_key" ON "PharmacyInvoice"("saleId");

-- CreateIndex
CREATE INDEX "PharmacyInvoice_tenantId_providerId_issuedAt_id_idx" ON "PharmacyInvoice"("tenantId", "providerId", "issuedAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyInvoice_saleId_tenantId_providerId_key" ON "PharmacyInvoice"("saleId", "tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyInvoice_tenantId_providerId_financialYear_invoiceNu_key" ON "PharmacyInvoice"("tenantId", "providerId", "financialYear", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyInvoice_id_tenantId_providerId_key" ON "PharmacyInvoice"("id", "tenantId", "providerId");

-- CreateIndex
CREATE INDEX "PharmacyInvoiceReprint_tenantId_providerId_invoiceId_create_idx" ON "PharmacyInvoiceReprint"("tenantId", "providerId", "invoiceId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleCommand_saleId_commandType_key" ON "PharmacySaleCommand"("saleId", "commandType");

-- CreateIndex
CREATE INDEX "PharmacySaleCommand_tenantId_providerId_createdAt_idx" ON "PharmacySaleCommand"("tenantId", "providerId", "createdAt" DESC);

-- CreateIndex
-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleCommand_tenantId_idempotencyKey_key" ON "PharmacySaleCommand"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleVoid_saleId_key" ON "PharmacySaleVoid"("saleId");

-- CreateIndex
CREATE INDEX "PharmacySaleVoid_tenantId_providerId_occurredAt_id_idx" ON "PharmacySaleVoid"("tenantId", "providerId", "occurredAt" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleVoid_saleId_tenantId_providerId_key" ON "PharmacySaleVoid"("saleId", "tenantId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacySaleVoid_tenantId_idempotencyKey_key" ON "PharmacySaleVoid"("tenantId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "PharmacyFiscalProfile" ADD CONSTRAINT "PharmacyFiscalProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyFiscalProfile" ADD CONSTRAINT "PharmacyFiscalProfile_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryFiscalProfile" ADD CONSTRAINT "InventoryFiscalProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryFiscalProfile" ADD CONSTRAINT "InventoryFiscalProfile_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryFiscalProfile" ADD CONSTRAINT "InventoryFiscalProfile_inventoryId_tenantId_providerId_pro_fkey" FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySale" ADD CONSTRAINT "PharmacySale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySale" ADD CONSTRAINT "PharmacySale_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySale" ADD CONSTRAINT "PharmacySale_actorMembership_actorUser_tenant_fkey" FOREIGN KEY ("actorMembershipId", "actorUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySale" ADD CONSTRAINT "PharmacySale_reservationId_tenantId_providerId_fkey" FOREIGN KEY ("reservationId", "tenantId", "providerId") REFERENCES "MedicineReservation"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleLine" ADD CONSTRAINT "PharmacySaleLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleLine" ADD CONSTRAINT "PharmacySaleLine_saleId_tenantId_providerId_fkey" FOREIGN KEY ("saleId", "tenantId", "providerId") REFERENCES "PharmacySale"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleLine" ADD CONSTRAINT "PharmacySaleLine_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleLine" ADD CONSTRAINT "PharmacySaleLine_inventoryId_tenantId_providerId_productId_fkey" FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleLine" ADD CONSTRAINT "PharmacySaleLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleAllocation" ADD CONSTRAINT "PharmacySaleAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleAllocation" ADD CONSTRAINT "PharmacySaleAllocation_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleAllocation" ADD CONSTRAINT "PharmacySaleAllocation_lineId_tenantId_saleId_providerId_i_fkey" FOREIGN KEY ("lineId", "tenantId", "saleId", "providerId", "inventoryId", "productId") REFERENCES "PharmacySaleLine"("id", "tenantId", "saleId", "providerId", "inventoryId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleAllocation" ADD CONSTRAINT "PharmacySaleAllocation_inventoryId_tenantId_providerId_pro_fkey" FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleAllocation" ADD CONSTRAINT "PharmacySaleAllocation_batchId_tenantId_inventoryId_provid_fkey" FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleAllocation" ADD CONSTRAINT "PharmacySaleAllocation_stockMovementId_tenantId_inventoryI_fkey" FOREIGN KEY ("stockMovementId", "tenantId", "inventoryId", "batchId", "providerId", "productId") REFERENCES "StockMovement"("id", "tenantId", "inventoryId", "batchId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySalePayment" ADD CONSTRAINT "PharmacySalePayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySalePayment" ADD CONSTRAINT "PharmacySalePayment_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySalePayment" ADD CONSTRAINT "PharmacySalePayment_saleId_tenantId_providerId_fkey" FOREIGN KEY ("saleId", "tenantId", "providerId") REFERENCES "PharmacySale"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceSequence" ADD CONSTRAINT "PharmacyInvoiceSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceSequence" ADD CONSTRAINT "PharmacyInvoiceSequence_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoice" ADD CONSTRAINT "PharmacyInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoice" ADD CONSTRAINT "PharmacyInvoice_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoice" ADD CONSTRAINT "PharmacyInvoice_saleId_tenantId_providerId_fkey" FOREIGN KEY ("saleId", "tenantId", "providerId") REFERENCES "PharmacySale"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceReprint" ADD CONSTRAINT "PharmacyInvoiceReprint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceReprint" ADD CONSTRAINT "PharmacyInvoiceReprint_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceReprint" ADD CONSTRAINT "PharmacyInvoiceReprint_invoiceId_tenantId_providerId_fkey" FOREIGN KEY ("invoiceId", "tenantId", "providerId") REFERENCES "PharmacyInvoice"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInvoiceReprint" ADD CONSTRAINT "PharmacyInvoiceReprint_actorMembership_actorUser_tenant_fkey" FOREIGN KEY ("actorMembershipId", "actorUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleCommand" ADD CONSTRAINT "PharmacySaleCommand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleCommand" ADD CONSTRAINT "PharmacySaleCommand_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleCommand" ADD CONSTRAINT "PharmacySaleCommand_saleId_tenantId_providerId_fkey" FOREIGN KEY ("saleId", "tenantId", "providerId") REFERENCES "PharmacySale"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleVoid" ADD CONSTRAINT "PharmacySaleVoid_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleVoid" ADD CONSTRAINT "PharmacySaleVoid_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleVoid" ADD CONSTRAINT "PharmacySaleVoid_saleId_tenantId_providerId_fkey" FOREIGN KEY ("saleId", "tenantId", "providerId") REFERENCES "PharmacySale"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacySaleVoid" ADD CONSTRAINT "PharmacySaleVoid_actorMembership_actorUser_tenant_fkey" FOREIGN KEY ("actorMembershipId", "actorUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Task 0043 runtime catalogue synchronization and financial evidence hardening.
-- The POS permission constants and audit catalogue are not usable until the
-- database catalogues are updated in the same migration.
-- ---------------------------------------------------------------------------
ALTER TABLE "Permission"
  DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (md5('medsphere:permission:billing.pos.read')::uuid,
   'billing.pos.read',
   'Read assigned-pharmacy POS sales, invoices, and fiscal configuration'),
  (md5('medsphere:permission:billing.pos.checkout')::uuid,
   'billing.pos.checkout',
   'Complete assigned-pharmacy POS checkout transactions'),
  (md5('medsphere:permission:billing.pos.configure')::uuid,
   'billing.pos.configure',
   'Configure assigned-pharmacy POS fiscal settings'),
  (md5('medsphere:permission:billing.pos.void')::uuid,
   'billing.pos.void',
   'Record an assigned-pharmacy POS void/correction')
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Permission"
  ENABLE TRIGGER "Permission_reject_insert_update_delete";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('billing.pos.read'),
      ('billing.pos.checkout'),
      ('billing.pos.configure'),
      ('billing.pos.void')
    ) AS required(name)
    JOIN "Permission" p ON p."name" = required.name
    WHERE p."id" <> md5('medsphere:permission:' || required.name)::uuid
  ) THEN
    RAISE EXCEPTION 'Task 0043 migration blocked: POS permission identifier does not match the authoritative catalogue';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('billing.pos.read'),
      ('billing.pos.checkout'),
      ('billing.pos.configure'),
      ('billing.pos.void')
    ) AS required(name)
    LEFT JOIN "Permission" p ON p."name" = required.name
    WHERE p."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Task 0043 migration blocked: POS permission catalogue is incomplete';
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
    'billing.pos.read',
    'billing.pos.checkout',
    'billing.pos.configure',
    'billing.pos.void'
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
    'billing.pos.sale.voided'
  ));

ALTER TABLE "PharmacyFiscalProfile"
  ADD CONSTRAINT "PharmacyFiscalProfile_registration_gstin_check"
  CHECK (
    ("registrationType" = 'UNREGISTERED' AND "gstin" IS NULL)
    OR
    ("registrationType" IN ('GST_REGULAR', 'GST_COMPOSITION')
      AND "gstin" IS NOT NULL
      AND "gstin" ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
      AND left("gstin", 2) = "stateCode")
  ),
  ADD CONSTRAINT "PharmacyFiscalProfile_stateCode_check"
  CHECK ("stateCode" ~ '^[0-9]{2}$'),
  ADD CONSTRAINT "PharmacyFiscalProfile_invoiceSeries_check"
  CHECK ("invoiceSeries" ~ '^[A-Z0-9]{1,4}$');

ALTER TABLE "InventoryFiscalProfile"
  ADD CONSTRAINT "InventoryFiscalProfile_hsnCode_check"
  CHECK ("hsnCode" ~ '^(?:[0-9]{4}|[0-9]{6}|[0-9]{8})$'),
  ADD CONSTRAINT "InventoryFiscalProfile_uqc_check"
  CHECK ("uqc" ~ '^[A-Z]{2,8}$'),
  ADD CONSTRAINT "InventoryFiscalProfile_cessPercentage_check"
  CHECK ("cessPercentage" >= 0 AND "cessPercentage" <= 100);

ALTER TABLE "PharmacySale"
  ADD CONSTRAINT "PharmacySale_money_nonnegative_check"
  CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxableTotal" >= 0
    AND "cgstTotal" >= 0 AND "sgstTotal" >= 0 AND "igstTotal" >= 0
    AND "cessTotal" >= 0 AND "grandTotal" > 0
    AND ("cashTendered" IS NULL OR "cashTendered" >= 0)
    AND ("changeDue" IS NULL OR "changeDue" >= 0)
  ),
  ADD CONSTRAINT "PharmacySale_stateCode_check"
  CHECK ("placeOfSupplyStateCode" ~ '^[0-9]{2}$'),
  ADD CONSTRAINT "PharmacySale_void_state_check"
  CHECK (
    ("status" = 'COMPLETED' AND "voidedAt" IS NULL)
    OR ("status" = 'VOIDED' AND "voidedAt" IS NOT NULL)
  );

ALTER TABLE "PharmacySaleLine"
  ADD CONSTRAINT "PharmacySaleLine_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "PharmacySaleLine_money_check"
  CHECK (
    "unitPrice" >= 0 AND "mrp" >= 0 AND "grossValue" >= 0
    AND "discountPercentage" >= 0 AND "discountPercentage" <= 100
    AND "discountAmount" >= 0 AND "taxableValue" >= 0
    AND "gstPercentage" >= 0 AND "gstPercentage" <= 100
    AND "cessPercentage" >= 0 AND "cessPercentage" <= 100
    AND "cgstAmount" >= 0 AND "sgstAmount" >= 0 AND "igstAmount" >= 0
    AND "cessAmount" >= 0 AND "lineTotal" >= 0
  );

ALTER TABLE "PharmacySaleAllocation"
  ADD CONSTRAINT "PharmacySaleAllocation_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "PharmacySalePayment"
  ADD CONSTRAINT "PharmacySalePayment_amount_check" CHECK ("amount" > 0);

ALTER TABLE "PharmacyInvoiceSequence"
  ADD CONSTRAINT "PharmacyInvoiceSequence_nextNumber_check" CHECK ("nextNumber" > 0),
  ADD CONSTRAINT "PharmacyInvoiceSequence_financialYear_check"
  CHECK ("financialYear" ~ '^[0-9]{4}-[0-9]{2}$'),
  ADD CONSTRAINT "PharmacyInvoiceSequence_series_check"
  CHECK ("series" ~ '^[A-Z0-9]{1,4}$');

ALTER TABLE "PharmacyInvoice"
  ADD CONSTRAINT "PharmacyInvoice_stateCode_check"
  CHECK (
    "supplierStateCode" ~ '^[0-9]{2}$'
    AND "placeOfSupplyStateCode" ~ '^[0-9]{2}$'
  ),
  ADD CONSTRAINT "PharmacyInvoice_money_check"
  CHECK (
    "subtotal" >= 0 AND "discountTotal" >= 0 AND "taxableTotal" >= 0
    AND "cgstTotal" >= 0 AND "sgstTotal" >= 0 AND "igstTotal" >= 0
    AND "cessTotal" >= 0 AND "grandTotal" > 0
  );

CREATE OR REPLACE FUNCTION reject_task_0043_financial_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Task 0043 financial evidence rows are append-only';
END;
$$;

CREATE TRIGGER "PharmacySaleLine_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySaleLine"
FOR EACH ROW EXECUTE FUNCTION reject_task_0043_financial_evidence_mutation();

CREATE TRIGGER "PharmacySaleAllocation_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySaleAllocation"
FOR EACH ROW EXECUTE FUNCTION reject_task_0043_financial_evidence_mutation();

CREATE TRIGGER "PharmacySalePayment_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySalePayment"
FOR EACH ROW EXECUTE FUNCTION reject_task_0043_financial_evidence_mutation();

CREATE TRIGGER "PharmacyInvoice_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacyInvoice"
FOR EACH ROW EXECUTE FUNCTION reject_task_0043_financial_evidence_mutation();

CREATE TRIGGER "PharmacyInvoiceReprint_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacyInvoiceReprint"
FOR EACH ROW EXECUTE FUNCTION reject_task_0043_financial_evidence_mutation();

CREATE TRIGGER "PharmacySaleCommand_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySaleCommand"
FOR EACH ROW EXECUTE FUNCTION reject_task_0043_financial_evidence_mutation();

CREATE TRIGGER "PharmacySaleVoid_reject_update_delete"
BEFORE UPDATE OR DELETE ON "PharmacySaleVoid"
FOR EACH ROW EXECUTE FUNCTION reject_task_0043_financial_evidence_mutation();
