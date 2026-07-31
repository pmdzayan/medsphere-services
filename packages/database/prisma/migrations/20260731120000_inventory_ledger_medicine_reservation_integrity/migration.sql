-- S0.5 establishes Batch as the sole stock authority and replaces the generic
-- reservation prototype with a tenant-safe medicine reservation aggregate.
-- The migration fails closed when prototype data cannot be transformed without
-- guessing. Existing accepted migrations remain untouched.

CREATE TYPE "MedicineReservationStatus" AS ENUM (
  'PENDING', 'CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED', 'EXPIRED'
);
CREATE TYPE "MedicineAllocationStatus" AS ENUM ('HELD', 'CONSUMED', 'RELEASED');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Reservation") THEN
    RAISE EXCEPTION 'S0.5 migration blocked: legacy reservations require explicit remediation';
  END IF;

  IF EXISTS (SELECT 1 FROM "Inventory" WHERE "reservedQuantity" <> 0) THEN
    RAISE EXCEPTION 'S0.5 migration blocked: legacy held inventory cannot be allocated safely';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Inventory"
    WHERE "quantity" < 0 OR "minimumStockLevel" < 0 OR "version" < 1
      OR "sellingPrice" < 0 OR "mrp" < 0
      OR "discountPercentage" < 0 OR "discountPercentage" > 100
      OR "taxPercentage" < 0 OR "taxPercentage" > 100
  ) THEN
    RAISE EXCEPTION 'S0.5 migration blocked: invalid legacy inventory values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Batch"
    WHERE "initialQuantity" <= 0 OR "currentQuantity" < 0
      OR "initialQuantity" < "currentQuantity" OR "version" < 1
      OR "purchasePrice" < 0 OR "sellingPrice" < 0
      OR ("manufacturingDate" IS NOT NULL AND "manufacturingDate" >= "expiryDate")
  ) THEN
    RAISE EXCEPTION 'S0.5 migration blocked: invalid legacy batch values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Inventory" i
    LEFT JOIN "Batch" b
      ON b."providerId" = i."providerId"
     AND b."productId" = i."productId"
     AND b."batchNumber" = i."batchNumber"
     AND b."expiryDate" = i."expiryDate"
     AND b."currentQuantity" = i."quantity"
     AND b."sellingPrice" = i."sellingPrice"
    WHERE b."id" IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM "Batch" b
    LEFT JOIN "Inventory" i
      ON i."providerId" = b."providerId"
     AND i."productId" = b."productId"
     AND i."batchNumber" = b."batchNumber"
     AND i."expiryDate" = b."expiryDate"
     AND i."quantity" = b."currentQuantity"
     AND i."sellingPrice" = b."sellingPrice"
    WHERE i."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'S0.5 migration blocked: inventory and batch quantities do not reconcile';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Inventory"
    GROUP BY "providerId", "productId"
    HAVING min(coalesce("sku", '')) IS DISTINCT FROM max(coalesce("sku", ''))
       OR min("sellingPrice") IS DISTINCT FROM max("sellingPrice")
       OR min("mrp") IS DISTINCT FROM max("mrp")
       OR min("discountPercentage") IS DISTINCT FROM max("discountPercentage")
       OR min("taxPercentage") IS DISTINCT FROM max("taxPercentage")
       OR min("minimumStockLevel") IS DISTINCT FROM max("minimumStockLevel")
       OR min("isVisible"::int) IS DISTINCT FROM max("isVisible"::int)
  ) THEN
    RAISE EXCEPTION 'S0.5 migration blocked: duplicate inventory configuration is incompatible';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "InventoryHistory" h
    WHERE NOT EXISTS (
      SELECT 1 FROM "StockMovement" m
      WHERE m."inventoryId" = h."inventoryId"
        AND m."providerId" = h."providerId"
        AND m."productId" = h."productId"
        AND m."batchId" IS NOT DISTINCT FROM h."batchId"
        AND m."type" = h."type"
        AND m."quantity" = h."quantity"
        AND m."quantityBefore" = h."quantityBefore"
        AND m."quantityAfter" = h."quantityAfter"
        AND m."userId" = h."userId"
        AND m."createdAt" = h."createdAt"
    )
  ) THEN
    RAISE EXCEPTION 'S0.5 migration blocked: inventory history is not represented in the ledger';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "StockMovement" m
    WHERE m."batchId" IS NULL
       OR m."quantityAfter" = m."quantityBefore"
       OR NOT EXISTS (
         SELECT 1 FROM "TenantMembership" tm
         JOIN "Provider" p ON p."tenantId" = tm."tenantId"
         WHERE p."id" = m."providerId" AND tm."userId" = m."userId"
           AND tm."status" = 'ACTIVE' AND tm."deletedAt" IS NULL
       )
  ) THEN
    RAISE EXCEPTION 'S0.5 migration blocked: stock movement attribution or arithmetic is invalid';
  END IF;
