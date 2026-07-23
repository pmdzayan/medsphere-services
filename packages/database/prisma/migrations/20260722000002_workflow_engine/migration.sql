-- Gate 9: Configurable Workflow State Machine & Dynamic Approval Engine
--
-- Adds tenant-configurable workflow definitions, dynamic state transitions,
-- role-based approval matrices, threshold-based escalation rules, step
-- approval/rejection execution, and workflow lifecycle event emission
-- via the transactional outbox.

-- === Enums ===

CREATE TYPE "WorkflowStatus" AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED'
);

CREATE TYPE "InstanceStatus" AS ENUM (
  'IN_PROGRESS',
  'APPROVED',
  'REJECTED',
  'CANCELLED'
);

CREATE TYPE "ApprovalDecision" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

-- === Tables ===

CREATE TABLE "workflow_definitions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_states" (
    "id" UUID NOT NULL,
    "workflowDefinitionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "workflow_states_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_transitions" (
    "id" UUID NOT NULL,
    "workflowDefinitionId" UUID NOT NULL,
    "fromStateId" UUID NOT NULL,
    "toStateId" UUID NOT NULL,
    "actionName" TEXT NOT NULL,
    "requiredPermission" TEXT,
    "requiredRoleId" UUID,
    "minAmountThreshold" DOUBLE PRECISION,
    "approvalLevel" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_instances" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "workflowDefinitionId" UUID NOT NULL,
    "currentStateId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "InstanceStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "initiatorId" UUID NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_instances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_approvals" (
    "id" UUID NOT NULL,
    "workflowInstanceId" UUID NOT NULL,
    "transitionId" UUID NOT NULL,
    "approverId" UUID,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3, 3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_approvals_pkey" PRIMARY KEY ("id")
);

-- === Constraints ===

ALTER TABLE "workflow_definitions"
    ADD CONSTRAINT "workflow_definitions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_states"
    ADD CONSTRAINT "workflow_states_workflowDefinitionId_fkey"
    FOREIGN KEY ("workflowDefinitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_workflowDefinitionId_fkey"
    FOREIGN KEY ("workflowDefinitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_fromStateId_fkey"
    FOREIGN KEY ("fromStateId") REFERENCES "workflow_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_toStateId_fkey"
    FOREIGN KEY ("toStateId") REFERENCES "workflow_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_requiredRoleId_fkey"
    FOREIGN KEY ("requiredRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workflow_instances"
    ADD CONSTRAINT "workflow_instances_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_instances"
    ADD CONSTRAINT "workflow_instances_workflowDefinitionId_fkey"
    FOREIGN KEY ("workflowDefinitionId") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_instances"
    ADD CONSTRAINT "workflow_instances_currentStateId_fkey"
    FOREIGN KEY ("currentStateId") REFERENCES "workflow_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_instances"
    ADD CONSTRAINT "workflow_instances_initiatorId_fkey"
    FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals"
    ADD CONSTRAINT "workflow_approvals_workflowInstanceId_fkey"
    FOREIGN KEY ("workflowInstanceId") REFERENCES "workflow_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals"
    ADD CONSTRAINT "workflow_approvals_transitionId_fkey"
    FOREIGN KEY ("transitionId") REFERENCES "workflow_transitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workflow_approvals"
    ADD CONSTRAINT "workflow_approvals_approverId_fkey"
    FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- === Unique Constraints ===

ALTER TABLE "workflow_definitions"
    ADD CONSTRAINT "workflow_definitions_tenantId_code_version_key"
    UNIQUE ("tenantId", "code", "version");

ALTER TABLE "workflow_states"
    ADD CONSTRAINT "workflow_states_workflowDefinitionId_code_key"
    UNIQUE ("workflowDefinitionId", "code");

ALTER TABLE "workflow_transitions"
    ADD CONSTRAINT "workflow_transitions_workflowDefinitionId_fromStateId_actionName_key"
    UNIQUE ("workflowDefinitionId", "fromStateId", "actionName");

-- === Indexes ===

CREATE INDEX "workflow_definitions_tenantId_entityType_idx"
    ON "workflow_definitions"("tenantId", "entityType");

CREATE INDEX "workflow_instances_tenantId_entityType_entityId_idx"
    ON "workflow_instances"("tenantId", "entityType", "entityId");

CREATE INDEX "workflow_instances_tenantId_status_idx"
    ON "workflow_instances"("tenantId", "status");

CREATE INDEX "workflow_approvals_workflowInstanceId_decision_idx"
    ON "workflow_approvals"("workflowInstanceId", "decision");
