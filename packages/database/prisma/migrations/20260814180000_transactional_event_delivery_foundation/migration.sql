-- G3.21: tenant-scoped transactional outbox and idempotent consumer receipts.

CREATE TYPE "OutboxEventStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'FAILED',
  'DELIVERED',
  'DEAD_LETTER'
);

CREATE TABLE "OutboxEvent" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "eventType" VARCHAR(120) NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "aggregateType" VARCHAR(80) NOT NULL,
  "aggregateId" VARCHAR(120) NOT NULL,
  "actorType" "AuditActorType" NOT NULL,
  "actorMembershipId" UUID,
  "actorUserId" UUID,
  "systemService" VARCHAR(80),
  "correlationId" VARCHAR(120),
  "causationId" VARCHAR(120),
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedUntil" TIMESTAMP(3),
  "lockToken" VARCHAR(64),
  "deliveredAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxEvent_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "OutboxEvent_eventVersion_check" CHECK ("eventVersion" > 0),
  CONSTRAINT "OutboxEvent_attemptCount_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "OutboxEvent_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
  CONSTRAINT "OutboxEvent_payload_size_check" CHECK (octet_length("payload"::text) <= 16384),
  CONSTRAINT "OutboxEvent_actor_scope_check" CHECK (
    ("actorType" = 'TENANT_USER' AND "actorMembershipId" IS NOT NULL AND "actorUserId" IS NOT NULL AND "systemService" IS NULL)
    OR
    ("actorType" = 'SYSTEM' AND "actorMembershipId" IS NULL AND "actorUserId" IS NULL AND "systemService" IS NOT NULL)
  ),
  CONSTRAINT "OutboxEvent_lease_shape_check" CHECK (
    ("status" = 'PROCESSING' AND "lockedAt" IS NOT NULL AND "lockedUntil" IS NOT NULL AND "lockedUntil" > "lockedAt" AND "lockToken" IS NOT NULL)
    OR
    ("status" <> 'PROCESSING' AND "lockedAt" IS NULL AND "lockedUntil" IS NULL AND "lockToken" IS NULL)
  ),
  CONSTRAINT "OutboxEvent_delivery_shape_check" CHECK (
    ("status" = 'DELIVERED' AND "deliveredAt" IS NOT NULL)
    OR
    ("status" <> 'DELIVERED' AND "deliveredAt" IS NULL)
  ),
  CONSTRAINT "OutboxEvent_error_shape_check" CHECK (
    ("status" IN ('FAILED', 'DEAD_LETTER') AND "lastErrorCode" IS NOT NULL)
    OR
    ("status" NOT IN ('FAILED', 'DEAD_LETTER') AND "lastErrorCode" IS NULL)
  )
);

CREATE INDEX "OutboxEvent_status_availableAt_occurredAt_id_idx"
ON "OutboxEvent"("status", "availableAt", "occurredAt", "id");

CREATE INDEX "OutboxEvent_tenantId_occurredAt_id_idx"
ON "OutboxEvent"("tenantId", "occurredAt" DESC, "id" DESC);

CREATE INDEX "OutboxEvent_tenantId_eventType_occurredAt_idx"
ON "OutboxEvent"("tenantId", "eventType", "occurredAt" DESC);

CREATE INDEX "OutboxEvent_aggregateType_aggregateId_occurredAt_idx"
ON "OutboxEvent"("aggregateType", "aggregateId", "occurredAt");

CREATE INDEX "OutboxEvent_actorMembershipId_occurredAt_idx"
ON "OutboxEvent"("actorMembershipId", "occurredAt" DESC);

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_actorMembershipId_actorUserId_tenantId_fkey"
FOREIGN KEY ("actorMembershipId", "actorUserId", "tenantId")
REFERENCES "TenantMembership"("id", "userId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_outbox_envelope_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."eventType" IS DISTINCT FROM OLD."eventType"
    OR NEW."eventVersion" IS DISTINCT FROM OLD."eventVersion"
    OR NEW."aggregateType" IS DISTINCT FROM OLD."aggregateType"
    OR NEW."aggregateId" IS DISTINCT FROM OLD."aggregateId"
    OR NEW."actorType" IS DISTINCT FROM OLD."actorType"
    OR NEW."actorMembershipId" IS DISTINCT FROM OLD."actorMembershipId"
    OR NEW."actorUserId" IS DISTINCT FROM OLD."actorUserId"
    OR NEW."systemService" IS DISTINCT FROM OLD."systemService"
    OR NEW."correlationId" IS DISTINCT FROM OLD."correlationId"
    OR NEW."causationId" IS DISTINCT FROM OLD."causationId"
    OR NEW."payload" IS DISTINCT FROM OLD."payload"
    OR NEW."occurredAt" IS DISTINCT FROM OLD."occurredAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'OutboxEvent envelope is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OutboxEvent_reject_envelope_mutation"
BEFORE UPDATE ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION reject_outbox_envelope_mutation();

CREATE OR REPLACE FUNCTION enforce_outbox_delivery_transition()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('PENDING', 'FAILED')
    AND NEW."status" = 'PROCESSING'
    AND NEW."attemptCount" = OLD."attemptCount" + 1
  THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PROCESSING'
    AND NEW."status" IN ('DELIVERED', 'FAILED', 'DEAD_LETTER')
    AND NEW."attemptCount" = OLD."attemptCount"
  THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PROCESSING'
    AND NEW."status" = 'PROCESSING'
    AND NEW."attemptCount" = OLD."attemptCount" + 1
    AND OLD."lockedUntil" <= CURRENT_TIMESTAMP
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid OutboxEvent delivery transition';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OutboxEvent_enforce_delivery_transition"
BEFORE UPDATE ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION enforce_outbox_delivery_transition();

CREATE OR REPLACE FUNCTION reject_outbox_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'OutboxEvent is durable evidence and cannot be deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "OutboxEvent_reject_delete"
BEFORE DELETE ON "OutboxEvent"
FOR EACH ROW EXECUTE FUNCTION reject_outbox_delete();

CREATE TABLE "EventInboxReceipt" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "consumerName" VARCHAR(80) NOT NULL,
  "eventId" UUID NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventInboxReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EventInboxReceipt_consumerName_eventId_key" UNIQUE ("consumerName", "eventId")
);

CREATE INDEX "EventInboxReceipt_tenantId_processedAt_id_idx"
ON "EventInboxReceipt"("tenantId", "processedAt" DESC, "id" DESC);

ALTER TABLE "EventInboxReceipt"
ADD CONSTRAINT "EventInboxReceipt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EventInboxReceipt"
ADD CONSTRAINT "EventInboxReceipt_eventId_tenantId_fkey"
FOREIGN KEY ("eventId", "tenantId")
REFERENCES "OutboxEvent"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_inbox_receipt_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'EventInboxReceipt is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "EventInboxReceipt_reject_update_delete"
BEFORE UPDATE OR DELETE ON "EventInboxReceipt"
FOR EACH ROW EXECUTE FUNCTION reject_inbox_receipt_mutation();
