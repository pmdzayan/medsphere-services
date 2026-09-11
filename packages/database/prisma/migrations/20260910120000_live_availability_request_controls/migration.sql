-- Task 0027: Live Availability Request controls.
--
-- Pharmacy live-request participation is explicitly opt-in. Missing preference
-- state and newly-created preference rows are both disabled by default.
--
-- Task 0026 AvailabilityRequest remains the sole durable request/dedupe
-- lifecycle. This migration intentionally does NOT introduce a second
-- availability-request or dedupe table.

CREATE TABLE "PharmacyAvailabilityRequestPreference" (
    "providerId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "liveRequestsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(64) NOT NULL,
    "quietHoursStartMinute" INTEGER,
    "quietHoursEndMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyAvailabilityRequestPreference_pkey"
        PRIMARY KEY ("providerId"),

    CONSTRAINT "PharmacyAvailabilityRequestPreference_quiet_start_range_check"
        CHECK (
            "quietHoursStartMinute" IS NULL OR
            ("quietHoursStartMinute" >= 0 AND "quietHoursStartMinute" <= 1439)
        ),

    CONSTRAINT "PharmacyAvailabilityRequestPreference_quiet_end_range_check"
        CHECK (
            "quietHoursEndMinute" IS NULL OR
            ("quietHoursEndMinute" >= 0 AND "quietHoursEndMinute" <= 1439)
        ),

    CONSTRAINT "PharmacyAvailabilityRequestPreference_quiet_pair_check"
        CHECK (
            ("quietHoursStartMinute" IS NULL AND "quietHoursEndMinute" IS NULL)
            OR
            ("quietHoursStartMinute" IS NOT NULL AND "quietHoursEndMinute" IS NOT NULL)
        )
);

CREATE UNIQUE INDEX
    "PharmacyAvailabilityRequestPreference_provider_tenant_key"
    ON "PharmacyAvailabilityRequestPreference"("providerId", "tenantId");

CREATE INDEX
    "PharmacyAvailabilityRequestPreference_tenantId_idx"
    ON "PharmacyAvailabilityRequestPreference"("tenantId");

ALTER TABLE "PharmacyAvailabilityRequestPreference"
    ADD CONSTRAINT "PharmacyAvailabilityRequestPreference_tenantId_fkey"
    FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "PharmacyAvailabilityRequestPreference"
    ADD CONSTRAINT "PharmacyAvailabilityRequestPreference_provider_scope_fkey"
    FOREIGN KEY ("providerId", "tenantId")
    REFERENCES "Provider"("id", "tenantId")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
