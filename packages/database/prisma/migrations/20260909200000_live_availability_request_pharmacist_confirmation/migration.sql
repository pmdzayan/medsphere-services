-- Task 0026: Live Availability Request & Pharmacist Confirmation.
--
-- Adds the provider/product-level live evidence model Task 0025 deliberately
-- reserved: a patient asks the pharmacy "do you currently have this product",
-- exactly one live request reaches that provider's operational queue, an
-- authorized pharmacist answers AVAILABLE / UNAVAILABLE / CHECK_LATER, the
-- patient sees a recent pharmacy-confirmed result, and the confirmation
-- expires automatically after its bounded validity window.
--
-- Invariants preserved from Task 0025:
-- * Batch remains the sole quantity authority. This migration adds NO
--   quantity column, does NOT touch Batch on-hand/held quantities, and
--   creates no StockMovement. Pharmacist evidence is provider/product-level
--   temporary evidence and is NEVER written to BatchStockObservation.
-- * No historical pharmacist evidence is fabricated: the new tables start
--   empty and no existing inventory is marked confirmed.
--
-- Authorization: two dedicated least-privilege permissions
-- (`inventory.availability-requests.read` / `.manage`) are added to the
-- accepted permission catalogue and granted to the same built-in
-- TENANT_ADMINISTRATOR system role using the exact policy every other
-- pharmacy operational capability uses.

CREATE TYPE "AvailabilityRequestStatus" AS ENUM (
  'PENDING',
  'RESPONDED',
  'EXPIRED'
);

CREATE TYPE "PharmacistConfirmationOutcome" AS ENUM (
  'AVAILABLE',
  'UNAVAILABLE',
  'CHECK_LATER'
);

CREATE TYPE "ProviderProductAvailabilityEvidenceSource" AS ENUM (
  'PHARMACIST_CONFIRMATION'
);

CREATE TABLE "AvailabilityRequest" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "status" "AvailabilityRequestStatus" NOT NULL DEFAULT 'PENDING',
  "activeDedupKey" VARCHAR(80),
  "requestedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "respondedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AvailabilityRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AvailabilityRequest_values_check" CHECK (
    "version" >= 1
    AND "requestedAt" < "expiresAt"
  ),
  CONSTRAINT "AvailabilityRequest_dedup_lifecycle_check" CHECK (
    ("status" = 'PENDING' AND "activeDedupKey" IS NOT NULL)
    OR ("status" IN ('RESPONDED', 'EXPIRED') AND "activeDedupKey" IS NULL)
  ),
  CONSTRAINT "AvailabilityRequest_dedup_format_check" CHECK (
    "activeDedupKey" IS NULL
    OR "activeDedupKey" ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  )
);
CREATE TABLE "ProviderProductAvailabilityEvidence" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "availabilityRequestId" UUID NOT NULL,
  "source" "ProviderProductAvailabilityEvidenceSource" NOT NULL,
  "outcome" "PharmacistConfirmationOutcome" NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3),
  "retryAfterAt" TIMESTAMP(3),
  "responderMembershipId" UUID NOT NULL,
  "responderUserId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "commandHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderProductAvailabilityEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderProductAvailabilityEvidence_values_check" CHECK (
    length("idempotencyKey") BETWEEN 1 AND 120
    AND "idempotencyKey" = btrim("idempotencyKey")
    AND length("commandHash") = 64
    AND "confirmedAt" <= CURRENT_TIMESTAMP + INTERVAL '5 minutes'
    AND (
      ("outcome" IN ('AVAILABLE', 'UNAVAILABLE')
        AND "validUntil" IS NOT NULL
        AND "validUntil" > "confirmedAt"
        AND "retryAfterAt" IS NULL)
      OR ("outcome" = 'CHECK_LATER'
        AND "validUntil" IS NULL
        AND "retryAfterAt" IS NOT NULL
        AND "retryAfterAt" > "confirmedAt")
    )
  )
);

-- One effective PENDING request per tenant/provider/product: the unique
-- activeDedupKey column (set only while PENDING) makes concurrent public
-- request creation converge on a single request. See schema.prisma model doc.
CREATE UNIQUE INDEX "AvailabilityRequest_activeDedupKey_key"
  ON "AvailabilityRequest"("activeDedupKey");
CREATE INDEX "AvailabilityRequest_tenant_provider_product_status_idx"
  ON "AvailabilityRequest"("tenantId", "providerId", "productId", "status");
CREATE INDEX "AvailabilityRequest_tenant_provider_status_requested_idx"
  ON "AvailabilityRequest"("tenantId", "providerId", "status", "requestedAt", "id");
