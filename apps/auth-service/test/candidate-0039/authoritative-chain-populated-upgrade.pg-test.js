/**
 * Candidate Task 0039 (PROVISIONAL) -- AUTHORITATIVE-MIGRATION-CHAIN
 * populated-upgrade gate.
 *
 * Unlike populated-upgrade-post-0028-verifier.pg-test.js (which hand-
 * builds a minimal synthetic approximation of the pre-0039 schema),
 * this script:
 *
 * 1. Applies every ACTUAL accepted migration file, in order, through
 *    Task 0032 -- not a hand-approximated schema.
 * 2. Seeds synthetic populated data through that REAL schema.
 * 3. Applies the ACTUAL Task 0039 migration file.
 * 4. Re-verifies every preservation invariant.
 *
 * This does not edit any accepted migration file and does not alter
 * production migration ordering -- it only reads and applies the
 * existing files, in their existing order, to a disposable test
 * database.
 *
 * IMPORTANT: each migration file is applied with `psql
 * --single-transaction` (one BEGIN/COMMIT per file), NOT the default
 * per-statement autocommit -- several accepted migrations use `CREATE
 * TEMP TABLE ... ON COMMIT DROP` patterns that require the whole file
 * to run as one transaction (temp tables scoped `ON COMMIT DROP` are
 * dropped the instant any single autocommitted statement completes,
 * which breaks a later statement in the SAME file that still needs the
 * temp table). This is a `psql` invocation detail only -- no migration
 * file content is altered.
 */
const { execFileSync } = require('child_process');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.AIM_CANDIDATE_0039_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('AIM_CANDIDATE_0039_DATABASE_URL is required. Refusing to run without it.');
  process.exit(1);
}

const MIGRATIONS_DIR = path.join(__dirname, '../../../../packages/database/prisma/migrations');
const TASK_0039_MIGRATION = '20260918140000_task_0039_pharmacy_onboarding_verification';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '99999999-9999-4999-8999-999999999999';
const PHARMACY_A = '33333333-3333-4333-8333-333333333333';
const PHARMACY_B = '44444444-4444-4444-8444-444444444444';
const PRODUCT_A = '55555555-5555-4555-8555-555555555555';
const INVENTORY_A = '66666666-6666-4666-8666-666666666666';
const BATCH_A = '77777777-7777-4777-8777-777777777777';

