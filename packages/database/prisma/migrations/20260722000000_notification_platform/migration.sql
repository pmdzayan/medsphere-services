-- Gate 7: Multi-Tenant Notification Platform
--
-- Adds channel abstractions (Email, SMS, WhatsApp, Push), tenant provider
-- configurations, dynamic template engines, notification delivery logging,
-- and the schema support for event-driven notification triggers.

-- === Enums ===

CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');

CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

CREATE TYPE "NotificationProviderType" AS ENUM ('SMTP', 'SENDGRID', 'TWILIO', 'AWS_SES', 'FCM', 'WHATSAPP_BUSINESS', 'MOCK');

-- === Tables ===

CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_notification_configs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "provider" "NotificationProviderType" NOT NULL,
    "credentials" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_notification_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- === Constraints ===

ALTER TABLE "notification_templates"
    ADD CONSTRAINT "notification_templates_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_notification_configs"
    ADD CONSTRAINT "tenant_notification_configs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_logs"
    ADD CONSTRAINT "notification_logs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_logs"
    ADD CONSTRAINT "notification_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- === Unique Constraints ===

CREATE UNIQUE INDEX "notification_templates_tenantId_code_channel_key"
    ON "notification_templates"("tenantId", "code", "channel");

CREATE UNIQUE INDEX "tenant_notification_configs_tenantId_channel_provider_key"
    ON "tenant_notification_configs"("tenantId", "channel", "provider");

-- === Indexes ===

CREATE INDEX "notification_logs_tenantId_createdAt_idx"
    ON "notification_logs"("tenantId", "createdAt");

CREATE INDEX "notification_logs_tenantId_status_idx"
    ON "notification_logs"("tenantId", "status");

CREATE INDEX "notification_logs_correlationId_idx"
    ON "notification_logs"("correlationId");
