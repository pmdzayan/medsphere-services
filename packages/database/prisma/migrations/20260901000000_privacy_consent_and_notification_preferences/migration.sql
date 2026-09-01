-- Task 0013: privacy, consent & device permission controls.
--
-- 1. Adds two new MedSphere-preference fields to UserPrivacy (notification
--    category opt-ins, distinct from browser permission state, which is
--    never persisted here or anywhere else).
-- 2. Adds an append-only ConsentRecord log: a withdrawal is always a new
--    row, never an update/delete of a prior grant, so historical consent
--    evidence is preserved even after withdrawal.

ALTER TABLE "UserPrivacy"
  ADD COLUMN "wantsReservationNotifications" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wantsOperationalAlerts" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "ConsentCategory" AS ENUM (
  'LOCATION_USE',
  'NOTIFICATIONS_RESERVATIONS',
  'NOTIFICATIONS_OPERATIONAL'
);

CREATE TYPE "ConsentStatus" AS ENUM (
  'GRANTED',
  'WITHDRAWN'
);

CREATE TABLE "ConsentRecord" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "category" "ConsentCategory" NOT NULL,
  "status" "ConsentStatus" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "source" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentRecord_userId_category_createdAt_idx"
  ON "ConsentRecord"("userId", "category", "createdAt");

ALTER TABLE "ConsentRecord"
  ADD CONSTRAINT "ConsentRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Append-only enforcement at the database level, mirroring the existing
-- StockMovement/AuditEvent/Permission tamper-protection convention: once
-- written, a ConsentRecord can never be updated or deleted, even by a
-- future application bug -- only ever superseded by a new row.
CREATE OR REPLACE FUNCTION reject_consent_record_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ConsentRecord is append-only';
END $$;
CREATE TRIGGER "ConsentRecord_append_only"
BEFORE UPDATE OR DELETE ON "ConsentRecord"
FOR EACH ROW EXECUTE FUNCTION reject_consent_record_mutation();

-- Extend the database audit-event allowlist with the Task 0013 privacy
-- events, preserving every previously accepted event type (including the
-- Task 0010 organization-join events).
ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_event_type_check";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_event_type_check" CHECK (
  "eventType" IN (
    'authorization.role.created', 'authorization.role.updated',
    'authorization.role.deleted', 'authorization.assignment.added',
    'authorization.assignment.removed', 'authorization.provider-access.added',
    'authorization.provider-access.removed', 'authorization.permission.denied',
    'authentication.session.created', 'authentication.session.refresh.succeeded',
    'authentication.session.refresh.failed', 'authentication.session.refresh.replayed',
    'authentication.session.logout.succeeded', 'authentication.sessions.logout.succeeded',
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
    'inventory.reservation.cancelled', 'inventory.reservation.expired'
  )
);