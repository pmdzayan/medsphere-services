-- Task 0046 — Notification Operations & Pickup Handoff
--
-- Adds only the pickup authorization/evidence state required to bind an
-- authenticated patient's READY reservation to the existing atomic POS sale.
-- Plaintext pickup tokens are never stored.

CREATE TYPE "MedicinePickupVerificationMethod" AS ENUM ('ONE_TIME_TOKEN');

-- Exact subject scope for pickup relations.
CREATE UNIQUE INDEX "MedicineReservation_id_tenantId_providerId_subjectUserId_key"
  ON "MedicineReservation" ("id", "tenantId", "providerId", "subjectUserId");

CREATE TABLE "MedicinePickupToken" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "reservationId" UUID NOT NULL,
  "subjectUserId" UUID NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MedicinePickupToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicinePickupToken_version_check" CHECK ("tokenVersion" >= 1),
  CONSTRAINT "MedicinePickupToken_hash_check" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "MedicinePickupToken_time_check" CHECK (
    "expiresAt" > "issuedAt"
    AND ("consumedAt" IS NULL OR "consumedAt" >= "issuedAt")
  )
);

CREATE UNIQUE INDEX "MedicinePickupToken_reservationId_key"
  ON "MedicinePickupToken" ("reservationId");
CREATE UNIQUE INDEX "MedicinePickupToken_tokenHash_key"
  ON "MedicinePickupToken" ("tokenHash");
CREATE UNIQUE INDEX "MedicinePickupToken_reservation_scope_key"
  ON "MedicinePickupToken" ("reservationId", "tenantId", "providerId");
CREATE INDEX "MedicinePickupToken_tenant_provider_expires_idx"
  ON "MedicinePickupToken" ("tenantId", "providerId", "expiresAt");
CREATE INDEX "MedicinePickupToken_subject_consumed_expires_idx"
  ON "MedicinePickupToken" ("subjectUserId", "consumedAt", "expiresAt");

CREATE TABLE "MedicinePickupHandoff" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "reservationId" UUID NOT NULL,
  "subjectUserId" UUID NOT NULL,
  "saleId" UUID NOT NULL,
  "verifiedByMembershipId" UUID NOT NULL,
  "verificationMethod" "MedicinePickupVerificationMethod" NOT NULL DEFAULT 'ONE_TIME_TOKEN',
  "tokenVersion" INTEGER NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MedicinePickupHandoff_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MedicinePickupHandoff_token_version_check" CHECK ("tokenVersion" >= 1)
);

CREATE UNIQUE INDEX "MedicinePickupHandoff_reservationId_key"
  ON "MedicinePickupHandoff" ("reservationId");
CREATE UNIQUE INDEX "MedicinePickupHandoff_saleId_key"
  ON "MedicinePickupHandoff" ("saleId");
CREATE UNIQUE INDEX "MedicinePickupHandoff_reservation_scope_key"
  ON "MedicinePickupHandoff" ("reservationId", "tenantId", "providerId");
CREATE INDEX "MedicinePickupHandoff_tenant_provider_verified_idx"
  ON "MedicinePickupHandoff" ("tenantId", "providerId", "verifiedAt" DESC);
CREATE INDEX "MedicinePickupHandoff_subject_verified_idx"
  ON "MedicinePickupHandoff" ("subjectUserId", "verifiedAt" DESC);

