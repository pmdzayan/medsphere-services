-- G3.23: provider-neutral, tenant-safe notification delivery foundation.

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');
CREATE TYPE "NotificationRecipientType" AS ENUM ('TENANT_MEMBERSHIP', 'TENANT_OPERATIONAL_ROUTE');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'FAILED', 'DELIVERED', 'DEAD_LETTER');
CREATE TYPE "NotificationAttemptOutcome" AS ENUM ('DELIVERED', 'FAILED', 'DEAD_LETTER');

CREATE TABLE "NotificationDelivery" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "sourceEventId" UUID NOT NULL,
  "workflowKey" VARCHAR(80) NOT NULL,
  "recipientType" "NotificationRecipientType" NOT NULL,
  "recipientReferenceId" VARCHAR(120) NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "templateKey" VARCHAR(120) NOT NULL,
  "templateVersion" INTEGER NOT NULL DEFAULT 1,
  "variables" JSONB NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "lockToken" VARCHAR(64),
  "deliveredAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDelivery_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "NotificationDelivery_tenant_source_workflow_recipient_channel_key"
    UNIQUE ("tenantId", "sourceEventId", "workflowKey", "recipientType", "recipientReferenceId", "channel"),
  CONSTRAINT "NotificationDelivery_templateVersion_check" CHECK ("templateVersion" > 0),
  CONSTRAINT "NotificationDelivery_attemptCount_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "NotificationDelivery_identifiers_check" CHECK (
    length(btrim("workflowKey")) > 0 AND
    length(btrim("recipientReferenceId")) > 0 AND
    length(btrim("templateKey")) > 0
  ),
  CONSTRAINT "NotificationDelivery_variables_object_check" CHECK (jsonb_typeof("variables") = 'object'),
  CONSTRAINT "NotificationDelivery_variables_size_check" CHECK (octet_length("variables"::text) <= 8192),
  CONSTRAINT "NotificationDelivery_lease_shape_check" CHECK (
    ("status" = 'PROCESSING' AND "lockedAt" IS NOT NULL AND "lockedUntil" IS NOT NULL AND "lockToken" IS NOT NULL)
    OR
    ("status" <> 'PROCESSING' AND "lockedAt" IS NULL AND "lockedUntil" IS NULL AND "lockToken" IS NULL)
  ),
  CONSTRAINT "NotificationDelivery_outcome_shape_check" CHECK (
    ("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL AND "lastErrorCode" IS NULL)
    OR ("status" IN ('FAILED', 'DEAD_LETTER') AND "deliveredAt" IS NULL AND "lastErrorCode" IS NOT NULL)
    OR ("status" IN ('PENDING', 'PROCESSING') AND "deliveredAt" IS NULL AND "lastErrorCode" IS NULL)
  )
);

CREATE INDEX "NotificationDelivery_status_availableAt_createdAt_id_idx"
ON "NotificationDelivery"("status", "availableAt", "createdAt", "id");
CREATE INDEX "NotificationDelivery_tenantId_createdAt_id_idx"
ON "NotificationDelivery"("tenantId", "createdAt" DESC, "id" DESC);
CREATE INDEX "NotificationDelivery_tenantId_status_createdAt_idx"
ON "NotificationDelivery"("tenantId", "status", "createdAt" DESC);
CREATE INDEX "NotificationDelivery_tenantId_recipient_createdAt_idx"
ON "NotificationDelivery"("tenantId", "recipientType", "recipientReferenceId", "createdAt" DESC);

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_sourceEventId_tenantId_fkey"
FOREIGN KEY ("sourceEventId", "tenantId") REFERENCES "OutboxEvent"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "NotificationDeliveryAttempt" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "outcome" "NotificationAttemptOutcome" NOT NULL,
  "providerKey" VARCHAR(80) NOT NULL,
  "errorCode" VARCHAR(80),
  "providerReferenceHash" VARCHAR(64),
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDeliveryAttempt_deliveryId_attemptNumber_key" UNIQUE ("deliveryId", "attemptNumber"),
  CONSTRAINT "NotificationDeliveryAttempt_attemptNumber_check" CHECK ("attemptNumber" > 0),
  CONSTRAINT "NotificationDeliveryAttempt_providerKey_check" CHECK (length(btrim("providerKey")) > 0),
  CONSTRAINT "NotificationDeliveryAttempt_outcome_shape_check" CHECK (
    ("outcome" = 'DELIVERED' AND "errorCode" IS NULL)
    OR
    ("outcome" IN ('FAILED', 'DEAD_LETTER') AND "errorCode" IS NOT NULL)
  )
);

CREATE INDEX "NotificationDeliveryAttempt_tenantId_occurredAt_id_idx"
ON "NotificationDeliveryAttempt"("tenantId", "occurredAt" DESC, "id" DESC);
CREATE INDEX "NotificationDeliveryAttempt_tenantId_outcome_occurredAt_idx"
ON "NotificationDeliveryAttempt"("tenantId", "outcome", "occurredAt" DESC);

ALTER TABLE "NotificationDeliveryAttempt"
ADD CONSTRAINT "NotificationDeliveryAttempt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NotificationDeliveryAttempt"
ADD CONSTRAINT "NotificationDeliveryAttempt_deliveryId_tenantId_fkey"
FOREIGN KEY ("deliveryId", "tenantId") REFERENCES "NotificationDelivery"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_notification_delivery_envelope_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."sourceEventId" IS DISTINCT FROM OLD."sourceEventId"
    OR NEW."workflowKey" IS DISTINCT FROM OLD."workflowKey"
    OR NEW."recipientType" IS DISTINCT FROM OLD."recipientType"
    OR NEW."recipientReferenceId" IS DISTINCT FROM OLD."recipientReferenceId"
    OR NEW."channel" IS DISTINCT FROM OLD."channel"
    OR NEW."templateKey" IS DISTINCT FROM OLD."templateKey"
    OR NEW."templateVersion" IS DISTINCT FROM OLD."templateVersion"
    OR NEW."variables" IS DISTINCT FROM OLD."variables"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'NotificationDelivery envelope is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotificationDelivery_00_reject_envelope_mutation"
BEFORE UPDATE ON "NotificationDelivery"
FOR EACH ROW EXECUTE FUNCTION reject_notification_delivery_envelope_mutation();

CREATE OR REPLACE FUNCTION enforce_notification_delivery_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('PENDING', 'FAILED') AND NEW."status" = 'PROCESSING' THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'PROCESSING' AND NEW."status" IN ('PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid NotificationDelivery transition';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotificationDelivery_10_enforce_transition"
BEFORE UPDATE ON "NotificationDelivery"
FOR EACH ROW EXECUTE FUNCTION enforce_notification_delivery_transition();

CREATE OR REPLACE FUNCTION reject_notification_delivery_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'NotificationDelivery is durable evidence and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotificationDelivery_reject_delete"
BEFORE DELETE ON "NotificationDelivery"
FOR EACH ROW EXECUTE FUNCTION reject_notification_delivery_delete();

CREATE OR REPLACE FUNCTION reject_notification_attempt_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'NotificationDeliveryAttempt is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NotificationDeliveryAttempt_reject_update_delete"
BEFORE UPDATE OR DELETE ON "NotificationDeliveryAttempt"
FOR EACH ROW EXECUTE FUNCTION reject_notification_attempt_mutation();