END $$;

CREATE TEMP TABLE "_s05_inventory_map" ON COMMIT DROP AS
SELECT
  i."id" AS "legacyInventoryId",
  first_value(i."id") OVER (
    PARTITION BY i."providerId", i."productId" ORDER BY i."createdAt", i."id"
  ) AS "canonicalInventoryId"
FROM "Inventory" i;

ALTER TABLE "Inventory" ADD COLUMN "tenantId" UUID;
UPDATE "Inventory" i SET "tenantId" = p."tenantId"
FROM "Provider" p WHERE p."id" = i."providerId";

ALTER TABLE "Batch"
  ADD COLUMN "tenantId" UUID,
  ADD COLUMN "inventoryId" UUID,
  ADD COLUMN "heldQuantity" INTEGER NOT NULL DEFAULT 0;
UPDATE "Batch" b
SET "tenantId" = p."tenantId", "inventoryId" = map."canonicalInventoryId"
FROM "Provider" p, "Inventory" i, "_s05_inventory_map" map
WHERE p."id" = b."providerId"
  AND i."providerId" = b."providerId"
  AND i."productId" = b."productId"
  AND i."batchNumber" = b."batchNumber"
  AND i."expiryDate" = b."expiryDate"
  AND map."legacyInventoryId" = i."id";

UPDATE "StockMovement" m SET "inventoryId" = map."canonicalInventoryId"
FROM "_s05_inventory_map" map WHERE map."legacyInventoryId" = m."inventoryId";

-- InventoryHistory is retired later, but its legacy foreign key must follow the
-- canonical inventory row until that table is dropped.
UPDATE "InventoryHistory" h SET "inventoryId" = map."canonicalInventoryId"
FROM "_s05_inventory_map" map WHERE map."legacyInventoryId" = h."inventoryId";

ALTER TABLE "StockMovement"
  ADD COLUMN "tenantId" UUID,
  ADD COLUMN "actorMembershipId" UUID,
  ADD COLUMN "actorType" "AuditActorType",
  ADD COLUMN "delta" INTEGER,
  ADD COLUMN "onHandBefore" INTEGER,
  ADD COLUMN "onHandAfter" INTEGER,
  ADD COLUMN "idempotencyKey" VARCHAR(120),
  ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "StockMovement" m
SET "tenantId" = p."tenantId",
    "actorType" = 'TENANT_USER',
    "actorMembershipId" = (
      SELECT tm."id" FROM "TenantMembership" tm
      WHERE tm."tenantId" = p."tenantId" AND tm."userId" = m."userId"
        AND tm."status" = 'ACTIVE' AND tm."deletedAt" IS NULL
      ORDER BY tm."createdAt", tm."id" LIMIT 1
    ),
    "delta" = m."quantityAfter" - m."quantityBefore",
    "onHandBefore" = m."quantityBefore",
    "onHandAfter" = m."quantityAfter",
    "idempotencyKey" = 'legacy:' || m."id"::text,
    "occurredAt" = m."createdAt"
