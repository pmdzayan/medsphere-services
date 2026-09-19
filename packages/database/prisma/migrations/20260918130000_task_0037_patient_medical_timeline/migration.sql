-- Adds PatientTimelineEvent: the patient-facing longitudinal history
-- projection, distinct from the operational AuditEvent table. Reads
-- are patient self-service and do not require an AuditEvent change.
--
-- No foreign key to a domain table: sourceEventId is a
-- stable string identity reference only, not a hard FK, so this table
-- does not couple the projection to a particular reservation schema.

CREATE TYPE "PatientTimelineDestinationType" AS ENUM ('NONE', 'RESERVATION', 'APPOINTMENT', 'SETTINGS');

CREATE TABLE "PatientTimelineEvent" (
  "id" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "sourceType" VARCHAR(80) NOT NULL,
  "sourceEventId" VARCHAR(120) NOT NULL,
  "eventType" VARCHAR(80) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "summary" VARCHAR(500) NOT NULL,
  "destinationType" "PatientTimelineDestinationType" NOT NULL DEFAULT 'NONE',
  "destinationId" VARCHAR(120),
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientTimelineEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientTimelineEvent_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Idempotent ingestion: (sourceType, sourceEventId) is a compound
-- namespace, not a bare global unique on sourceEventId alone -- two
-- independent producers cannot collide merely by choosing the same
-- event-ID value in their own namespace (correction learned in
-- candidate Task 0036). Durable database-level uniqueness, not
-- application-level check-then-insert, is what makes concurrent
-- delivery of the same source event resolve to exactly one row.
CREATE UNIQUE INDEX "PatientTimelineEvent_sourceType_sourceEventId_key"
  ON "PatientTimelineEvent"("sourceType", "sourceEventId");

-- Deterministic pagination: (recipientUserId, occurredAt DESC, id DESC).
CREATE INDEX "PatientTimelineEvent_recipientUserId_occurredAt_id_idx"
  ON "PatientTimelineEvent"("recipientUserId", "occurredAt" DESC, "id" DESC);
