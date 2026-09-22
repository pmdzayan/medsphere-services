-- AIM V1 Task 0042 — Pharmacy Catalog, Barcode & Inventory Import Foundation.
-- Forward-only, populated-upgrade-safe migration. Existing Product.barcode values
-- are preserved unchanged; canonical identifiers are additive.

CREATE TYPE "ProductIdentifierType" AS ENUM ('GTIN', 'EAN', 'UPC');
CREATE TYPE "InventoryImportSourceFormat" AS ENUM ('CSV', 'XLSX');
CREATE TYPE "InventoryImportStatus" AS ENUM ('STAGED', 'APPLIED');
CREATE TYPE "InventoryImportRowStatus" AS ENUM ('VALID', 'INVALID', 'APPLIED');

CREATE TABLE "ProductIdentifier" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "type" "ProductIdentifierType" NOT NULL,
  "value" VARCHAR(32) NOT NULL,
  "normalizedValue" VARCHAR(32) NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductIdentifier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductIdentifier_normalizedValue_key"
  ON "ProductIdentifier"("normalizedValue");
CREATE UNIQUE INDEX "ProductIdentifier_productId_type_normalizedValue_key"
  ON "ProductIdentifier"("productId", "type", "normalizedValue");
CREATE INDEX "ProductIdentifier_productId_isPrimary_idx"
  ON "ProductIdentifier"("productId", "isPrimary");

ALTER TABLE "ProductIdentifier"
  ADD CONSTRAINT "ProductIdentifier_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryImportJob" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "stagedByMembershipId" UUID NOT NULL,
  "appliedByMembershipId" UUID,
  "sourceFormat" "InventoryImportSourceFormat" NOT NULL,
  "sourceFileName" VARCHAR(255) NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "mapping" JSONB NOT NULL,
  "stageIdempotencyKey" VARCHAR(120) NOT NULL,
  "stageCommandHash" VARCHAR(64) NOT NULL,
  "applyIdempotencyKey" VARCHAR(120),
  "applyCommandHash" VARCHAR(64),
  "status" "InventoryImportStatus" NOT NULL DEFAULT 'STAGED',
  "rowCount" INTEGER NOT NULL,
  "validRowCount" INTEGER NOT NULL,
  "invalidRowCount" INTEGER NOT NULL,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryImportJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryImportJob_row_counts_check"
    CHECK (
      "rowCount" >= 0
      AND "validRowCount" >= 0
      AND "invalidRowCount" >= 0
      AND "validRowCount" + "invalidRowCount" = "rowCount"
    ),
  CONSTRAINT "InventoryImportJob_apply_state_check"
    CHECK (
      ("status" = 'STAGED'
        AND "appliedAt" IS NULL
        AND "appliedByMembershipId" IS NULL
        AND "applyIdempotencyKey" IS NULL
        AND "applyCommandHash" IS NULL)
      OR
      ("status" = 'APPLIED'
        AND "appliedAt" IS NOT NULL
        AND "appliedByMembershipId" IS NOT NULL
        AND "applyIdempotencyKey" IS NOT NULL
        AND "applyCommandHash" IS NOT NULL
        AND "invalidRowCount" = 0)
    )
);

CREATE UNIQUE INDEX "InventoryImportJob_id_tenantId_providerId_key"
  ON "InventoryImportJob"("id", "tenantId", "providerId");
CREATE UNIQUE INDEX "InventoryImportJob_tenantId_stageIdempotencyKey_key"
  ON "InventoryImportJob"("tenantId", "stageIdempotencyKey");
CREATE UNIQUE INDEX "InventoryImportJob_tenantId_applyIdempotencyKey_key"
  ON "InventoryImportJob"("tenantId", "applyIdempotencyKey");
CREATE INDEX "InventoryImportJob_tenantId_providerId_createdAt_id_idx"
  ON "InventoryImportJob"("tenantId", "providerId", "createdAt" DESC, "id" DESC);

