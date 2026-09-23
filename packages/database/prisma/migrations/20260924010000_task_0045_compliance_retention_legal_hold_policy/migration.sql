-- Task 0045 — Compliance Closure foundation:
-- versioned retention/purpose policy, legal-hold precedence and immutable
-- policy-decision evidence. This is an engineering control boundary, not a
-- legal/regulatory compliance certification.

CREATE TYPE "ComplianceDataClass" AS ENUM (
  'IDENTITY_PROFILE',
  'AUTHENTICATION_SECURITY',
  'PRIVACY_PREFERENCES',
  'CONSENT_EVIDENCE',
  'TENANT_MEMBERSHIP',
  'AUDIT_EVIDENCE',
  'PATIENT_PROFILE',
  'PATIENT_NOTIFICATION',
  'PATIENT_TIMELINE',
  'MEDICINE_RESERVATION',
  'INVENTORY_OPERATION',
  'BILLING_FINANCIAL'
);

CREATE TYPE "CompliancePurpose" AS ENUM (
  'ACCOUNT_SECURITY',
  'SERVICE_DELIVERY',
  'INVENTORY_OPERATIONS',
  'BILLING_TAX',
  'PRIVACY_PREFERENCE',
  'LEGAL_COMPLIANCE',
  'AUDIT_SECURITY',
  'PATIENT_CARE'
);

CREATE TYPE "ComplianceDisposition" AS ENUM ('RETAIN', 'DELETE', 'ANONYMIZE');
CREATE TYPE "ComplianceEvaluationContext" AS ENUM ('ACCESS', 'SUBJECT_REQUEST', 'RETENTION_EXPIRY');
CREATE TYPE "CompliancePolicyDecision" AS ENUM ('ALLOW', 'DENY', 'LEGAL_HOLD');
CREATE TYPE "ComplianceLegalHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "ComplianceLegalHoldReason" AS ENUM (
  'LITIGATION',
  'REGULATORY_REQUEST',
  'SECURITY_INVESTIGATION',
  'CONTRACTUAL_PRESERVATION',
  'OTHER'
);

CREATE TABLE "CompliancePolicy" (
  "id" UUID NOT NULL,
  "tenantId" UUID,
  "dataClass" "ComplianceDataClass" NOT NULL,
  "allowedPurposes" "CompliancePurpose"[] NOT NULL,
  "retentionDays" INTEGER,
  "expiryDisposition" "ComplianceDisposition" NOT NULL DEFAULT 'RETAIN',
  "subjectRequestDisposition" "ComplianceDisposition" NOT NULL DEFAULT 'RETAIN',
  "policyReference" VARCHAR(120) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededAt" TIMESTAMP(3),
  "createdByPlatformUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompliancePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompliancePolicy_retention_days_check"
    CHECK ("retentionDays" IS NULL OR ("retentionDays" >= 1 AND "retentionDays" <= 36500)),
  CONSTRAINT "CompliancePolicy_expiry_clock_check"
    CHECK ("expiryDisposition" = 'RETAIN' OR "retentionDays" IS NOT NULL),
  CONSTRAINT "CompliancePolicy_allowed_purposes_check"
    CHECK (cardinality("allowedPurposes") > 0)
);

CREATE TABLE "ComplianceLegalHold" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "subjectUserId" UUID NOT NULL,
  "dataClass" "ComplianceDataClass",
  "reasonCode" "ComplianceLegalHoldReason" NOT NULL,
  "referenceHash" VARCHAR(64),
  "status" "ComplianceLegalHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "placedByPlatformUserId" UUID NOT NULL,
  "releasedByPlatformUserId" UUID,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "commandHash" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "releasedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceLegalHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ComplianceLegalHold_reference_hash_check"
    CHECK ("referenceHash" IS NULL OR "referenceHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ComplianceLegalHold_release_state_check"
    CHECK (
      ("status" = 'ACTIVE' AND "releasedAt" IS NULL AND "releasedByPlatformUserId" IS NULL)
      OR
      ("status" = 'RELEASED' AND "releasedAt" IS NOT NULL AND "releasedByPlatformUserId" IS NOT NULL)
    )
);