FROM "Provider" p WHERE p."id" = m."providerId";

DELETE FROM "Inventory" i USING "_s05_inventory_map" map
WHERE i."id" = map."legacyInventoryId"
  AND map."legacyInventoryId" <> map."canonicalInventoryId";

ALTER TABLE "Inventory" DROP CONSTRAINT "Inventory_providerId_fkey";
ALTER TABLE "Batch" DROP CONSTRAINT "Batch_providerId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_inventoryId_fkey";
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_batchId_fkey";

DROP INDEX "Inventory_providerId_idx";
DROP INDEX "Inventory_expiryDate_idx";
DROP INDEX "Inventory_providerId_inStock_idx";
DROP INDEX "Batch_providerId_idx";
DROP INDEX "Batch_productId_idx";
DROP INDEX "Batch_expiryDate_idx";
DROP INDEX "Batch_status_idx";
DROP INDEX "Batch_providerId_productId_batchNumber_key";
DROP INDEX "StockMovement_inventoryId_idx";
DROP INDEX "StockMovement_batchId_idx";
DROP INDEX "StockMovement_providerId_idx";
DROP INDEX "StockMovement_productId_idx";
DROP INDEX "StockMovement_type_idx";
DROP INDEX "StockMovement_createdAt_idx";

ALTER TABLE "Inventory"
  DROP COLUMN "batchNumber", DROP COLUMN "expiryDate", DROP COLUMN "inStock",
  DROP COLUMN "quantity", DROP COLUMN "reservedQuantity",
  ALTER COLUMN "tenantId" SET NOT NULL,
  ALTER COLUMN "sku" TYPE VARCHAR(120);

ALTER TABLE "Batch"
  RENAME COLUMN "initialQuantity" TO "receivedQuantity";
ALTER TABLE "Batch"
  RENAME COLUMN "currentQuantity" TO "onHandQuantity";
ALTER TABLE "Batch"
  ALTER COLUMN "tenantId" SET NOT NULL,
  ALTER COLUMN "inventoryId" SET NOT NULL,
  ALTER COLUMN "batchNumber" TYPE VARCHAR(120);

ALTER TABLE "StockMovement"
  DROP COLUMN "quantity", DROP COLUMN "quantityBefore", DROP COLUMN "quantityAfter",
  DROP COLUMN "notes", DROP COLUMN "userId", DROP COLUMN "version",
  DROP COLUMN "updatedAt", DROP COLUMN "deletedAt",
  ALTER COLUMN "tenantId" SET NOT NULL,
  ALTER COLUMN "actorType" SET NOT NULL,
  ALTER COLUMN "delta" SET NOT NULL,
  ALTER COLUMN "onHandBefore" SET NOT NULL,
  ALTER COLUMN "onHandAfter" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" SET NOT NULL,
  ALTER COLUMN "batchId" SET NOT NULL,
  ALTER COLUMN "referenceType" TYPE VARCHAR(80),
  ALTER COLUMN "referenceId" TYPE VARCHAR(120),
  ALTER COLUMN "reason" TYPE VARCHAR(500);

DROP TABLE "InventoryHistory";
DROP TABLE "Reservation";
DROP TYPE "ReservationType";
DROP TYPE "ReservationStatus";

CREATE TABLE "MedicineReservation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "subjectUserId" UUID NOT NULL,
  "status" "MedicineReservationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3), "readyAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3), "expiredAt" TIMESTAMP(3),
  "notes" VARCHAR(500), "idempotencyKey" VARCHAR(120) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MedicineReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MedicineReservationItem" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "reservationId" UUID NOT NULL,
  "providerId" UUID NOT NULL, "productId" UUID NOT NULL, "quantity" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicineReservationItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MedicineReservationAllocation" (
  "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "reservationId" UUID NOT NULL,
  "itemId" UUID NOT NULL, "inventoryId" UUID NOT NULL, "batchId" UUID NOT NULL,
  "providerId" UUID NOT NULL, "productId" UUID NOT NULL, "quantity" INTEGER NOT NULL,
  "status" "MedicineAllocationStatus" NOT NULL DEFAULT 'HELD',
  "consumedAt" TIMESTAMP(3), "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicineReservationAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Provider_id_tenantId_key" ON "Provider"("id", "tenantId");