function applyMigrationFile(pgUrl, dir) {
  const migrationFile = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
  execFileSync(
    'psql',
    ['--single-transaction', '-v', 'ON_ERROR_STOP=1', pgUrl, '-f', migrationFile],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

async function main() {
  const migrationDirs = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((d) => d !== 'migration_lock.toml' && d !== TASK_0039_MIGRATION)
    .sort();

  console.log(
    `--- Applying ${migrationDirs.length} ACTUAL accepted migrations through Task 0032 (the current authoritative base) ---`,
  );
  for (const dir of migrationDirs) {
    try {
      applyMigrationFile(DATABASE_URL, dir);
    } catch (error) {
      console.error(`FAILED applying accepted migration ${dir}:`);
      console.error(error.stderr ? error.stderr.toString() : error.message);
      throw new Error(`Authoritative-chain gate could not apply accepted migration ${dir}`);
    }
  }
  console.log('  All accepted migrations applied successfully.\n');

  const client = new Client(DATABASE_URL);
  await client.connect();
  let preIsVerifiedA;
  let preIsVerifiedB;
  try {
    console.log('--- Seeding synthetic populated data through the REAL accepted schema ---');
    await client.query(`
      INSERT INTO "Tenant" (id, name, slug, "isActive", "updatedAt") VALUES
        ('${TENANT_A}', 'Tenant A', 'tenant-a-authchain', true, now()),
        ('${TENANT_B}', 'Tenant B', 'tenant-b-authchain', true, now());

      INSERT INTO "Provider" (id, "tenantId", "providerType", "businessName", "ownerName", email, phone, address, city, state, country, "postalCode", latitude, longitude, "isVerified", "updatedAt") VALUES
        ('${PHARMACY_A}', '${TENANT_A}', 'PHARMACY', 'Pharmacy A', 'Owner A', 'pharmacy-a-authchain@example.com', '+10000000001', 'Addr A', 'City A', 'State A', 'Country A', '00001', 1.0, 1.0, true, now()),
        ('${PHARMACY_B}', '${TENANT_B}', 'PHARMACY', 'Pharmacy B (Tenant B, isolation)', 'Owner B', 'pharmacy-b-authchain@example.com', '+10000000002', 'Addr B', 'City B', 'State B', 'Country B', '00002', 2.0, 2.0, false, now());

      INSERT INTO "ProviderVerification" (id, "tenantId", "providerType", status, "licenseNumber", "licenseExpiryDate", "businessRegistrationNumber", "governmentIdReference", "verifiedAt", "verifiedBy", "updatedAt") VALUES
        (gen_random_uuid(), '${TENANT_A}', 'PHARMACY', 'APPROVED', 'LEGACY-LIC-AUTHCHAIN', now() + interval '1 year', 'LEGACY-REG-AUTHCHAIN', 'LEGACY-GOV-AUTHCHAIN', now() - interval '10 days', '99999999-0000-4000-8000-000000000001', now());

      INSERT INTO "Product" (id, name, brand, category, manufacturer, "dosageForm", strength, "updatedAt") VALUES
        ('${PRODUCT_A}', 'Product A', 'Brand A', 'MEDICINE', 'Manufacturer A', 'TABLET', '10mg', now());

      INSERT INTO "Inventory" (id, "providerId", "productId", "sellingPrice", mrp, "discountPercentage", "taxPercentage", "tenantId", "updatedAt") VALUES
        ('${INVENTORY_A}', '${PHARMACY_A}', '${PRODUCT_A}', 10.00, 12.00, 0, 0, '${TENANT_A}', now());

      INSERT INTO "Batch" (id, "providerId", "productId", "batchNumber", "expiryDate", "receivedQuantity", "onHandQuantity", "purchasePrice", "sellingPrice", "tenantId", "inventoryId", "updatedAt") VALUES
        ('${BATCH_A}', '${PHARMACY_A}', '${PRODUCT_A}', 'BATCH-AUTHCHAIN-001', now() + interval '1 year', 100, 42, 8.00, 10.00, '${TENANT_A}', '${INVENTORY_A}', now());

      INSERT INTO "AvailabilityRequest" (id, "tenantId", "providerId", "productId", status, "requestedAt", "expiresAt", "updatedAt") VALUES
        (gen_random_uuid(), '${TENANT_A}', '${PHARMACY_A}', '${PRODUCT_A}', 'RESPONDED', now() - interval '2 days', now() - interval '1 day', now()),
        (gen_random_uuid(), '${TENANT_A}', '${PHARMACY_A}', '${PRODUCT_A}', 'RESPONDED', now() - interval '2 days', now() - interval '1 day', now()),
        (gen_random_uuid(), '${TENANT_A}', '${PHARMACY_A}', '${PRODUCT_A}', 'RESPONDED', now() - interval '1 hour', now() + interval '1 hour', now());

      INSERT INTO "PharmacyAvailabilityRequestPreference" ("providerId", "tenantId", "liveRequestsEnabled", timezone, "updatedAt") VALUES
        ('${PHARMACY_A}', '${TENANT_A}', true, 'Asia/Kolkata', now());
    `);
    console.log('  Seed complete.\n');

    const pre = await client.query(`
      SELECT
        (SELECT count(*) FROM "ProviderVerification") AS verifications,
        (SELECT count(*) FROM "Batch") AS batches,
        (SELECT count(*) FROM "AvailabilityRequest") AS availability_requests,
        (SELECT count(*) FROM "PharmacyAvailabilityRequestPreference") AS preferences,
        (SELECT "isVerified" FROM "Provider" WHERE id = '${PHARMACY_A}') AS pharmacy_a_verified,
        (SELECT "isVerified" FROM "Provider" WHERE id = '${PHARMACY_B}') AS pharmacy_b_verified
    `);
    console.log('  Pre-Task-0039-migration counts:', pre.rows[0]);
    preIsVerifiedA = pre.rows[0].pharmacy_a_verified;
    preIsVerifiedB = pre.rows[0].pharmacy_b_verified;

    console.log(
      '--- Verifying Task 0032 audit capability is intact BEFORE the Task 0039 migration ---',
    );
    await client.query(
      `INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "eventType", metadata) VALUES (gen_random_uuid(), 'PLATFORM', 'SYSTEM', 'SUCCEEDED', 'patient.profile.updated', '{}')`,
    );
    console.log('  PASS: patient.profile.updated is accepted pre-migration.');
  } finally {
    await client.end();
  }

  console.log('\n--- Applying the ACTUAL Task 0039 migration file ---');
  try {
    applyMigrationFile(DATABASE_URL, TASK_0039_MIGRATION);
  } catch (error) {
    console.error(error.stderr ? error.stderr.toString() : error.message);
    throw new Error('Task 0039 migration failed against the real authoritative-chain schema');
  }
  console.log('  Applied successfully.\n');

  const client2 = new Client(DATABASE_URL);
  await client2.connect();
  try {
    console.log(
      '--- Verifying populated-upgrade invariants against the REAL authoritative schema ---',
    );

    const post = await client2.query(`
      SELECT
        (SELECT count(*) FROM "ProviderVerification") AS verifications,
        (SELECT count(*) FROM "Batch") AS batches,
        (SELECT count(*) FROM "AvailabilityRequest") AS availability_requests,
        (SELECT count(*) FROM "PharmacyAvailabilityRequestPreference") AS preferences,
        (SELECT "isVerified" FROM "Provider" WHERE id = '${PHARMACY_A}') AS pharmacy_a_verified,
        (SELECT "isVerified" FROM "Provider" WHERE id = '${PHARMACY_B}') AS pharmacy_b_verified,
        (SELECT "tenantId" FROM "Provider" WHERE id = '${PHARMACY_A}') AS pharmacy_a_tenant
    `);

    if (Number(post.rows[0].verifications) < 1)
      throw new Error('FAIL: ProviderVerification row lost');
    console.log('  PASS: no ProviderVerification row lost.');

    const legacy = await client2.query(
      `SELECT "providerId", "isCurrent" FROM "ProviderVerification" WHERE "licenseNumber" = 'LEGACY-LIC-AUTHCHAIN'`,
    );
    if (legacy.rows[0].providerId !== null)
      throw new Error('FAIL: legacy row given a fabricated providerId');
    if (legacy.rows[0].isCurrent !== false)
      throw new Error('FAIL: legacy unlinked row must never be isCurrent');
    console.log(
      '  PASS: legacy unlinked verification preserved with providerId=NULL, isCurrent=false.',
    );

    let blocked = false;
    try {
      await client2.query(
        `UPDATE "ProviderVerification" SET "isCurrent" = true WHERE "licenseNumber" = 'LEGACY-LIC-AUTHCHAIN'`,
      );
    } catch (e) {
      blocked = true;
    }
    if (!blocked)
      throw new Error(
        'FAIL: expected the CHECK constraint to block isCurrent=true on the legacy row',
      );
    console.log('  PASS: no legacy row can be silently made current/verified after migration.');

    if (
      post.rows[0].pharmacy_a_verified !== preIsVerifiedA ||
      post.rows[0].pharmacy_b_verified !== preIsVerifiedB
    ) {
      throw new Error(
        'FAIL: a Provider.isVerified projection changed as a side effect of the migration alone',
      );
    }
    console.log('  PASS: Provider.isVerified projections unchanged by the migration alone.');

    if (post.rows[0].pharmacy_a_tenant !== TENANT_A)
      throw new Error('FAIL: provider/tenant ownership altered');
    console.log('  PASS: provider/tenant ownership unchanged.');

    if (Number(post.rows[0].batches) < 1) throw new Error('FAIL: Task 0025 Batch data affected');
    console.log('  PASS: Task 0025 (Batch) data survives.');

    if (Number(post.rows[0].availability_requests) < 3)
      throw new Error('FAIL: Task 0026 AvailabilityRequest data affected');
    console.log('  PASS: Task 0026 (AvailabilityRequest) data survives.');

    if (Number(post.rows[0].preferences) < 1)
      throw new Error('FAIL: Task 0027 preference data affected');
    console.log('  PASS: Task 0027 (PharmacyAvailabilityRequestPreference) data survives.');

    console.log('--- Verifying Task 0032 audit preservation AFTER the Task 0039 migration ---');
    const patientAuditCountBefore = await client2.query(
      `SELECT count(*) FROM "AuditEvent" WHERE "eventType" = 'patient.profile.updated'`,
    );
    if (Number(patientAuditCountBefore.rows[0].count) < 1) {
      throw new Error('FAIL: the pre-migration patient.profile.updated audit row was lost');
    }
    console.log(
      '  PASS: the pre-existing patient.profile.updated audit row survived the Task 0039 migration.',
    );

    await client2.query(
      `INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "eventType", metadata) VALUES (gen_random_uuid(), 'PLATFORM', 'SYSTEM', 'SUCCEEDED', 'patient.profile.updated', '{}')`,
    );
    console.log('  PASS: patient.profile.updated remains permitted after the Task 0039 migration.');

    // CORRECTION (CTO review): a single spot-check does not prove all
    // 7 Task 0039 event types are actually permitted -- attempt every
    // one individually and require each to succeed.
    const allTask0039EventTypes = [
      'pharmacy.verification.submitted',
      'pharmacy.verification.resubmitted',
      'pharmacy.verification.review-started',
      'pharmacy.verification.approved',
      'pharmacy.verification.rejected',
      'pharmacy.verification.suspended',
      'pharmacy.verification.expired',
    ];
    for (const eventType of allTask0039EventTypes) {
      await client2.query(
        `INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "eventType", metadata) VALUES (gen_random_uuid(), 'PLATFORM', 'SYSTEM', 'SUCCEEDED', $1, '{}')`,
        [eventType],
      );
    }
    console.log(
      '  PASS: all 7 Task 0039 pharmacy.verification.* events individually verified permitted (not a single spot-check).',
    );

    let bogusRejected = false;
    try {
      await client2.query(
        `INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "eventType", metadata) VALUES (gen_random_uuid(), 'PLATFORM', 'SYSTEM', 'SUCCEEDED', 'bogus.event.type', '{}')`,
      );
    } catch (e) {
      bogusRejected = true;
    }
    if (!bogusRejected) throw new Error('FAIL: expected a bogus event type to still be rejected');
    console.log(
      '  PASS: no pre-existing accepted audit event was lost, and the allowlist still rejects unknown types.',
    );

    console.log(
      '\nALL AUTHORITATIVE-MIGRATION-CHAIN POPULATED-UPGRADE INVARIANTS VERIFIED (against the REAL accepted schema through Task 0032, not a synthetic approximation).',
    );
  } finally {
    await client2.end();
  }
}

main().catch((error) => {
  console.error('TEST FAILED:', error.message);
  process.exit(1);
});
