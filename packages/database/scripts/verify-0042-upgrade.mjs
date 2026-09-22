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
  throw new Error('DATABASE_URL is required for Task 0042 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration = '20260922100000_task_0042_pharmacy_catalog_barcode_inventory_import';
const pnpmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';

if (!existsSync(join(sourceMigrations, upgradeMigration, 'migration.sql'))) {
  throw new Error(`Required migration is missing: ${upgradeMigration}`);
}

function prismaProcessArgs(args) {
  if (process.platform === 'win32') {
    return ['/d', '/c', 'pnpm.cmd', 'exec', 'prisma', ...args];
  }
  return ['exec', 'prisma', ...args];
}

function databaseName() {
  return `medsphere_0042_upgrade_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function databaseUrlForName(name) {
  const scoped = new URL(databaseUrl);
  scoped.pathname = `/${name}`;
  scoped.searchParams.set('schema', 'public');
  return scoped.toString();
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
    shell: false,
    env: {
      ...process.env,
      DATABASE_URL: scopedDatabaseUrl,
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    input: options.input,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  const output = sanitize(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status !== 0) {
    throw new Error(`Prisma command failed: ${args.join(' ')}\n${output.slice(-6000)}`);
  }
  return output;
}

function executeSql(schemaFile, scopedDatabaseUrl, sql) {
  runPrisma(['db', 'execute', '--stdin', '--schema', schemaFile], scopedDatabaseUrl, {
    input: sql,
  });
}

function createMigrationProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0042-upgrade-'));
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

  const migrationNames = readdirSync(sourceMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationName of migrationNames) {
    if (migrationName >= upgradeMigration) continue;
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { projectRoot, migrationsRoot, schemaFile };
}

function copyUpgrade(project) {
  cpSync(join(sourceMigrations, upgradeMigration), join(project.migrationsRoot, upgradeMigration), {
    recursive: true,
  });
}

function createDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
}

function dropDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
}

const tenantId = '10000000-0000-4000-8000-000000004201';
const userId = '20000000-0000-4000-8000-000000004201';
const membershipId = '30000000-0000-4000-8000-000000004201';
const providerId = '40000000-0000-4000-8000-000000004201';
const productId = '50000000-0000-4000-8000-000000004201';
const inventoryId = '60000000-0000-4000-8000-000000004201';
const batchId = '70000000-0000-4000-8000-000000004201';
const movementId = '80000000-0000-4000-8000-000000004201';
const accessId = '90000000-0000-4000-8000-000000004201';
const existingAuditId = 'a0000000-0000-4000-8000-000000004201';
const newAuditId = 'a0000000-0000-4000-8000-000000004202';
const importJobId = 'b0000000-0000-4000-8000-000000004201';
const importReceiptId = 'c0000000-0000-4000-8000-000000004201';

const baselineSeedSql = `
INSERT INTO "Tenant"
  ("id", "name", "slug", "organizationType", "isActive",
   "selfRegistrationEnabled", "version", "createdAt", "updatedAt")
VALUES
  ('${tenantId}', 'Task 0042 Upgrade Pharmacy', 'task-0042-upgrade', 'PHARMACY',
   true, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "User"
  ("id", "email", "passwordHash", "firstName", "lastName", "preferredLanguage",
   "status", "version", "createdAt", "updatedAt")
VALUES
  ('${userId}', 'task0042-upgrade@medsphere.test', 'fixture-not-a-real-credential',
   'Task', '0042', 'en', 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "TenantMembership"
  ("id", "tenantId", "userId", "status", "isDefault", "joinedAt",
   "version", "createdAt", "updatedAt")
VALUES
  ('${membershipId}', '${tenantId}', '${userId}', 'ACTIVE', true,
   CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Provider"
  ("id", "tenantId", "providerType", "businessName", "ownerName", "email",
   "phone", "address", "city", "state", "country", "postalCode", "latitude",
   "longitude", "isVerified", "isActive", "version", "createdAt", "updatedAt")
VALUES
  ('${providerId}', '${tenantId}', 'PHARMACY', 'Task 0042 Upgrade Pharmacy',
   'Fixture Owner', 'task0042-provider@medsphere.test', '0000042001',
   'Fixture address', 'Chennai', 'Tamil Nadu', 'India', '600001',
   13.0827, 80.2707, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "MembershipProviderAccess"
  ("id", "tenantId", "membershipId", "providerId", "createdAt")
VALUES
  ('${accessId}', '${tenantId}', '${membershipId}', '${providerId}', CURRENT_TIMESTAMP);

INSERT INTO "Product"
  ("id", "name", "genericName", "brand", "category", "manufacturer",
   "dosageForm", "strength", "barcode", "requiresPrescription",
   "isActive", "version", "createdAt", "updatedAt")
VALUES
  ('${productId}', 'Task 0042 Legacy Medicine', 'Legacy Generic', 'Legacy Brand',
   'MEDICINE', 'Fixture Manufacturer', 'TABLET', '500 mg', '4006381333931',
   false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Inventory"
  ("id", "tenantId", "providerId", "productId", "sku", "sellingPrice", "mrp",
   "discountPercentage", "taxPercentage", "minimumStockLevel", "isVisible",
   "version", "createdAt", "updatedAt")
VALUES
  ('${inventoryId}', '${tenantId}', '${providerId}', '${productId}', 'LEGACY-0042',
   12.00, 15.00, 0.00, 5.00, 4, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Batch"
  ("id", "tenantId", "inventoryId", "providerId", "productId", "batchNumber",
   "manufacturingDate", "expiryDate", "receivedQuantity", "onHandQuantity",
   "heldQuantity", "purchasePrice", "sellingPrice", "status", "version",
   "createdAt", "updatedAt")
VALUES
  ('${batchId}', '${tenantId}', '${inventoryId}', '${providerId}', '${productId}',
   'LEGACY-BATCH-0042', '2026-01-01 00:00:00', '2030-01-01 00:00:00',
   20, 17, 2, 10.00, 12.00, 'ACTIVE', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "StockMovement"
  ("id", "tenantId", "inventoryId", "batchId", "providerId", "productId",
   "type", "delta", "onHandBefore", "onHandAfter", "referenceType", "referenceId",
   "reason", "idempotencyKey", "commandHash", "resultingBatchVersion",
   "actorType", "actorMembershipId", "occurredAt", "createdAt")
VALUES
  ('${movementId}', '${tenantId}', '${inventoryId}', '${batchId}', '${providerId}',
   '${productId}', 'STOCK_IN', 20, 0, 20, 'inventory.batch.receive', '${batchId}',
   'Task 0042 upgrade fixture', 'task-0042-legacy-movement', NULL, 1,
   'TENANT_USER', '${membershipId}', CURRENT_TIMESTAMP - INTERVAL '1 day',
   CURRENT_TIMESTAMP - INTERVAL '1 day');

INSERT INTO "AuditEvent"
  ("id", "scope", "actorType", "outcome", "tenantId", "actorMembershipId",
   "actorUserId", "eventType", "resourceType", "resourceId", "metadata", "occurredAt")
VALUES
  ('${existingAuditId}', 'TENANT', 'TENANT_USER', 'SUCCEEDED', '${tenantId}',
   '${membershipId}', '${userId}', 'inventory.batch.received', 'Batch',
   '${batchId}', '{"productId":"${productId}","quantity":20}'::jsonb, CURRENT_TIMESTAMP);
`;

const afterUpgradeAssertions = `
DO $$
DECLARE
  preserved_count INTEGER;
  identifier_count INTEGER;
  job_count INTEGER;
  receipt_count INTEGER;
  migration_count INTEGER;
BEGIN
  SELECT count(*) INTO preserved_count
  FROM "Inventory"
  WHERE "id" = '${inventoryId}'
    AND "tenantId" = '${tenantId}'
    AND "providerId" = '${providerId}'
    AND "productId" = '${productId}'
    AND "sku" = 'LEGACY-0042'
    AND "sellingPrice" = 12.00
    AND "mrp" = 15.00
    AND "minimumStockLevel" = 4
    AND "version" = 3;

  IF preserved_count <> 1 THEN
    RAISE EXCEPTION 'Task 0042 upgrade mutated existing Inventory';
  END IF;

  SELECT count(*) INTO preserved_count
  FROM "Batch"
  WHERE "id" = '${batchId}'
    AND "batchNumber" = 'LEGACY-BATCH-0042'
    AND "receivedQuantity" = 20
    AND "onHandQuantity" = 17
    AND "heldQuantity" = 2
    AND "version" = 5;

  IF preserved_count <> 1 THEN
    RAISE EXCEPTION 'Task 0042 upgrade mutated existing Batch quantities or version';
  END IF;

  SELECT count(*) INTO preserved_count
  FROM "StockMovement"
  WHERE "id" = '${movementId}'
    AND "delta" = 20
    AND "onHandBefore" = 0
    AND "onHandAfter" = 20;

  IF preserved_count <> 1 THEN
    RAISE EXCEPTION 'Task 0042 upgrade mutated existing stock ledger evidence';
  END IF;

  SELECT count(*) INTO preserved_count
  FROM "Product"
  WHERE "id" = '${productId}'
    AND "barcode" = '4006381333931';

  IF preserved_count <> 1 THEN
    RAISE EXCEPTION 'Task 0042 upgrade mutated legacy Product.barcode';
  END IF;

  SELECT count(*) INTO identifier_count FROM "ProductIdentifier";
  IF identifier_count <> 0 THEN
    RAISE EXCEPTION 'Task 0042 upgrade fabricated canonical identifiers from legacy barcode values';
  END IF;

  SELECT count(*) INTO job_count FROM "InventoryImportJob";
  SELECT count(*) INTO receipt_count FROM "InventoryImportReceipt";
  IF job_count <> 0 OR receipt_count <> 0 THEN
    RAISE EXCEPTION 'Task 0042 upgrade fabricated import history';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AuditEvent"
    WHERE "id" = '${existingAuditId}'
      AND "eventType" = 'inventory.batch.received'
  ) THEN
    RAISE EXCEPTION 'Task 0042 upgrade failed to preserve accepted audit evidence';
  END IF;

  SELECT count(*) INTO migration_count
  FROM "_prisma_migrations"
  WHERE "migration_name" = '${upgradeMigration}'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL;

  IF migration_count <> 1 THEN
    RAISE EXCEPTION 'Task 0042 migration is not recorded exactly once: %', migration_count;
  END IF;
END $$;

INSERT INTO "AuditEvent"
  ("id", "scope", "actorType", "outcome", "tenantId", "eventType",
   "resourceType", "resourceId", "metadata", "occurredAt")
VALUES
  ('${newAuditId}', 'TENANT', 'SYSTEM', 'SUCCEEDED', '${tenantId}',
   'inventory.import.staged', 'InventoryImportJob', '${importJobId}',
   '{"providerId":"${providerId}","rowCount":1,"validRowCount":1,"invalidRowCount":0,"sourceFormat":"CSV"}'::jsonb,
   CURRENT_TIMESTAMP);

INSERT INTO "InventoryImportJob"
  ("id", "tenantId", "providerId", "stagedByMembershipId", "sourceFormat",
   "sourceFileName", "contentHash", "mapping", "stageIdempotencyKey",
   "stageCommandHash", "status", "rowCount", "validRowCount", "invalidRowCount",
   "createdAt")
VALUES
  ('${importJobId}', '${tenantId}', '${providerId}', '${membershipId}', 'CSV',
   'upgrade-proof.csv', repeat('a', 64), '{"Barcode":"identifier"}'::jsonb,
   'upgrade-proof-stage', repeat('b', 64), 'STAGED', 1, 1, 0, CURRENT_TIMESTAMP);

INSERT INTO "InventoryImportReceipt"
  ("id", "importJobId", "tenantId", "providerId", "actorMembershipId",
   "appliedRowCount", "totalQuantity", "createdAt")
VALUES
  ('${importReceiptId}', '${importJobId}', '${tenantId}', '${providerId}',
   '${membershipId}', 1, 3, CURRENT_TIMESTAMP);

DO $$
BEGIN
  BEGIN
    UPDATE "InventoryImportReceipt"
    SET "totalQuantity" = 99
    WHERE "id" = '${importReceiptId}';

    RAISE EXCEPTION 'Task 0042 append-only receipt UPDATE unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'Task 0042 append-only receipt UPDATE unexpectedly succeeded' THEN
        RAISE;
      END IF;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    DELETE FROM "InventoryImportReceipt"
    WHERE "id" = '${importReceiptId}';

    RAISE EXCEPTION 'Task 0042 append-only receipt DELETE unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'Task 0042 append-only receipt DELETE unexpectedly succeeded' THEN
        RAISE;
      END IF;
  END;
END $$;
`;

function verifyPopulatedUpgrade() {
  const name = databaseName();
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    createDatabase(project.schemaFile, name);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, baselineSeedSql);

    copyUpgrade(project);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, afterUpgradeAssertions);

    // Repeated production deploy must be a no-op.
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(
      project.schemaFile,
      scopedDatabaseUrl,
      `
DO $$
DECLARE migration_count INTEGER;
BEGIN
  SELECT count(*) INTO migration_count
  FROM "_prisma_migrations"
  WHERE "migration_name" = '${upgradeMigration}'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL;

  IF migration_count <> 1 THEN
    RAISE EXCEPTION 'Task 0042 repeated deploy changed migration history: %', migration_count;
  END IF;

  IF (SELECT count(*) FROM "Inventory" WHERE "id" = '${inventoryId}') <> 1
     OR (SELECT count(*) FROM "Batch" WHERE "id" = '${batchId}') <> 1
     OR (SELECT count(*) FROM "StockMovement" WHERE "id" = '${movementId}') <> 1 THEN
    RAISE EXCEPTION 'Task 0042 repeated deploy changed existing inventory evidence';
  END IF;
END $$;
`,
    );

    process.stdout.write('Task 0042 populated upgrade verification passed.\n');
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}

verifyPopulatedUpgrade();