ALTER TABLE "InventoryImportJob"
  ADD CONSTRAINT "InventoryImportJob_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportJob"
  ADD CONSTRAINT "InventoryImportJob_providerId_tenantId_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportJob"
  ADD CONSTRAINT "InventoryImportJob_stagedByMembershipId_tenantId_fkey"
  FOREIGN KEY ("stagedByMembershipId", "tenantId")
  REFERENCES "TenantMembership"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportJob"
  ADD CONSTRAINT "InventoryImportJob_appliedByMembershipId_tenantId_fkey"
  FOREIGN KEY ("appliedByMembershipId", "tenantId")
  REFERENCES "TenantMembership"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryImportRow" (
  "id" UUID NOT NULL,
  "importJobId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "productId" UUID,
  "payload" JSONB NOT NULL,
  "validationErrors" JSONB NOT NULL,
  "status" "InventoryImportRowStatus" NOT NULL,
  "inventoryId" UUID,
  "batchId" UUID,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryImportRow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryImportRow_row_number_check" CHECK ("rowNumber" > 0),
  CONSTRAINT "InventoryImportRow_apply_state_check"
    CHECK (
      ("status" IN ('VALID', 'INVALID')
        AND "inventoryId" IS NULL
        AND "batchId" IS NULL
        AND "appliedAt" IS NULL)
      OR
      ("status" = 'APPLIED'
        AND "productId" IS NOT NULL
        AND "inventoryId" IS NOT NULL
        AND "batchId" IS NOT NULL
        AND "appliedAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "InventoryImportRow_importJobId_rowNumber_key"
  ON "InventoryImportRow"("importJobId", "rowNumber");
CREATE INDEX "InventoryImportRow_tenantId_providerId_status_idx"
  ON "InventoryImportRow"("tenantId", "providerId", "status");
CREATE INDEX "InventoryImportRow_productId_idx"
  ON "InventoryImportRow"("productId");

ALTER TABLE "InventoryImportRow"
  ADD CONSTRAINT "InventoryImportRow_importJobId_tenantId_providerId_fkey"
  FOREIGN KEY ("importJobId", "tenantId", "providerId")
  REFERENCES "InventoryImportJob"("id", "tenantId", "providerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportRow"
  ADD CONSTRAINT "InventoryImportRow_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportRow"
  ADD CONSTRAINT "InventoryImportRow_providerId_tenantId_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportRow"
  ADD CONSTRAINT "InventoryImportRow_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryImportReceipt" (
  "id" UUID NOT NULL,
  "importJobId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "actorMembershipId" UUID NOT NULL,
  "appliedRowCount" INTEGER NOT NULL,
  "totalQuantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryImportReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryImportReceipt_counts_check"
    CHECK ("appliedRowCount" >= 0 AND "totalQuantity" >= 0)
);

CREATE UNIQUE INDEX "InventoryImportReceipt_importJobId_key"
  ON "InventoryImportReceipt"("importJobId");
CREATE UNIQUE INDEX "InventoryImportReceipt_importJobId_tenantId_providerId_key"
  ON "InventoryImportReceipt"("importJobId", "tenantId", "providerId");
CREATE INDEX "InventoryImportReceipt_tenantId_providerId_createdAt_id_idx"
  ON "InventoryImportReceipt"("tenantId", "providerId", "createdAt" DESC, "id" DESC);

ALTER TABLE "InventoryImportReceipt"
  ADD CONSTRAINT "InventoryImportReceipt_importJobId_tenantId_providerId_fkey"
  FOREIGN KEY ("importJobId", "tenantId", "providerId")
  REFERENCES "InventoryImportJob"("id", "tenantId", "providerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportReceipt"
  ADD CONSTRAINT "InventoryImportReceipt_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportReceipt"
  ADD CONSTRAINT "InventoryImportReceipt_providerId_tenantId_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryImportReceipt"
  ADD CONSTRAINT "InventoryImportReceipt_actorMembershipId_tenantId_fkey"
  FOREIGN KEY ("actorMembershipId", "tenantId")
  REFERENCES "TenantMembership"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Receipts are immutable evidence. A replay must read the existing row, not
-- mutate it.
CREATE OR REPLACE FUNCTION "InventoryImportReceipt_reject_update_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'InventoryImportReceipt rows are append-only';
END;
$$;

CREATE TRIGGER "InventoryImportReceipt_reject_update_delete"
BEFORE UPDATE OR DELETE ON "InventoryImportReceipt"
FOR EACH ROW EXECUTE FUNCTION "InventoryImportReceipt_reject_update_delete"();

-- Add Task 0042 exact-user audit events without removing any accepted event.
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
    'pharmacy.verification.expired'
  ));