CREATE UNIQUE INDEX "Inventory_id_tenantId_providerId_productId_key"
  ON "Inventory"("id", "tenantId", "providerId", "productId");
CREATE UNIQUE INDEX "Inventory_tenantId_providerId_productId_key"
  ON "Inventory"("tenantId", "providerId", "productId");
CREATE INDEX "Inventory_tenantId_providerId_productId_idx"
  ON "Inventory"("tenantId", "providerId", "productId");
CREATE INDEX "Inventory_tenantId_providerId_isVisible_idx"
  ON "Inventory"("tenantId", "providerId", "isVisible");

CREATE UNIQUE INDEX "Batch_tenantId_providerId_productId_batchNumber_key"
  ON "Batch"("tenantId", "providerId", "productId", "batchNumber");
CREATE UNIQUE INDEX "Batch_id_tenantId_inventoryId_providerId_productId_key"
  ON "Batch"("id", "tenantId", "inventoryId", "providerId", "productId");
CREATE INDEX "Batch_tenantId_providerId_productId_status_expiryDate_manuf_idx"
  ON "Batch"("tenantId", "providerId", "productId", "status", "expiryDate", "manufacturingDate", "createdAt", "id");
CREATE INDEX "Batch_inventoryId_status_expiryDate_idx"
  ON "Batch"("inventoryId", "status", "expiryDate");

CREATE UNIQUE INDEX "StockMovement_tenantId_idempotencyKey_key"
  ON "StockMovement"("tenantId", "idempotencyKey");
CREATE INDEX "StockMovement_tenantId_inventoryId_occurredAt_id_idx"
  ON "StockMovement"("tenantId", "inventoryId", "occurredAt" DESC, "id" DESC);
CREATE INDEX "StockMovement_tenantId_batchId_occurredAt_id_idx"
  ON "StockMovement"("tenantId", "batchId", "occurredAt" DESC, "id" DESC);
CREATE INDEX "StockMovement_tenantId_providerId_productId_occurredAt_idx"
  ON "StockMovement"("tenantId", "providerId", "productId", "occurredAt" DESC);
CREATE INDEX "StockMovement_actorMembershipId_occurredAt_idx"
  ON "StockMovement"("actorMembershipId", "occurredAt" DESC);

CREATE UNIQUE INDEX "MedicineReservation_tenantId_idempotencyKey_key"
  ON "MedicineReservation"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "MedicineReservation_id_tenantId_providerId_key"
  ON "MedicineReservation"("id", "tenantId", "providerId");
CREATE INDEX "MedicineReservation_tenantId_providerId_status_expiresAt_id_idx"
  ON "MedicineReservation"("tenantId", "providerId", "status", "expiresAt", "id");
CREATE INDEX "MedicineReservation_subjectUserId_createdAt_id_idx"
  ON "MedicineReservation"("subjectUserId", "createdAt" DESC, "id" DESC);
CREATE INDEX "MedicineReservation_tenantId_status_expiresAt_id_idx"
  ON "MedicineReservation"("tenantId", "status", "expiresAt", "id");
CREATE UNIQUE INDEX "MedicineReservationItem_reservationId_productId_key"
  ON "MedicineReservationItem"("reservationId", "productId");
CREATE UNIQUE INDEX "MedicineReservationItem_id_tenantId_reservationId_providerI_key"
  ON "MedicineReservationItem"("id", "tenantId", "reservationId", "providerId", "productId");
CREATE INDEX "MedicineReservationItem_tenantId_providerId_productId_idx"
  ON "MedicineReservationItem"("tenantId", "providerId", "productId");