CREATE TABLE "CompliancePolicyDecisionRecord" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "subjectUserId" UUID NOT NULL,
  "dataClass" "ComplianceDataClass" NOT NULL,
  "purpose" "CompliancePurpose" NOT NULL,
  "context" "ComplianceEvaluationContext" NOT NULL,
  "requestedDisposition" "ComplianceDisposition",
  "effectiveDisposition" "ComplianceDisposition" NOT NULL,
  "decision" "CompliancePolicyDecision" NOT NULL,
  "policyId" UUID,
  "legalHoldId" UUID,
  "evaluatedByPlatformUserId" UUID,
  "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompliancePolicyDecisionRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompliancePolicyDecisionRecord_context_check"
    CHECK (
      ("context" = 'ACCESS' AND "requestedDisposition" IS NULL)
      OR
      ("context" = 'SUBJECT_REQUEST' AND "requestedDisposition" IS NOT NULL)
      OR
      ("context" = 'RETENTION_EXPIRY' AND "requestedDisposition" IS NULL)
    ),
  CONSTRAINT "CompliancePolicyDecisionRecord_hold_check"
    CHECK (
      ("decision" = 'LEGAL_HOLD' AND "legalHoldId" IS NOT NULL)
      OR "decision" <> 'LEGAL_HOLD'
    )
);

CREATE UNIQUE INDEX "CompliancePolicy_active_platform_class_key"
  ON "CompliancePolicy" ("dataClass")
  WHERE "tenantId" IS NULL AND "supersededAt" IS NULL;

CREATE UNIQUE INDEX "CompliancePolicy_active_tenant_class_key"
  ON "CompliancePolicy" ("tenantId", "dataClass")
  WHERE "tenantId" IS NOT NULL AND "supersededAt" IS NULL;

CREATE INDEX "CompliancePolicy_tenantId_dataClass_supersededAt_idx"
  ON "CompliancePolicy" ("tenantId", "dataClass", "supersededAt");
CREATE INDEX "CompliancePolicy_dataClass_supersededAt_idx"
  ON "CompliancePolicy" ("dataClass", "supersededAt");

CREATE UNIQUE INDEX "ComplianceLegalHold_placedBy_idempotency_key"
  ON "ComplianceLegalHold" ("placedByPlatformUserId", "idempotencyKey");
CREATE INDEX "ComplianceLegalHold_tenant_subject_status_idx"
  ON "ComplianceLegalHold" ("tenantId", "subjectUserId", "status");
CREATE INDEX "ComplianceLegalHold_tenant_subject_class_status_idx"
  ON "ComplianceLegalHold" ("tenantId", "subjectUserId", "dataClass", "status");
CREATE UNIQUE INDEX "ComplianceLegalHold_active_all_classes_key"
  ON "ComplianceLegalHold" ("tenantId", "subjectUserId")
  WHERE "status" = 'ACTIVE' AND "dataClass" IS NULL;
CREATE UNIQUE INDEX "ComplianceLegalHold_active_class_key"
  ON "ComplianceLegalHold" ("tenantId", "subjectUserId", "dataClass")
  WHERE "status" = 'ACTIVE' AND "dataClass" IS NOT NULL;

CREATE INDEX "CompliancePolicyDecision_tenant_subject_evaluated_idx"
  ON "CompliancePolicyDecisionRecord" ("tenantId", "subjectUserId", "evaluatedAt" DESC);
CREATE INDEX "CompliancePolicyDecision_tenant_class_evaluated_idx"
  ON "CompliancePolicyDecisionRecord" ("tenantId", "dataClass", "evaluatedAt" DESC);
CREATE INDEX "CompliancePolicyDecision_policyId_idx"
  ON "CompliancePolicyDecisionRecord" ("policyId");
CREATE INDEX "CompliancePolicyDecision_legalHoldId_idx"
  ON "CompliancePolicyDecisionRecord" ("legalHoldId");

