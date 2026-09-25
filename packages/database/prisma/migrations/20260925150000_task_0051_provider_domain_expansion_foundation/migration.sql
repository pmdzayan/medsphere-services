-- Task 0051 — Provider-Domain Expansion Foundation
-- Extends the accepted provider/RBAC/verification foundations without
-- introducing appointments, prescriptions, lab orders/results, or clinical records.

ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'CLINIC';
ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'LABORATORY';
ALTER TYPE "ProviderType" ADD VALUE IF NOT EXISTS 'DOCTOR';

-- A professional (doctor) does not necessarily have a business-registration
-- number. Pharmacy clients may continue supplying it; existing values are
-- preserved exactly.
ALTER TABLE "ProviderVerification"
  ALTER COLUMN "businessRegistrationNumber" DROP NOT NULL;

-- Existing provider-level authority remains the coarse source of truth.
-- This tenant-inclusive key lets subordinate location/department scopes prove
-- that they belong to the exact same tenant/provider assignment.
CREATE UNIQUE INDEX "MembershipProviderAccess_tenantId_membershipId_providerId_key"
  ON "MembershipProviderAccess" ("tenantId", "membershipId", "providerId");

CREATE TABLE "ProviderLocation" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "address" VARCHAR(300) NOT NULL,
  "city" VARCHAR(120) NOT NULL,
  "state" VARCHAR(120) NOT NULL,
  "country" VARCHAR(120) NOT NULL,
  "postalCode" VARCHAR(20) NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "ProviderLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderLocation_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProviderLocation_providerId_tenantId_fkey"
    FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProviderLocation_id_tenantId_providerId_key"
  ON "ProviderLocation" ("id", "tenantId", "providerId");
CREATE UNIQUE INDEX "ProviderLocation_providerId_code_key"
  ON "ProviderLocation" ("providerId", "code");
CREATE INDEX "ProviderLocation_tenantId_providerId_isActive_idx"
  ON "ProviderLocation" ("tenantId", "providerId", "isActive");
CREATE UNIQUE INDEX "ProviderLocation_one_primary_per_provider"
  ON "ProviderLocation" ("providerId")
  WHERE "isPrimary" = true AND "deletedAt" IS NULL;

-- Populated-upgrade safety: every existing provider receives exactly one
-- primary location derived from its already-authoritative Provider address.
-- Reusing the provider UUID is deterministic and safe because table identities
-- are independent.
INSERT INTO "ProviderLocation" (
  "id", "tenantId", "providerId", "code", "name",
  "address", "city", "state", "country", "postalCode",
  "latitude", "longitude", "isPrimary", "isActive",
  "version", "createdAt", "updatedAt", "deletedAt"
)
SELECT
  p."id", p."tenantId", p."id", 'PRIMARY', p."businessName",
  p."address", p."city", p."state", p."country", p."postalCode",
  p."latitude", p."longitude", true, p."isActive",
  1, p."createdAt", p."updatedAt", p."deletedAt"
FROM "Provider" p
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE "ProviderDepartment" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "code" VARCHAR(40) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "ProviderDepartment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderDepartment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProviderDepartment_providerId_tenantId_fkey"
    FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProviderDepartment_locationId_tenantId_providerId_fkey"
    FOREIGN KEY ("locationId", "tenantId", "providerId")
    REFERENCES "ProviderLocation"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProviderDepartment_id_tenantId_providerId_key"
  ON "ProviderDepartment" ("id", "tenantId", "providerId");
CREATE UNIQUE INDEX "ProviderDepartment_providerId_code_key"
  ON "ProviderDepartment" ("providerId", "code");
CREATE INDEX "ProviderDepartment_tenantId_providerId_locationId_isActive_idx"
  ON "ProviderDepartment" ("tenantId", "providerId", "locationId", "isActive");

CREATE TABLE "ProviderProfessionalProfile" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "registrationNumber" VARCHAR(120) NOT NULL,
  "registrationAuthority" VARCHAR(160) NOT NULL,
  "registrationExpiryDate" TIMESTAMP(3),
  "primarySpecialty" VARCHAR(160),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderProfessionalProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderProfessionalProfile_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProviderProfessionalProfile_providerId_tenantId_fkey"
    FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProviderProfessionalProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProviderProfessionalProfile_providerId_key"
  ON "ProviderProfessionalProfile" ("providerId");
CREATE UNIQUE INDEX "ProviderProfessionalProfile_tenantId_userId_key"
  ON "ProviderProfessionalProfile" ("tenantId", "userId");
CREATE INDEX "ProviderProfessionalProfile_tenantId_providerId_idx"
  ON "ProviderProfessionalProfile" ("tenantId", "providerId");

CREATE TABLE "MembershipProviderLocationAccess" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "locationId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MembershipProviderLocationAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MembershipProviderLocationAccess_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderLocationAccess_membershipId_tenantId_fkey"
    FOREIGN KEY ("membershipId", "tenantId") REFERENCES "TenantMembership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderLocationAccess_providerId_tenantId_fkey"
    FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderLocationAccess_providerAccess_fkey"
    FOREIGN KEY ("tenantId", "membershipId", "providerId")
    REFERENCES "MembershipProviderAccess"("tenantId", "membershipId", "providerId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderLocationAccess_location_fkey"
    FOREIGN KEY ("locationId", "tenantId", "providerId")
    REFERENCES "ProviderLocation"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MembershipProviderLocationAccess_membershipId_locationId_key"
  ON "MembershipProviderLocationAccess" ("membershipId", "locationId");
CREATE INDEX "MembershipProviderLocationAccess_tenantId_membershipId_providerId_idx"
  ON "MembershipProviderLocationAccess" ("tenantId", "membershipId", "providerId");
CREATE INDEX "MembershipProviderLocationAccess_tenantId_providerId_locationId_idx"
  ON "MembershipProviderLocationAccess" ("tenantId", "providerId", "locationId");

CREATE TABLE "MembershipProviderDepartmentAccess" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "membershipId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "departmentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MembershipProviderDepartmentAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MembershipProviderDepartmentAccess_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderDepartmentAccess_membershipId_tenantId_fkey"
    FOREIGN KEY ("membershipId", "tenantId") REFERENCES "TenantMembership"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderDepartmentAccess_providerId_tenantId_fkey"
    FOREIGN KEY ("providerId", "tenantId") REFERENCES "Provider"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderDepartmentAccess_providerAccess_fkey"
    FOREIGN KEY ("tenantId", "membershipId", "providerId")
    REFERENCES "MembershipProviderAccess"("tenantId", "membershipId", "providerId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MembershipProviderDepartmentAccess_department_fkey"
    FOREIGN KEY ("departmentId", "tenantId", "providerId")
    REFERENCES "ProviderDepartment"("id", "tenantId", "providerId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MembershipProviderDepartmentAccess_membershipId_departmentId_key"
  ON "MembershipProviderDepartmentAccess" ("membershipId", "departmentId");
CREATE INDEX "MembershipProviderDepartmentAccess_tenantId_membershipId_providerId_idx"
  ON "MembershipProviderDepartmentAccess" ("tenantId", "membershipId", "providerId");
CREATE INDEX "MembershipProviderDepartmentAccess_tenantId_providerId_departmentId_idx"
  ON "MembershipProviderDepartmentAccess" ("tenantId", "providerId", "departmentId");
