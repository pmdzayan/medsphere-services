/**
 * Candidate Task 0039 (PROVISIONAL) populated-upgrade verifier --
 * RECONCILED to represent the authoritative chain through Task 0028.
 *
 * Seeds realistic pre-0039 synthetic data spanning Task 0025/0026/0027/
 * 0028, applies the ACTUAL Task 0039 migration file, and proves every
 * populated-upgrade invariant the candidate document claims -- this is
 * executable evidence, not comments in migration SQL.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.AIM_CANDIDATE_0039_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('AIM_CANDIDATE_0039_DATABASE_URL is required. Refusing to run without it.');
  process.exit(1);
}

const MIGRATION_PATH = path.join(
  __dirname,
  '../../../../packages/database/prisma/migrations/20260918140000_task_0039_pharmacy_onboarding_verification/migration.sql',
);

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '99999999-9999-4999-8999-999999999999';
const PHARMACY_A = '33333333-3333-4333-8333-333333333333';
const PHARMACY_B = '44444444-4444-4444-8444-444444444444'; // Tenant B, for isolation
const PRODUCT_A = '55555555-5555-4555-8555-555555555555';
const LEGACY_VERIFIER_USER = '99999999-0000-4000-8000-000000000001';

async function seedPreExistingSchema(client) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await client.query(`
    CREATE TABLE "Tenant" (id UUID PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE "Provider" (
      id UUID NOT NULL, "tenantId" UUID NOT NULL REFERENCES "Tenant"(id),
      "providerType" TEXT NOT NULL, "businessName" TEXT NOT NULL,
      "isVerified" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true,
      "deletedAt" TIMESTAMP, PRIMARY KEY (id, "tenantId"), UNIQUE(id, "tenantId")
    );
    CREATE TABLE "Product" (id UUID PRIMARY KEY, "isActive" BOOLEAN NOT NULL DEFAULT true, "deletedAt" TIMESTAMP);
    CREATE TYPE "VerificationStatus" AS ENUM ('PENDING','UNDER_REVIEW','APPROVED','REJECTED','SUSPENDED','EXPIRED');
    CREATE TABLE "ProviderVerification" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "tenantId" UUID NOT NULL REFERENCES "Tenant"(id),
      "providerType" TEXT NOT NULL,
      status "VerificationStatus" NOT NULL DEFAULT 'PENDING',
      "licenseNumber" TEXT NOT NULL,
      "licenseExpiryDate" TIMESTAMP NOT NULL,
      "businessRegistrationNumber" TEXT NOT NULL,
      "governmentIdReference" TEXT NOT NULL,
      "verificationNotes" TEXT,
      "submittedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "verifiedAt" TIMESTAMP,
      "verifiedBy" UUID,
      version INT NOT NULL DEFAULT 1,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      "deletedAt" TIMESTAMP
    );
    -- Task 0025: inventory/freshness source data.
    CREATE TABLE "Batch" (id UUID PRIMARY KEY, "providerId" UUID NOT NULL, "tenantId" UUID NOT NULL, "onHand" INT NOT NULL);
    -- Task 0026: live availability request + evidence.
    CREATE TABLE "AvailabilityRequest" (
      id UUID PRIMARY KEY, "tenantId" UUID NOT NULL, "providerId" UUID NOT NULL, "productId" UUID NOT NULL,
      status TEXT NOT NULL, "requestedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    CREATE TABLE "ProviderProductAvailabilityEvidence" (
      id UUID PRIMARY KEY, "tenantId" UUID NOT NULL, "providerId" UUID NOT NULL, "productId" UUID NOT NULL,
      "recordedAt" TIMESTAMP NOT NULL DEFAULT now()
    );
    -- Task 0027: pharmacy live-request preference/control state.
    CREATE TABLE "PharmacyAvailabilityRequestPreference" (
      "providerId" UUID PRIMARY KEY, "tenantId" UUID NOT NULL, "liveRequestsEnabled" BOOLEAN NOT NULL DEFAULT false,
      "timezone" TEXT NOT NULL DEFAULT 'UTC'
    );
    -- Platform permission catalogue (Task 0021-era, extended by Task 0039).
    CREATE TABLE "Permission" (id UUID PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT);
    -- Pre-existing (Task 0021-era) permission, seeded BEFORE the
    -- protective trigger below is attached -- to prove the Task 0039
    -- catalogue append doesn't corrupt it.
    INSERT INTO "Permission" (id, name, description) VALUES (gen_random_uuid(), 'platform.administration.read', 'pre-existing');
    CREATE TABLE "AuditEvent" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "eventType" TEXT NOT NULL,
      CONSTRAINT "AuditEvent_event_type_check" CHECK ("eventType" IN (
        'authorization.role.created', 'inventory.availability-request.preference.configured', 'patient.profile.updated'
      ))
    );
    CREATE OR REPLACE FUNCTION reject_permission_mutation() RETURNS TRIGGER AS $f$
    BEGIN RAISE EXCEPTION 'Permission catalogue is protected'; END;
    $f$ LANGUAGE plpgsql;
    CREATE TRIGGER "Permission_reject_insert_update_delete" BEFORE INSERT OR UPDATE OR DELETE ON "Permission" FOR EACH ROW EXECUTE FUNCTION reject_permission_mutation();
    CREATE TABLE "PlatformRole" (id UUID PRIMARY KEY, key TEXT UNIQUE NOT NULL);
    CREATE TABLE "PlatformRolePermission" (id UUID PRIMARY KEY, "roleId" UUID NOT NULL REFERENCES "PlatformRole"(id), "permissionId" UUID NOT NULL REFERENCES "Permission"(id), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), UNIQUE("roleId","permissionId"));
    CREATE TABLE "Role" (id UUID PRIMARY KEY, "tenantId" UUID NOT NULL REFERENCES "Tenant"(id), name TEXT NOT NULL, type TEXT NOT NULL, "deletedAt" TIMESTAMP);
    CREATE TABLE "RolePermission" (id UUID PRIMARY KEY, "tenantId" UUID NOT NULL, "roleId" UUID NOT NULL REFERENCES "Role"(id), "permissionId" UUID NOT NULL REFERENCES "Permission"(id), "createdAt" TIMESTAMP NOT NULL DEFAULT now());
  `);

  await client.query(`INSERT INTO "Tenant" (id, name) VALUES ($1,'Tenant A'), ($2,'Tenant B')`, [
    TENANT_A,
    TENANT_B,
  ]);
  await client.query(
    `INSERT INTO "Provider" (id, "tenantId", "providerType", "businessName", "isVerified") VALUES
       ($1, $2, 'PHARMACY', 'Pharmacy A', true),
       ($3, $4, 'PHARMACY', 'Pharmacy B (Tenant B, isolation check)', false)`,
    [PHARMACY_A, TENANT_A, PHARMACY_B, TENANT_B],
  );
  await client.query(`INSERT INTO "Product" (id) VALUES ($1)`, [PRODUCT_A]);

  // Legacy pre-0039 verification row -- tenant-scoped only, exactly as
  // the accepted (pre-0039) schema produces one.
  await client.query(
    `INSERT INTO "ProviderVerification" ("tenantId","providerType",status,"licenseNumber","licenseExpiryDate","businessRegistrationNumber","governmentIdReference","verifiedAt","verifiedBy")
     VALUES ($1,'PHARMACY','APPROVED','LEGACY-LIC-001', now() + interval '1 year','LEGACY-REG-001','LEGACY-GOV-001', now() - interval '10 days', $2)`,
    [TENANT_A, LEGACY_VERIFIER_USER],
  );

  // Task 0025 source data.
  await client.query(
    `INSERT INTO "Batch" (id, "providerId", "tenantId", "onHand") VALUES (gen_random_uuid(), $1, $2, 42)`,
    [PHARMACY_A, TENANT_A],
  );

  // Task 0026 source data (also Task 0028's own aggregate source).
  for (let i = 0; i < 3; i++) {
    await client.query(
      `INSERT INTO "AvailabilityRequest" (id, "tenantId", "providerId", "productId", status, "requestedAt") VALUES (gen_random_uuid(), $1, $2, $3, 'RESPONDED', now() - interval '2 days')`,
      [TENANT_A, PHARMACY_A, PRODUCT_A],
    );
  }
  await client.query(
    `INSERT INTO "AvailabilityRequest" (id, "tenantId", "providerId", "productId", status, "requestedAt") VALUES (gen_random_uuid(), $1, $2, $3, 'PENDING', now() - interval '1 hour')`,
    [TENANT_A, PHARMACY_A, PRODUCT_A],
  );
  await client.query(
    `INSERT INTO "ProviderProductAvailabilityEvidence" (id, "tenantId", "providerId", "productId") VALUES (gen_random_uuid(), $1, $2, $3)`,
    [TENANT_A, PHARMACY_A, PRODUCT_A],
  );

  // Task 0027 source data.
  await client.query(
    `INSERT INTO "PharmacyAvailabilityRequestPreference" ("providerId", "tenantId", "liveRequestsEnabled", "timezone") VALUES ($1, $2, true, 'Asia/Kolkata')`,
    [PHARMACY_A, TENANT_A],
  );

  await client.query(
    `INSERT INTO "PlatformRole" (id, key) VALUES (md5('medsphere:platform-role:PLATFORM_OWNER')::uuid, 'PLATFORM_OWNER'), (md5('medsphere:platform-role:PLATFORM_ADMIN')::uuid, 'PLATFORM_ADMIN')`,
  );
  await client.query(
    `INSERT INTO "Role" (id, "tenantId", name, type) VALUES ($1, $2, 'TENANT_ADMINISTRATOR', 'SYSTEM')`,
    ['66666666-6666-4666-8666-666666666666', TENANT_A],
  );
}

async function main() {
  const client = new Client(DATABASE_URL);
  await client.connect();
  try {
    console.log('--- Seeding realistic pre-0039 state through the Task 0028 base ---');
    await seedPreExistingSchema(client);

    const pre = await client.query(`
      SELECT
        (SELECT count(*) FROM "ProviderVerification") AS verifications,
        (SELECT count(*) FROM "Batch") AS batches,
        (SELECT count(*) FROM "AvailabilityRequest") AS availability_requests,
        (SELECT count(*) FROM "ProviderProductAvailabilityEvidence") AS evidence,
        (SELECT count(*) FROM "PharmacyAvailabilityRequestPreference") AS preferences,
        (SELECT count(*) FROM "Permission") AS permissions,
        (SELECT "isVerified" FROM "Provider" WHERE id = '${PHARMACY_A}') AS pharmacy_a_verified,
        (SELECT "isVerified" FROM "Provider" WHERE id = '${PHARMACY_B}') AS pharmacy_b_verified
    `);
    console.log('  Pre-migration counts:', pre.rows[0]);

    console.log('\n--- Applying the ACTUAL Task 0039 migration file ---');
    const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    await client.query(migrationSql);
    console.log('  Migration applied successfully.\n');

    console.log('--- Verifying populated-upgrade invariants ---');

    const postVerifications = await client.query(`SELECT count(*) FROM "ProviderVerification"`);
    if (Number(postVerifications.rows[0].count) !== Number(pre.rows[0].verifications)) {
      throw new Error(
        'FAIL: ProviderVerification row count changed -- a legacy row was lost or fabricated',
      );
    }
    console.log('  PASS: no ProviderVerification row lost.');

    const legacyRow = await client.query(
      `SELECT "providerId", "isCurrent" FROM "ProviderVerification" WHERE "licenseNumber" = 'LEGACY-LIC-001'`,
    );
    if (legacyRow.rows[0].providerId !== null)
      throw new Error('FAIL: legacy row was given a fabricated providerId');
    if (legacyRow.rows[0].isCurrent !== false)
      throw new Error('FAIL: legacy unlinked row must never be isCurrent');
    console.log(
      '  PASS: legacy unlinked verification preserved: providerId=NULL, isCurrent=false.',
    );

    let nullCurrentBlocked = false;
    try {
      await client.query(
        `UPDATE "ProviderVerification" SET "isCurrent" = true WHERE "licenseNumber" = 'LEGACY-LIC-001' AND "providerId" IS NULL`,
      );
    } catch (e) {
      nullCurrentBlocked = true;
    }
    if (!nullCurrentBlocked)
      throw new Error(
        'FAIL: expected the CHECK constraint to block isCurrent=true on the legacy row',
      );
    console.log('  PASS: no legacy row can be silently made current/verified after migration.');

    const pharmacyAAfter = await client.query(`SELECT "isVerified" FROM "Provider" WHERE id = $1`, [
      PHARMACY_A,
    ]);
    const pharmacyBAfter = await client.query(`SELECT "isVerified" FROM "Provider" WHERE id = $1`, [
      PHARMACY_B,
    ]);
    if (
      pharmacyAAfter.rows[0].isVerified !== pre.rows[0].pharmacy_a_verified ||
      pharmacyBAfter.rows[0].isVerified !== pre.rows[0].pharmacy_b_verified
    ) {
      throw new Error(
        'FAIL: a Provider.isVerified projection changed as a side effect of the migration alone',
      );
    }
    console.log(
      '  PASS: no provider silently became (or stopped being) verified merely by running the migration.',
    );

    const ownership = await client.query(`SELECT "tenantId" FROM "Provider" WHERE id = $1`, [
      PHARMACY_A,
    ]);
    if (ownership.rows[0].tenantId !== TENANT_A)
      throw new Error('FAIL: provider/tenant ownership was altered');
    console.log('  PASS: provider/tenant ownership unchanged.');

    const batchCount = await client.query(`SELECT count(*) FROM "Batch"`);
    if (Number(batchCount.rows[0].count) !== Number(pre.rows[0].batches))
      throw new Error('FAIL: Task 0025 Batch data was affected');
    console.log('  PASS: Task 0025 (Batch) data survives untouched.');

    const requestCount = await client.query(`SELECT count(*) FROM "AvailabilityRequest"`);
    const evidenceCount = await client.query(
      `SELECT count(*) FROM "ProviderProductAvailabilityEvidence"`,
    );
    if (Number(requestCount.rows[0].count) !== Number(pre.rows[0].availability_requests))
      throw new Error('FAIL: Task 0026 AvailabilityRequest data was affected');
    if (Number(evidenceCount.rows[0].count) !== Number(pre.rows[0].evidence))
      throw new Error('FAIL: Task 0026 evidence data was affected');
    console.log('  PASS: Task 0026 (AvailabilityRequest + evidence) data survives untouched.');

    const preferenceCount = await client.query(
      `SELECT count(*) FROM "PharmacyAvailabilityRequestPreference"`,
    );
    if (Number(preferenceCount.rows[0].count) !== Number(pre.rows[0].preferences))
      throw new Error('FAIL: Task 0027 preference data was affected');
    console.log(
      '  PASS: Task 0027 (PharmacyAvailabilityRequestPreference) data survives untouched.',
    );

    // Task 0028's own aggregate semantics: re-run its exact totals query pattern.
    const demandTotals = await client.query(
      `
      WITH status_counts AS (
        SELECT 'PENDING'::text AS status, COUNT(*)::bigint AS count FROM "AvailabilityRequest"
          WHERE "tenantId" = $1 AND "providerId" = $2 AND status = 'PENDING' AND "requestedAt" >= now() - interval '30 days'
        UNION ALL
        SELECT 'RESPONDED'::text AS status, COUNT(*)::bigint AS count FROM "AvailabilityRequest"
          WHERE "tenantId" = $1 AND "providerId" = $2 AND status = 'RESPONDED' AND "requestedAt" >= now() - interval '30 days'
      )
      SELECT COALESCE(SUM(count), 0)::bigint AS "liveRequestCount" FROM status_counts
    `,
      [TENANT_A, PHARMACY_A],
    );
    if (Number(demandTotals.rows[0].liveRequestCount) !== 4) {
      throw new Error(
        `FAIL: expected Task 0028's aggregate query to still count 4 requests after migration, got ${demandTotals.rows[0].liveRequestCount}`,
      );
    }
    console.log(
      '  PASS: Task 0028 aggregate read semantics remain intact after the Task 0039 migration (4 requests counted).',
    );

    // Cross-tenant isolation.
    const crossTenantCheck = await client.query(`SELECT "tenantId" FROM "Provider" WHERE id = $1`, [
      PHARMACY_B,
    ]);
    if (crossTenantCheck.rows[0].tenantId !== TENANT_B)
      throw new Error('FAIL: cross-tenant isolation broken');
    const crossTenantVerificationLeak = await client.query(
      `SELECT count(*) FROM "ProviderVerification" WHERE "tenantId" = $1 AND "providerId" = $2`,
      [TENANT_B, PHARMACY_A],
    );
    if (Number(crossTenantVerificationLeak.rows[0].count) !== 0)
      throw new Error('FAIL: cross-tenant verification linkage leaked');
    console.log('  PASS: cross-tenant data remains isolated.');

    // Permission catalogue integrity.
    const permCount = await client.query(`SELECT count(*) FROM "Permission"`);
    const preExisting = await client.query(
      `SELECT description FROM "Permission" WHERE name = 'platform.administration.read'`,
    );
    if (preExisting.rows[0].description !== 'pre-existing')
      throw new Error('FAIL: an existing permission row was corrupted');
    if (Number(permCount.rows[0].count) !== Number(pre.rows[0].permissions) + 2) {
      throw new Error(
        `FAIL: expected exactly 2 new Task 0039 permissions added, got a total delta of ${Number(permCount.rows[0].count) - Number(pre.rows[0].permissions)}`,
      );
    }
    console.log(
      '  PASS: Task 0039 permission catalogue additions (2 new rows) do not corrupt existing permissions.',
    );

    console.log('\nALL CANDIDATE 0039 POST-0028 POPULATED-UPGRADE INVARIANTS VERIFIED.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('TEST FAILED:', error.message);
  process.exit(1);
});