ALTER TABLE "CompliancePolicy"
  ADD CONSTRAINT "CompliancePolicy_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompliancePolicy"
  ADD CONSTRAINT "CompliancePolicy_createdByPlatformUserId_fkey"
  FOREIGN KEY ("createdByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ComplianceLegalHold"
  ADD CONSTRAINT "ComplianceLegalHold_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceLegalHold"
  ADD CONSTRAINT "ComplianceLegalHold_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceLegalHold"
  ADD CONSTRAINT "ComplianceLegalHold_placedByPlatformUserId_fkey"
  FOREIGN KEY ("placedByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComplianceLegalHold"
  ADD CONSTRAINT "ComplianceLegalHold_releasedByPlatformUserId_fkey"
  FOREIGN KEY ("releasedByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CompliancePolicyDecisionRecord"
  ADD CONSTRAINT "CompliancePolicyDecisionRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompliancePolicyDecisionRecord"
  ADD CONSTRAINT "CompliancePolicyDecisionRecord_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompliancePolicyDecisionRecord"
  ADD CONSTRAINT "CompliancePolicyDecisionRecord_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "CompliancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompliancePolicyDecisionRecord"
  ADD CONSTRAINT "CompliancePolicyDecisionRecord_legalHoldId_fkey"
  FOREIGN KEY ("legalHoldId") REFERENCES "ComplianceLegalHold"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompliancePolicyDecisionRecord"
  ADD CONSTRAINT "CompliancePolicyDecisionRecord_evaluatedByPlatformUserId_fkey"
  FOREIGN KEY ("evaluatedByPlatformUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Policy rows are historical evidence. They may only transition from active
-- to superseded; all substantive fields are immutable after insert.
CREATE OR REPLACE FUNCTION enforce_task_0045_compliance_policy_history()
RETURNS TRIGGER AS $task0045$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CompliancePolicy rows are not deletable';
  END IF;

  IF OLD."supersededAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Superseded CompliancePolicy rows are immutable';
  END IF;

  IF NEW."id" <> OLD."id"
     OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
     OR NEW."dataClass" <> OLD."dataClass"
     OR NEW."allowedPurposes" <> OLD."allowedPurposes"
     OR NEW."retentionDays" IS DISTINCT FROM OLD."retentionDays"
     OR NEW."expiryDisposition" <> OLD."expiryDisposition"
     OR NEW."subjectRequestDisposition" <> OLD."subjectRequestDisposition"
     OR NEW."policyReference" <> OLD."policyReference"
     OR NEW."version" <> OLD."version"
     OR NEW."effectiveAt" <> OLD."effectiveAt"
     OR NEW."createdByPlatformUserId" <> OLD."createdByPlatformUserId"
     OR NEW."createdAt" <> OLD."createdAt"
     OR NEW."supersededAt" IS NULL
  THEN
    RAISE EXCEPTION 'CompliancePolicy revisions must be superseded, never rewritten';
  END IF;

  RETURN NEW;
END;
$task0045$ LANGUAGE plpgsql;

CREATE TRIGGER "CompliancePolicy_history_guard"
BEFORE UPDATE OR DELETE ON "CompliancePolicy"
FOR EACH ROW EXECUTE FUNCTION enforce_task_0045_compliance_policy_history();

-- Legal holds are preservation evidence. They may transition ACTIVE->RELEASED
-- exactly once and are never deleted or rewritten.
CREATE OR REPLACE FUNCTION enforce_task_0045_legal_hold_history()
RETURNS TRIGGER AS $task0045$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ComplianceLegalHold rows are not deletable';
  END IF;

  IF OLD."status" <> 'ACTIVE'
     OR NEW."status" <> 'RELEASED'
     OR NEW."version" <> OLD."version" + 1
     OR NEW."releasedAt" IS NULL
     OR NEW."releasedByPlatformUserId" IS NULL
     OR NEW."id" <> OLD."id"
     OR NEW."tenantId" <> OLD."tenantId"
     OR NEW."subjectUserId" <> OLD."subjectUserId"
     OR NEW."dataClass" IS DISTINCT FROM OLD."dataClass"
     OR NEW."reasonCode" <> OLD."reasonCode"
     OR NEW."referenceHash" IS DISTINCT FROM OLD."referenceHash"
     OR NEW."placedByPlatformUserId" <> OLD."placedByPlatformUserId"
     OR NEW."idempotencyKey" <> OLD."idempotencyKey"
     OR NEW."commandHash" <> OLD."commandHash"
     OR NEW."placedAt" <> OLD."placedAt"
  THEN
    RAISE EXCEPTION 'ComplianceLegalHold permits only a single ACTIVE to RELEASED transition';
  END IF;

  RETURN NEW;
END;
$task0045$ LANGUAGE plpgsql;

CREATE TRIGGER "ComplianceLegalHold_history_guard"
BEFORE UPDATE OR DELETE ON "ComplianceLegalHold"
FOR EACH ROW EXECUTE FUNCTION enforce_task_0045_legal_hold_history();

CREATE OR REPLACE FUNCTION reject_task_0045_policy_decision_mutation()
RETURNS TRIGGER AS $task0045$
BEGIN
  RAISE EXCEPTION 'CompliancePolicyDecisionRecord is append-only';
END;
$task0045$ LANGUAGE plpgsql;

CREATE TRIGGER "CompliancePolicyDecisionRecord_append_only"
BEFORE UPDATE OR DELETE ON "CompliancePolicyDecisionRecord"
FOR EACH ROW EXECUTE FUNCTION reject_task_0045_policy_decision_mutation();

-- Dedicated platform permissions. Read is granted to owner/admin; management
-- is owner-only, matching the existing consequential-action precedent.
ALTER TABLE "Permission"
  DISABLE TRIGGER "Permission_reject_insert_update_delete";

INSERT INTO "Permission" ("id", "name", "description")
VALUES
  (
    md5('medsphere:permission:platform.compliance.read')::uuid,
    'platform.compliance.read',
    'Read bounded compliance policy, legal-hold status and policy-decision evidence'
  ),
  (
    md5('medsphere:permission:platform.compliance.manage')::uuid,
    'platform.compliance.manage',
    'Revise compliance policy and place or release legal holds'
  )
ON CONFLICT ("name") DO NOTHING;

ALTER TABLE "Permission"
  ENABLE TRIGGER "Permission_reject_insert_update_delete";

DO $task0045$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Permission"
    WHERE "name" IN ('platform.compliance.read', 'platform.compliance.manage')
      AND "id" <> md5('medsphere:permission:' || "name")::uuid
  ) THEN
    RAISE EXCEPTION 'Task 0045 migration blocked: compliance permission identifier mismatch';
  END IF;
END;
$task0045$;

INSERT INTO "PlatformRolePermission" ("id", "roleId", "permissionId", "createdAt")
VALUES
  (
    md5('medsphere:platform-role-permission:OWNER:compliance-read')::uuid,
    md5('medsphere:platform-role:PLATFORM_OWNER')::uuid,
    md5('medsphere:permission:platform.compliance.read')::uuid,
    CURRENT_TIMESTAMP
  ),
  (
    md5('medsphere:platform-role-permission:OWNER:compliance-manage')::uuid,
    md5('medsphere:platform-role:PLATFORM_OWNER')::uuid,
    md5('medsphere:permission:platform.compliance.manage')::uuid,
    CURRENT_TIMESTAMP
  ),
  (
    md5('medsphere:platform-role-permission:ADMIN:compliance-read')::uuid,
    md5('medsphere:platform-role:PLATFORM_ADMIN')::uuid,
    md5('medsphere:permission:platform.compliance.read')::uuid,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Extend the durable AuditEvent DB allowlist from the accepted Task 0044
-- catalogue. Metadata remains constrained independently by the shared TS
-- catalogue.
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
    'compliance.policy.evaluated'
  ));
