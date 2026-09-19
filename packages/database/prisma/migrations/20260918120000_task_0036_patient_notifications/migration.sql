-- Adds PatientNotification: the patient-facing IN-APP INBOX,
-- deliberately distinct from the existing NotificationDelivery /
-- NotificationDeliveryAttempt tables (which model tenant-scoped
-- SMS/email/push delivery ATTEMPTS via a staff/tenant recipient model
-- that has no patient/global-user concept). No existing table,
-- migration, or accepted field is modified. No AuditEvent CHECK
-- constraint change is required by this migration: mark-read/mark-all
-- are routine, non-accountability-requiring actions per this
-- feature's scope, and preference
-- changes are already covered by the existing
-- 'privacy.preference.changed' audit event via the existing
-- /api/settings/privacy endpoint, which this candidate reuses rather
-- than duplicates.

CREATE TYPE "PatientNotificationCategory" AS ENUM ('ACCOUNT', 'SECURITY', 'RESERVATION', 'APPOINTMENT', 'SYSTEM');
CREATE TYPE "PatientNotificationDestinationType" AS ENUM ('NONE', 'RESERVATION', 'APPOINTMENT', 'SETTINGS');

CREATE TABLE "PatientNotification" (
  "id" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "category" "PatientNotificationCategory" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "destinationType" "PatientNotificationDestinationType" NOT NULL DEFAULT 'NONE',
  "destinationId" VARCHAR(120),
  "sourceType" VARCHAR(80),
  "sourceEventId" VARCHAR(120),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientNotification_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Idempotent ingestion, compound with sourceType (a bounded VARCHAR
-- idempotency namespace identifying the producer/event source --
-- deliberately NOT PatientNotificationCategory, which is
-- patient-facing presentation classification; two independent future
-- producers could legitimately both create a RESERVATION-category
-- notification while emitting unrelated event IDs, and conflating the
-- two would let their event-ID spaces silently collide). NULLs in
-- either column are excluded from the constraint by Postgres's
-- standard NULL-distinct behavior, so non-event-sourced notifications
-- (both columns NULL) are unaffected.
CREATE UNIQUE INDEX "PatientNotification_sourceType_sourceEventId_key"
  ON "PatientNotification"("sourceType", "sourceEventId");

-- Source-pair integrity: sourceType and sourceEventId together
-- represent ONE compound event identity -- either both are set (an
-- event-sourced notification) or both are NULL (a direct, one-off
-- notification with no upstream event). A partial pair (one set, the
-- other NULL) is a producer bug, not a valid state, and is rejected at
-- the database level rather than merely by application code. Not
-- expressed in schema.prisma (this Prisma version's schema DSL has no
-- native multi-column CHECK constraint syntax used elsewhere in this
-- repository) -- this is a DB-level safety net enforced directly by
-- the migration.
ALTER TABLE "PatientNotification" ADD CONSTRAINT "PatientNotification_source_pair_integrity_check"
  CHECK (("sourceType" IS NULL) = ("sourceEventId" IS NULL));

-- Deterministic, bounded pagination: (recipientUserId, createdAt DESC, id DESC).
CREATE INDEX "PatientNotification_recipientUserId_createdAt_id_idx"
  ON "PatientNotification"("recipientUserId", "createdAt" DESC, "id" DESC);
-- Unread-count / unread-filtered listing.
CREATE INDEX "PatientNotification_recipientUserId_readAt_createdAt_id_idx"
  ON "PatientNotification"("recipientUserId", "readAt", "createdAt" DESC, "id" DESC);