CREATE UNIQUE INDEX "MedicineReservationAllocation_itemId_batchId_key"
  ON "MedicineReservationAllocation"("itemId", "batchId");
CREATE INDEX "MedicineReservationAllocation_tenantId_reservationId_status_idx"
  ON "MedicineReservationAllocation"("tenantId", "reservationId", "status");
CREATE INDEX "MedicineReservationAllocation_tenantId_batchId_status_idx"
  ON "MedicineReservationAllocation"("tenantId", "batchId", "status");

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_providerId_tenantId_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_inventoryId_tenantId_providerId_productId_fkey"
  FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_providerId_tenantId_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_inventoryId_tenantId_providerId_productId_fkey"
  FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_tenantId_inventoryId_providerId_prod_fkey"
  FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_providerId_tenantId_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorMembershipId_tenantId_fkey"
  FOREIGN KEY ("actorMembershipId", "tenantId") REFERENCES "TenantMembership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicineReservation" ADD CONSTRAINT "MedicineReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservation" ADD CONSTRAINT "MedicineReservation_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservation" ADD CONSTRAINT "MedicineReservation_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationItem" ADD CONSTRAINT "MedicineReservationItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationItem" ADD CONSTRAINT "MedicineReservationItem_reservationId_tenantId_providerId_fkey" FOREIGN KEY ("reservationId", "tenantId", "providerId") REFERENCES "MedicineReservation"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationItem" ADD CONSTRAINT "MedicineReservationItem_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationItem" ADD CONSTRAINT "MedicineReservationItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_reservationId_tenantId_provi_fkey" FOREIGN KEY ("reservationId", "tenantId", "providerId") REFERENCES "MedicineReservation"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_itemId_tenantId_reservationI_fkey" FOREIGN KEY ("itemId", "tenantId", "reservationId", "providerId", "productId") REFERENCES "MedicineReservationItem"("id", "tenantId", "reservationId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_inventoryId_tenantId_provide_fkey" FOREIGN KEY ("inventoryId", "tenantId", "providerId", "productId") REFERENCES "Inventory"("id", "tenantId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_batchId_tenantId_inventoryId_fkey" FOREIGN KEY ("batchId", "tenantId", "inventoryId", "providerId", "productId") REFERENCES "Batch"("id", "tenantId", "inventoryId", "providerId", "productId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_providerId_tenantId_fkey" FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ADR-005 permits a tenant-scoped SYSTEM actor only for reviewed workers such
-- as reservation expiry. All user actor identifiers remain absent.
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_actor_scope_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor_scope_check" CHECK (
  (
    "scope" = 'TENANT' AND "actorType" = 'TENANT_USER'
    AND "tenantId" IS NOT NULL AND "actorMembershipId" IS NOT NULL
    AND "platformActorUserId" IS NULL
  ) OR (
    "scope" = 'TENANT' AND "actorType" = 'SYSTEM'
    AND "tenantId" IS NOT NULL AND "actorMembershipId" IS NULL
    AND "platformActorUserId" IS NULL
  ) OR (
    "scope" = 'PLATFORM' AND "actorType" = 'PLATFORM_USER'
    AND "tenantId" IS NULL AND "actorMembershipId" IS NULL
    AND "platformActorUserId" IS NOT NULL
  ) OR (
    "scope" = 'PLATFORM' AND "actorType" = 'SYSTEM'
    AND "tenantId" IS NULL AND "actorMembershipId" IS NULL
    AND "platformActorUserId" IS NULL
  )
);

ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_event_type_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_event_type_check" CHECK (
  "eventType" IN (
    'authorization.role.created',
    'authorization.role.updated',
    'authorization.role.deleted',
    'authorization.assignment.added',
    'authorization.assignment.removed',
    'authorization.permission.denied',
    'authentication.session.created',
    'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed',
    'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded',
    'authentication.sessions.logout.succeeded',
    'inventory.batch.received',
    'inventory.stock.adjusted',
    'inventory.reservation.created',
    'inventory.reservation.confirmed',
    'inventory.reservation.ready',
    'inventory.reservation.completed',
    'inventory.reservation.cancelled',
    'inventory.reservation.expired'
  )
);

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_values_check" CHECK (
  "sellingPrice" >= 0 AND "mrp" >= 0 AND "discountPercentage" BETWEEN 0 AND 100
  AND "taxPercentage" BETWEEN 0 AND 100 AND "minimumStockLevel" >= 0 AND "version" > 0
);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_quantities_check" CHECK (
  "receivedQuantity" > 0 AND "onHandQuantity" >= 0 AND "heldQuantity" >= 0
  AND "heldQuantity" <= "onHandQuantity" AND "receivedQuantity" >= "onHandQuantity"
);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_dates_prices_version_check" CHECK (
  ("manufacturingDate" IS NULL OR "manufacturingDate" < "expiryDate")
  AND "purchasePrice" >= 0 AND "sellingPrice" >= 0 AND "version" > 0
);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_equation_check" CHECK (
  "delta" <> 0 AND "onHandBefore" >= 0 AND "onHandAfter" >= 0
  AND "onHandAfter" = "onHandBefore" + "delta"
);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actor_check" CHECK (
  ("actorType" = 'TENANT_USER' AND "actorMembershipId" IS NOT NULL)
  OR ("actorType" = 'SYSTEM' AND "actorMembershipId" IS NULL)
);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reference_pair_check" CHECK (
  ("referenceType" IS NULL) = ("referenceId" IS NULL)
);
ALTER TABLE "MedicineReservation" ADD CONSTRAINT "MedicineReservation_values_check" CHECK (
  "version" > 0 AND "expiresAt" > "createdAt"
);
ALTER TABLE "MedicineReservation" ADD CONSTRAINT "MedicineReservation_state_check" CHECK (
  ("status" = 'PENDING' AND "confirmedAt" IS NULL AND "readyAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NULL)
  OR ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND "readyAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NULL)
  OR ("status" = 'READY' AND "confirmedAt" IS NOT NULL AND "readyAt" IS NOT NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NULL)
  OR ("status" = 'COMPLETED' AND "confirmedAt" IS NOT NULL AND "readyAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NULL)
  OR ("status" = 'CANCELLED' AND "completedAt" IS NULL AND "cancelledAt" IS NOT NULL AND "expiredAt" IS NULL)
  OR ("status" = 'EXPIRED' AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "expiredAt" IS NOT NULL)
);
ALTER TABLE "MedicineReservation" ADD CONSTRAINT "MedicineReservation_timeline_check" CHECK (
  ("confirmedAt" IS NULL OR "confirmedAt" >= "createdAt")
  AND ("readyAt" IS NULL OR ("confirmedAt" IS NOT NULL AND "readyAt" >= "confirmedAt"))
  AND ("completedAt" IS NULL OR ("readyAt" IS NOT NULL AND "completedAt" >= "readyAt"))
  AND ("cancelledAt" IS NULL OR "cancelledAt" >= "createdAt")
  AND ("expiredAt" IS NULL OR "expiredAt" >= "createdAt")
);
ALTER TABLE "MedicineReservationItem" ADD CONSTRAINT "MedicineReservationItem_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "MedicineReservationAllocation" ADD CONSTRAINT "MedicineReservationAllocation_state_check" CHECK (
  "quantity" > 0 AND (
    ("status" = 'HELD' AND "consumedAt" IS NULL AND "releasedAt" IS NULL)
    OR ("status" = 'CONSUMED' AND "consumedAt" IS NOT NULL AND "releasedAt" IS NULL)
    OR ("status" = 'RELEASED' AND "consumedAt" IS NULL AND "releasedAt" IS NOT NULL)
  )
);

CREATE OR REPLACE FUNCTION reject_stock_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'StockMovement is append-only';
END $$;
CREATE TRIGGER "StockMovement_append_only"
BEFORE UPDATE OR DELETE ON "StockMovement"
FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_mutation();
