-- Gate 10: Intelligent Medicine Marketplace, Smart Cart Aggregation & Cross-Pharmacy Fulfillment Engine
--
-- Adds pharmacy storefronts, marketplace product listings, unified shopping carts,
-- cross-pharmacy order management, intelligent fulfillment strategies, and
-- delivery assignment for nationwide medicine marketplace operations.

-- === Enums ===

CREATE TYPE "CartStatus" AS ENUM (
  'ACTIVE',
  'CHECKOUT',
  'COMPLETED',
  'ABANDONED'
);

CREATE TYPE "MarketplaceOrderStatus" AS ENUM (
  'PENDING',
  'CONFIRMED',
  'RESERVED',
  'APPROVAL_REQUIRED',
  'APPROVED',
  'PAID',
  'FULFILLED',
  'CANCELLED',
  'REFUNDED'
);

CREATE TYPE "FulfillmentStrategy" AS ENUM (
  'SINGLE_PHARMACY',
  'SPLIT',
  'SUBSTITUTION'
);

CREATE TYPE "DeliveryStatus" AS ENUM (
  'PENDING',
  'ASSIGNED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED'
);

CREATE TYPE "ProductVisibility" AS ENUM (
  'PUBLIC',
  'PRIVATE',
  'UNLISTED'
);

-- === Tables ===

CREATE TABLE "pharmacy_stores" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "operatingHours" JSONB,
    "deliveryRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "supportsPickup" BOOLEAN NOT NULL DEFAULT true,
    "supportsDelivery" BOOLEAN NOT NULL DEFAULT true,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pharmacy_stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_products" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pharmacyId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sellingPrice" DECIMAL(10, 2) NOT NULL,
    "availableQuantity" INTEGER NOT NULL DEFAULT 0,
    "estimatedPreparationTime" INTEGER NOT NULL DEFAULT 30,
    "visibility" "ProductVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shopping_carts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shopping_cart_items" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "selectedPharmacyId" UUID,
    "allocatedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_cart_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10, 2) NOT NULL DEFAULT 0,
    "fulfillmentStrategy" "FulfillmentStrategy" NOT NULL DEFAULT 'SINGLE_PHARMACY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cartId" UUID,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "pharmacyId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reservedBatchId" UUID,
    "sellingPrice" DECIMAL(10, 2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "delivery_assignments" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "deliveryPartner" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedArrival" TIMESTAMP(3, 3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_assignments_pkey" PRIMARY KEY ("id")
);

-- === Foreign Keys ===

ALTER TABLE "pharmacy_stores"
    ADD CONSTRAINT "pharmacy_stores_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_products"
    ADD CONSTRAINT "marketplace_products_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_products"
    ADD CONSTRAINT "marketplace_products_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacy_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_products"
    ADD CONSTRAINT "marketplace_products_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shopping_carts"
    ADD CONSTRAINT "shopping_carts_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shopping_cart_items"
    ADD CONSTRAINT "shopping_cart_items_cartId_fkey"
    FOREIGN KEY ("cartId") REFERENCES "shopping_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shopping_cart_items"
    ADD CONSTRAINT "shopping_cart_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shopping_cart_items"
    ADD CONSTRAINT "shopping_cart_items_selectedPharmacyId_fkey"
    FOREIGN KEY ("selectedPharmacyId") REFERENCES "pharmacy_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_cartId_fkey"
    FOREIGN KEY ("cartId") REFERENCES "shopping_carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "marketplace_order_items"
    ADD CONSTRAINT "marketplace_order_items_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "marketplace_order_items"
    ADD CONSTRAINT "marketplace_order_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "marketplace_order_items"
    ADD CONSTRAINT "marketplace_order_items_pharmacyId_fkey"
    FOREIGN KEY ("pharmacyId") REFERENCES "pharmacy_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_assignments"
    ADD CONSTRAINT "delivery_assignments_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === Unique Constraints ===

ALTER TABLE "marketplace_products"
    ADD CONSTRAINT "marketplace_products_tenantId_pharmacyId_productId_key"
    UNIQUE ("tenantId", "pharmacyId", "productId");

ALTER TABLE "marketplace_orders"
    ADD CONSTRAINT "marketplace_orders_tenantId_orderNumber_key"
    UNIQUE ("tenantId", "orderNumber");

ALTER TABLE "delivery_assignments"
    ADD CONSTRAINT "delivery_assignments_orderId_key"
    UNIQUE ("orderId");

-- === Indexes ===

CREATE INDEX "pharmacy_stores_tenantId_idx"
    ON "pharmacy_stores"("tenantId");

CREATE INDEX "pharmacy_stores_isActive_idx"
    ON "pharmacy_stores"("isActive");

CREATE INDEX "pharmacy_stores_latitude_longitude_idx"
    ON "pharmacy_stores"("latitude", "longitude");

CREATE INDEX "marketplace_products_tenantId_productId_idx"
    ON "marketplace_products"("tenantId", "productId");

CREATE INDEX "marketplace_products_tenantId_pharmacyId_idx"
    ON "marketplace_products"("tenantId", "pharmacyId");

CREATE INDEX "marketplace_products_visibility_idx"
    ON "marketplace_products"("visibility");

CREATE INDEX "shopping_carts_tenantId_patientId_idx"
    ON "shopping_carts"("tenantId", "patientId");

CREATE INDEX "shopping_carts_tenantId_status_idx"
    ON "shopping_carts"("tenantId", "status");

CREATE INDEX "shopping_cart_items_cartId_idx"
    ON "shopping_cart_items"("cartId");

CREATE INDEX "shopping_cart_items_productId_idx"
    ON "shopping_cart_items"("productId");

CREATE INDEX "shopping_cart_items_cartId_productId_idx"
    ON "shopping_cart_items"("cartId", "productId");

CREATE INDEX "marketplace_orders_tenantId_patientId_idx"
    ON "marketplace_orders"("tenantId", "patientId");

CREATE INDEX "marketplace_orders_tenantId_status_idx"
    ON "marketplace_orders"("tenantId", "status");

CREATE INDEX "marketplace_orders_createdAt_idx"
    ON "marketplace_orders"("createdAt");

CREATE INDEX "marketplace_order_items_orderId_idx"
    ON "marketplace_order_items"("orderId");

CREATE INDEX "marketplace_order_items_pharmacyId_idx"
    ON "marketplace_order_items"("pharmacyId");

CREATE INDEX "marketplace_order_items_productId_idx"
    ON "marketplace_order_items"("productId");

CREATE INDEX "delivery_assignments_orderId_idx"
    ON "delivery_assignments"("orderId");

CREATE INDEX "delivery_assignments_deliveryPartner_idx"
    ON "delivery_assignments"("deliveryPartner");

CREATE INDEX "delivery_assignments_status_idx"
    ON "delivery_assignments"("status");