CREATE INDEX "AvailabilityRequest_tenant_status_expiresAt_idx"
  ON "AvailabilityRequest"("tenantId", "status", "expiresAt");

ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_id_tenantId_key"
  UNIQUE ("id", "tenantId");
ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_id_tenant_provider_product_key"
  UNIQUE ("id", "tenantId", "providerId", "productId");

ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_provider_scope_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ProviderProductEvidence_tenant_provider_product_created_idx"
  ON "ProviderProductAvailabilityEvidence"("tenantId", "providerId", "productId", "createdAt" DESC, "id" DESC);
CREATE INDEX "ProviderProductEvidence_requestId_idx"
  ON "ProviderProductAvailabilityEvidence"("availabilityRequestId");
CREATE INDEX "ProviderProductEvidence_tenant_validUntil_idx"
  ON "ProviderProductAvailabilityEvidence"("tenantId", "validUntil", "createdAt");
CREATE INDEX "ProviderProductEvidence_tenant_retryAfter_idx"
  ON "ProviderProductAvailabilityEvidence"("tenantId", "retryAfterAt", "createdAt");
CREATE INDEX "ProviderProductEvidence_responder_created_idx"
  ON "ProviderProductAvailabilityEvidence"("responderMembershipId", "createdAt" DESC);

ALTER TABLE "ProviderProductAvailabilityEvidence" ADD CONSTRAINT "ProviderProductAvailabilityEvidence_tenantId_idempotencyKey_key"
  UNIQUE ("tenantId", "idempotencyKey");

ALTER TABLE "ProviderProductAvailabilityEvidence" ADD CONSTRAINT "ProviderProductAvailabilityEvidence_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderProductAvailabilityEvidence" ADD CONSTRAINT "ProviderProductAvailabilityEvidence_provider_scope_fkey"
  FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderProductAvailabilityEvidence" ADD CONSTRAINT "ProviderProductAvailabilityEvidence_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderProductAvailabilityEvidence" ADD CONSTRAINT "ProviderProductAvailabilityEvidence_request_scope_fkey"
  FOREIGN KEY ("availabilityRequestId", "tenantId", "providerId", "productId")
  REFERENCES "AvailabilityRequest"("id", "tenantId", "providerId", "productId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderProductAvailabilityEvidence" ADD CONSTRAINT "ProviderProductAvailabilityEvidence_responder_scope_fkey"
  FOREIGN KEY ("responderMembershipId", "responderUserId", "tenantId") REFERENCES "TenantMembership"("id", "userId", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderProductAvailabilityEvidence" ADD CONSTRAINT "ProviderProductAvailabilityEvidence_responderUserId_fkey"
  FOREIGN KEY ("responderUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Live evidence is immutable: a pharmacist correcting an earlier answer
-- appends newer evidence rather than rewriting history.
CREATE FUNCTION "reject_provider_product_evidence_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProviderProductAvailabilityEvidence is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ProviderProductAvailabilityEvidence_append_only"
  BEFORE UPDATE OR DELETE ON "ProviderProductAvailabilityEvidence"
  FOR EACH ROW EXECUTE FUNCTION "reject_provider_product_evidence_mutation"();
-- Least-privilege permission catalogue (same seeding policy every pharmacy
-- operational capability uses: dedicated permissions granted to the built-in
-- TENANT_ADMINISTRATOR system role).
ALTER TABLE "Permission"
DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:inventory.availability-requests.read')::uuid,
    'inventory.availability-requests.read',
    'Read live availability requests for an assigned provider'
  ),
  (
    md5('medsphere:permission:inventory.availability-requests.manage')::uuid,
    'inventory.availability-requests.manage',
    'Respond to live availability requests for an assigned provider'
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
  AND p."name" IN (
    'inventory.availability-requests.read',
    'inventory.availability-requests.manage'
  );

-- Extend the immutable DB-level audit-event allowlist with the Task 0026
-- responder audit event (append-only, preserving every prior accepted type).
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
    'inventory.listing.configured', 'inventory.batch.received',
    'inventory.stock.adjusted', 'inventory.stock.transferred',
    'inventory.stock.damaged', 'inventory.batch.expired', 'inventory.batch.quarantined',
    'inventory.reservation.created', 'inventory.reservation.confirmed',
    'inventory.reservation.ready', 'inventory.reservation.completed',
    'inventory.reservation.cancelled', 'inventory.reservation.expired',
    'inventory.availability-request.responded',
    'platform.authentication.session.created',
    'platform.authentication.session.refresh.succeeded',
    'platform.authentication.session.refresh.failed',
    'platform.authentication.session.refresh.replayed',
    'platform.authentication.session.logout.succeeded',
    'platform.authentication.session.locked',
    'platform.authentication.session.unlocked',
    'platform.invitation.created', 'platform.invitation.revoked', 'platform.invitation.accepted',
    'platform.role.assigned', 'platform.admin.suspended', 'platform.admin.reactivated',
    'platform.session.revoked', 'platform.owner.bootstrap'
  ));