ALTER TABLE "MedicinePickupToken"
  ADD CONSTRAINT "MedicinePickupToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupToken"
  ADD CONSTRAINT "MedicinePickupToken_provider_scope_fkey"
  FOREIGN KEY ("providerId", "tenantId")
  REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupToken"
  ADD CONSTRAINT "MedicinePickupToken_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupToken"
  ADD CONSTRAINT "MedicinePickupToken_reservation_subject_scope_fkey"
  FOREIGN KEY ("reservationId", "tenantId", "providerId", "subjectUserId")
  REFERENCES "MedicineReservation"("id", "tenantId", "providerId", "subjectUserId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MedicinePickupHandoff"
  ADD CONSTRAINT "MedicinePickupHandoff_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupHandoff"
  ADD CONSTRAINT "MedicinePickupHandoff_provider_scope_fkey"
  FOREIGN KEY ("providerId", "tenantId")
  REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupHandoff"
  ADD CONSTRAINT "MedicinePickupHandoff_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupHandoff"
  ADD CONSTRAINT "MedicinePickupHandoff_reservation_subject_scope_fkey"
  FOREIGN KEY ("reservationId", "tenantId", "providerId", "subjectUserId")
  REFERENCES "MedicineReservation"("id", "tenantId", "providerId", "subjectUserId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupHandoff"
  ADD CONSTRAINT "MedicinePickupHandoff_sale_scope_fkey"
  FOREIGN KEY ("saleId", "tenantId", "providerId")
  REFERENCES "PharmacySale"("id", "tenantId", "providerId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MedicinePickupHandoff"
  ADD CONSTRAINT "MedicinePickupHandoff_verified_membership_scope_fkey"
  FOREIGN KEY ("verifiedByMembershipId", "tenantId")
  REFERENCES "TenantMembership"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mutable token state permits rotation only before consumption and one final
-- unconsumed -> consumed transition. Scope can never be rewritten or deleted.
CREATE OR REPLACE FUNCTION enforce_task_0046_pickup_token_lifecycle()
RETURNS TRIGGER AS $task0046$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'MedicinePickupToken rows are not deletable';
  END IF;

  IF OLD."consumedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Consumed MedicinePickupToken rows are immutable';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."tenantId" <> OLD."tenantId"
     OR NEW."providerId" <> OLD."providerId"
     OR NEW."reservationId" <> OLD."reservationId"
     OR NEW."subjectUserId" <> OLD."subjectUserId"
  THEN
    RAISE EXCEPTION 'MedicinePickupToken scope is immutable';
  END IF;

  IF NEW."consumedAt" IS NOT NULL THEN
    IF NEW."tokenHash" <> OLD."tokenHash"
       OR NEW."tokenVersion" <> OLD."tokenVersion"
       OR NEW."issuedAt" <> OLD."issuedAt"
       OR NEW."expiresAt" <> OLD."expiresAt"
    THEN
      RAISE EXCEPTION 'MedicinePickupToken consumption cannot rewrite token authority';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."tokenVersion" <> OLD."tokenVersion" + 1
     OR NEW."tokenHash" = OLD."tokenHash"
     OR NEW."issuedAt" < OLD."issuedAt"
     OR NEW."expiresAt" <= NEW."issuedAt"
  THEN
    RAISE EXCEPTION 'MedicinePickupToken rotation is invalid';
  END IF;

  RETURN NEW;
END;
$task0046$ LANGUAGE plpgsql;

CREATE TRIGGER "MedicinePickupToken_lifecycle_guard"
BEFORE UPDATE OR DELETE ON "MedicinePickupToken"
FOR EACH ROW EXECUTE FUNCTION enforce_task_0046_pickup_token_lifecycle();

CREATE OR REPLACE FUNCTION reject_task_0046_pickup_handoff_mutation()
RETURNS TRIGGER AS $task0046$
BEGIN
  RAISE EXCEPTION 'MedicinePickupHandoff is append-only';
END;
$task0046$ LANGUAGE plpgsql;

CREATE TRIGGER "MedicinePickupHandoff_append_only"
BEFORE UPDATE OR DELETE ON "MedicinePickupHandoff"
FOR EACH ROW EXECUTE FUNCTION reject_task_0046_pickup_handoff_mutation();

-- Extend exact-user audit evidence with bounded pickup events only.
ALTER TABLE "AuditEvent"
  DROP CONSTRAINT "AuditEvent_event_type_check";

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_event_type_check"
  CHECK ("eventType" IN (
    'authorization.role.created',
    'authorization.role.updated',
    'authorization.role.deleted',
    'authorization.assignment.added',
    'authorization.assignment.removed',
    'authorization.provider-access.added',
    'authorization.provider-access.removed',
    'authorization.permission.denied',
    'authorization.membership.suspended',
    'authorization.membership.revoked',
    'platform.authentication.session.created',
    'platform.authentication.session.refresh.succeeded',
    'platform.authentication.session.refresh.failed',
    'platform.authentication.session.refresh.replayed',
    'platform.authentication.session.logout.succeeded',
    'platform.authentication.session.locked',
    'platform.authentication.session.unlocked',
    'platform.invitation.created',
    'platform.invitation.revoked',
    'platform.invitation.accepted',
    'platform.role.assigned',
    'platform.admin.suspended',
    'platform.admin.reactivated',
    'platform.session.revoked',
    'platform.owner.bootstrap',
    'authentication.session.created',
    'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed',
    'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded',
    'authentication.sessions.logout.succeeded',
    'authentication.session.locked',
    'authentication.session.unlocked',
    'authentication.session.unlock.failed',
    'authentication.session.logout.locked',
    'authentication.session.switched',
    'authentication.session.reauthenticated',
    'authentication.verification.completed',
    'authentication.account.activated',
    'authentication.otp.requested',
    'authentication.organization.join.requested',
    'authentication.organization.join.code.rejected',
    'authentication.organization.join.code.issued',
    'authentication.organization.join.code.revoked',
    'privacy.consent.granted',
    'privacy.consent.withdrawn',
    'privacy.preference.changed',
    'inventory.listing.configured',
    'patient.profile.updated',
    'inventory.batch.received',
    'inventory.stock.adjusted',
    'inventory.stock.transferred',
    'inventory.stock.damaged',
    'inventory.batch.expired',
    'inventory.batch.quarantined',
    'inventory.batch.recalled',
    'inventory.exception.requested',
    'inventory.exception.approved',
    'inventory.exception.rejected',
    'inventory.reservation.created',
    'inventory.reservation.confirmed',
    'inventory.reservation.ready',
    'inventory.reservation.completed',
    'inventory.reservation.cancelled',
    'inventory.reservation.expired',
    'inventory.pickup.token.issued',
    'inventory.pickup.handoff.completed',
    'inventory.availability-request.responded',
    'inventory.availability-request.preference.configured',
    'inventory.import.staged',
    'inventory.import.applied',
    'billing.pos.fiscal-profile.configured',
    'billing.pos.inventory-fiscal-profile.configured',
    'billing.pos.sale.completed',
    'billing.pos.invoice.reprinted',
    'billing.pos.sale.voided',
    'billing.pos.return.completed',
    'pharmacy.verification.submitted',
    'pharmacy.verification.resubmitted',
    'pharmacy.verification.review-started',
    'pharmacy.verification.approved',
    'pharmacy.verification.rejected',
    'pharmacy.verification.suspended',
    'pharmacy.verification.expired',
    'compliance.policy.revised',
    'compliance.legal-hold.placed',
    'compliance.legal-hold.released',
    'compliance.policy.evaluated',
    'compliance.disposition.processed'
  ));
