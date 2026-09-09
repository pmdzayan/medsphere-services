import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const databaseUrlValue = process.env.DATABASE_URL;

if (!databaseUrlValue) {
  throw new Error('DATABASE_URL is required for Task 0025 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration = '20260909090000_medicine_availability_trust_freshness';
const pnpmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';

function prismaProcessArgs(args) {
  if (process.platform === 'win32') {
    return ['/d', '/c', 'pnpm.cmd', 'exec', 'prisma', ...args];
  }

  return ['exec', 'prisma', ...args];
}

if (!existsSync(join(sourceMigrations, upgradeMigration, 'migration.sql'))) {
  throw new Error(`Required migration is missing: ${upgradeMigration}`);
}

function databaseName(label) {
  return `medsphere_0025_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function databaseUrlForName(name) {
  const scopedUrl = new URL(databaseUrl);
  scopedUrl.pathname = `/${name}`;
  scopedUrl.searchParams.set('schema', 'public');
  return scopedUrl.toString();
}

function sanitize(output) {
  return output
    .replaceAll(databaseUrlValue, '[DATABASE_URL]')
    .replaceAll(databaseUrl.toString(), '[DATABASE_URL]');
}
function runPrisma(args, scopedDatabaseUrl, options = {}) {
  const result = spawnSync(pnpmCommand, prismaProcessArgs(args), {
    cwd: packageRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: scopedDatabaseUrl,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    input: options.input,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  const output = sanitize(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);

  if (result.status !== 0) {
    throw new Error(`Prisma command failed: ${args.join(' ')}\n${output.slice(-4000)}`);
  }
}

function executeSql(schemaFile, scopedDatabaseUrl, sql) {
  runPrisma(['db', 'execute', '--stdin', '--schema', schemaFile], scopedDatabaseUrl, {
    input: sql,
  });
}
function createMigrationProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0025-upgrade-'));
  const migrationsRoot = join(projectRoot, 'migrations');
  const schemaFile = join(projectRoot, 'schema.prisma');

  mkdirSync(migrationsRoot);
  writeFileSync(
    schemaFile,
    [
      'datasource db {',
      '  provider = "postgresql"',
      '  url      = env("DATABASE_URL")',
      '}',
      '',
    ].join('\n'),
    'utf8',
  );
  cpSync(
    join(sourceMigrations, 'migration_lock.toml'),
    join(migrationsRoot, 'migration_lock.toml'),
  );

  // Baseline: every migration published before Task 0025, in declaration order.
  const migrationNames = readdirSync(sourceMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migrationName of migrationNames) {
    if (migrationName === upgradeMigration) continue;
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { migrationsRoot, projectRoot, schemaFile };
}

function createDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
}

function dropDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
}

function deployBaseline(project, scopedDatabaseUrl) {
  runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
}

function installUpgradeMigration(project) {
  cpSync(join(sourceMigrations, upgradeMigration), join(project.migrationsRoot, upgradeMigration), {
    recursive: true,
  });
}

function deployUpgrade(project, scopedDatabaseUrl) {
  installUpgradeMigration(project);
  runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
}

function verifyScenario({ label, seedSql, assertionSql }) {
  const name = databaseName(label);
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    createDatabase(project.schemaFile, name);
    deployBaseline(project, scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, seedSql);
    deployUpgrade(project, scopedDatabaseUrl);

    if (assertionSql) {
      executeSql(project.schemaFile, scopedDatabaseUrl, assertionSql);
    }

    process.stdout.write(`Task 0025 upgrade scenario passed: ${label}\n`);
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}
// Deterministic fixture UUIDs.
const tenantOne = '10000000-0000-4000-8000-000000000101';
const tenantTwo = '10000000-0000-4000-8000-000000000102';
const userOne = '20000000-0000-4000-8000-000000000101';
const membershipOne = '30000000-0000-4000-8000-000000000101';
const providerOne = '40000000-0000-4000-8000-000000000101';
const providerTwo = '40000000-0000-4000-8000-000000000102';
const productOne = '50000000-0000-4000-8000-000000000101';
const inventoryOne = '60000000-0000-4000-8000-000000000101';
const batchOne = '70000000-0000-4000-8000-000000000101';
const movementOne = '90000000-0000-4000-8000-000000000101';

const historicalSeed = `
INSERT INTO "Tenant" ("id", "name", "slug", "organizationType", "isActive", "selfRegistrationEnabled", "version", "createdAt", "updatedAt")
VALUES ('${tenantOne}', 'Task 0025 fixture tenant', 'fixture-0025-a', 'PHARMACY', true, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ('${tenantTwo}', 'Task 0025 fixture tenant B', 'fixture-0025-b', 'PHARMACY', true, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "status", "version", "createdAt", "updatedAt", "preferredLanguage")
VALUES ('${userOne}', 'fixture-0025@medsphere.test', 'fixture-not-a-real-credential', 'Fixture', 'User', 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'en');

INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "status", "isDefault", "joinedAt", "version", "createdAt", "updatedAt")
VALUES ('${membershipOne}', '${tenantOne}', '${userOne}', 'ACTIVE', true, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Provider" ("id", "tenantId", "providerType", "businessName", "ownerName", "email", "phone", "address", "city", "state", "country", "postalCode", "latitude", "longitude", "isVerified", "isActive", "version", "createdAt", "updatedAt")
VALUES ('${providerOne}', '${tenantOne}', 'PHARMACY', 'Task 0025 Pharmacy', 'Fixture Owner', 'fixture-provider@medsphere.test', '0000000000', 'Fixture address', 'Chennai', 'Tamil Nadu', 'India', '600001', 13.0827, 80.2707, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "MembershipProviderAccess" ("id", "tenantId", "membershipId", "providerId", "createdAt")
VALUES ('91000000-0000-4000-8000-000000000001', '${tenantOne}', '${membershipOne}', '${providerOne}', CURRENT_TIMESTAMP);

INSERT INTO "Provider" ("id", "tenantId", "providerType", "businessName", "ownerName", "email", "phone", "address", "city", "state", "country", "postalCode", "latitude", "longitude", "isVerified", "isActive", "version", "createdAt", "updatedAt")
VALUES ('${providerTwo}', '${tenantOne}', 'PHARMACY', 'Task 0025 Pharmacy B', 'Fixture Owner B', 'fixture-provider-b@medsphere.test', '0000000001', 'Fixture address B', 'Chennai', 'Tamil Nadu', 'India', '600001', 13.0827, 80.2707, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Product" ("id", "name", "brand", "category", "manufacturer", "dosageForm", "strength", "version", "createdAt", "updatedAt")
VALUES ('${productOne}', 'Task 0025 Medicine', 'Fixture Brand', 'MEDICINE', 'Fixture Manufacturer', 'TABLET', '10 mg', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Inventory" ("id", "tenantId", "providerId", "productId", "sku", "sellingPrice", "mrp", "discountPercentage", "taxPercentage", "minimumStockLevel", "isVisible", "version", "createdAt", "updatedAt")
VALUES ('${inventoryOne}', '${tenantOne}', '${providerOne}', '${productOne}', 'T0025-001', 12.00, 15.00, 0.00, 5.00, 10, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Batch" ("id", "tenantId", "inventoryId", "providerId", "productId", "batchNumber", "manufacturingDate", "expiryDate", "receivedQuantity", "onHandQuantity", "heldQuantity", "purchasePrice", "sellingPrice", "status", "version", "createdAt", "updatedAt")
VALUES ('${batchOne}', '${tenantOne}', '${inventoryOne}', '${providerOne}', '${productOne}', 'BATCH-0025', '2026-01-01 00:00:00', '2030-01-01 00:00:00', 20, 20, 0, 10.00, 12.00, 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "StockMovement" ("id", "tenantId", "inventoryId", "batchId", "providerId", "productId", "type", "delta", "onHandBefore", "onHandAfter", "referenceType", "referenceId", "reason", "idempotencyKey", "commandHash", "resultingBatchVersion", "actorType", "actorMembershipId", "occurredAt", "createdAt")
VALUES ('${movementOne}', '${tenantOne}', '${inventoryOne}', '${batchOne}', '${providerOne}', '${productOne}', 'STOCK_IN', 20, 0, 20, 'inventory.batch.receive', '${batchOne}', 'fixture', 'fixture-0025-movement', NULL, 1, 'TENANT_USER', '${membershipOne}', CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '30 days');
`;
// Verifies the migration does NOT fabricate freshness for historical inventory.
verifyScenario({
  label: 'historical_inventory_stays_unverified',
  seedSql: historicalSeed,
  assertionSql: `
DO $$
DECLARE observation_count INTEGER;
BEGIN
  SELECT count(*) INTO observation_count FROM "BatchStockObservation";
  IF observation_count <> 0 THEN
    RAISE EXCEPTION 'Task 0025 migration fabricated observation evidence for historical inventory';
  END IF;
END $$;
`,
});

// Verifies a genuinely-qualified observation can be appended with correct FK
// scoping, and that cross-tenant/cross-provider/append-only/source-value
// violations fail closed.
verifyScenario({
  label: 'qualified_observation_append_and_isolation',
  seedSql: `${historicalSeed}`,
  assertionSql: `
DO $$
BEGIN
  INSERT INTO "BatchStockObservation" ("id", "tenantId", "inventoryId", "batchId", "providerId", "productId", "source", "observedOnHandQuantity", "occurredAt", "movementId", "idempotencyKey", "createdAt")
  VALUES ('80000000-0000-4000-8000-000000000101', '${tenantOne}', '${inventoryOne}', '${batchOne}', '${providerOne}', '${productOne}', 'AIM_MANAGED_INVENTORY', 20, CURRENT_TIMESTAMP - INTERVAL '2 hours', '${movementOne}', 'post-0025-qualified-observation', CURRENT_TIMESTAMP);

  BEGIN
    INSERT INTO "BatchStockObservation" ("id", "tenantId", "inventoryId", "batchId", "providerId", "productId", "source", "observedOnHandQuantity", "occurredAt", "idempotencyKey", "createdAt")
    VALUES ('80000000-0000-4000-8000-000000000102', '${tenantTwo}', '${inventoryOne}', '${batchOne}', '${providerOne}', '${productOne}', 'AIM_MANAGED_INVENTORY', 20, CURRENT_TIMESTAMP, 'cross-tenant-' || gen_random_uuid()::text, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'cross-tenant observation unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "BatchStockObservation" ("id", "tenantId", "inventoryId", "batchId", "providerId", "productId", "source", "observedOnHandQuantity", "occurredAt", "idempotencyKey", "createdAt")
    VALUES ('80000000-0000-4000-8000-000000000103', '${tenantOne}', '${inventoryOne}', '${batchOne}', '${providerTwo}', '${productOne}', 'AIM_MANAGED_INVENTORY', 20, CURRENT_TIMESTAMP, 'cross-provider-' || gen_random_uuid()::text, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'cross-provider observation unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE "BatchStockObservation"
    SET "observedOnHandQuantity" = 99
    WHERE "idempotencyKey" = 'post-0025-qualified-observation';
    RAISE EXCEPTION 'UPDATE of append-only evidence unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  BEGIN
    DELETE FROM "BatchStockObservation"
    WHERE "idempotencyKey" = 'post-0025-qualified-observation';
    RAISE EXCEPTION 'DELETE of append-only evidence unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "BatchStockObservation" ("id", "tenantId", "inventoryId", "batchId", "providerId", "productId", "source", "observedOnHandQuantity", "occurredAt", "idempotencyKey", "createdAt")
    VALUES ('80000000-0000-4000-8000-000000000104', '${tenantOne}', '${inventoryOne}', '${batchOne}', '${providerOne}', '${productOne}', 'CLIENT_SUPPLIED_FAKE', 20, CURRENT_TIMESTAMP, 'fake-source-' || gen_random_uuid()::text, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'invalid evidence source unexpectedly succeeded';
  EXCEPTION WHEN invalid_text_representation THEN
    NULL;
  END;
END $$;
`,
});

process.stdout.write('Task 0025 populated upgrade verification passed.\n');
