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
  throw new Error('DATABASE_URL is required for Task 0044 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigrations = [
  '20260923185000_task_0044_inventory_exception_enum_prelude',
  '20260923190000_task_0044_inventory_exception_closure',
];
const firstUpgradeMigration = upgradeMigrations[0];
const upgradeMigration = upgradeMigrations[1];
const pnpmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';

for (const migrationName of upgradeMigrations) {
  if (!existsSync(join(sourceMigrations, migrationName, 'migration.sql'))) {
    throw new Error(`Required migration is missing: ${migrationName}`);
  }
}

function prismaProcessArgs(args) {
  return process.platform === 'win32'
    ? ['/d', '/c', 'pnpm.cmd', 'exec', 'prisma', ...args]
    : ['exec', 'prisma', ...args];
}

function databaseName() {
  return `medsphere_0044_upgrade_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0044-upgrade-'));
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
  for (const migrationName of readdirSync(sourceMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    if (migrationName >= firstUpgradeMigration) continue;
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }
  return { projectRoot, migrationsRoot, schemaFile };
}

function copyUpgrade(project) {
  for (const migrationName of upgradeMigrations) {
    cpSync(join(sourceMigrations, migrationName), join(project.migrationsRoot, migrationName), {
      recursive: true,
    });
  }
}

function createDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
}

function dropDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
}

const tenantId = '10000000-0000-4000-8000-000000004401';
const userId = '20000000-0000-4000-8000-000000004401';
const membershipId = '30000000-0000-4000-8000-000000004401';
const providerId = '40000000-0000-4000-8000-000000004401';
const productId = '50000000-0000-4000-8000-000000004401';
const inventoryId = '60000000-0000-4000-8000-000000004401';
const batchId = '70000000-0000-4000-8000-000000004401';
const movementId = '80000000-0000-4000-8000-000000004401';
const accessId = '90000000-0000-4000-8000-000000004401';
const identifierId = 'a0000000-0000-4000-8000-000000004401';
const importJobId = 'b0000000-0000-4000-8000-000000004401';
const importRowId = 'c0000000-0000-4000-8000-000000004401';
const importReceiptId = 'd0000000-0000-4000-8000-000000004401';
const reservationId = 'e0000000-0000-4000-8000-000000004401';
const reservationItemId = 'e0000000-0000-4000-8000-000000004402';
const reservationAllocationId = 'e0000000-0000-4000-8000-000000004403';
const posAuditId = 'f0000000-0000-4000-8000-000000004401';

const baselineSeedSql = `
INSERT INTO "Tenant"
  ("id","name","slug","organizationType","isActive","selfRegistrationEnabled","version","createdAt","updatedAt")
VALUES
  ('${tenantId}','Task 0044 Upgrade Pharmacy','task-0044-upgrade','PHARMACY',true,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "User"
  ("id","email","passwordHash","firstName","lastName","preferredLanguage","status","version","createdAt","updatedAt")
VALUES
  ('${userId}','task0044-upgrade@medsphere.test','fixture-not-a-real-credential','Task','0044','en','ACTIVE',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "TenantMembership"
  ("id","tenantId","userId","status","isDefault","joinedAt","version","createdAt","updatedAt")
VALUES
  ('${membershipId}','${tenantId}','${userId}','ACTIVE',true,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "Provider"
  ("id","tenantId","providerType","businessName","ownerName","email","phone","address","city","state","country","postalCode","latitude","longitude","isVerified","isActive","version","createdAt","updatedAt")
VALUES
  ('${providerId}','${tenantId}','PHARMACY','Task 0044 Upgrade Pharmacy','Fixture Owner','task0044-provider@medsphere.test','0000044001','Fixture address','Chennai','Tamil Nadu','India','600001',13.0827,80.2707,true,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "MembershipProviderAccess"
  ("id","tenantId","membershipId","providerId","createdAt")
VALUES
  ('${accessId}','${tenantId}','${membershipId}','${providerId}',CURRENT_TIMESTAMP);

INSERT INTO "Product"
  ("id","name","genericName","brand","category","manufacturer","dosageForm","strength","barcode","requiresPrescription","isActive","version","createdAt","updatedAt")
VALUES
  ('${productId}','Task 0044 Preserved Medicine','Preserved Generic','Preserved Brand','MEDICINE','Fixture Manufacturer','TABLET','500 mg','4006381333931',false,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "ProductIdentifier"
  ("id","productId","type","value","normalizedValue","isPrimary","createdAt")
VALUES
  ('${identifierId}','${productId}','EAN','4006381333931','04006381333931',true,CURRENT_TIMESTAMP);

INSERT INTO "Inventory"
  ("id","tenantId","providerId","productId","sku","sellingPrice","mrp","discountPercentage","taxPercentage","minimumStockLevel","isVisible","version","createdAt","updatedAt")
VALUES
  ('${inventoryId}','${tenantId}','${providerId}','${productId}','PRESERVED-0044',12.00,15.00,2.50,5.00,4,true,3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "Batch"
  ("id","tenantId","inventoryId","providerId","productId","batchNumber","manufacturingDate","expiryDate","receivedQuantity","onHandQuantity","heldQuantity","purchasePrice","sellingPrice","status","version","createdAt","updatedAt")
VALUES
  ('${batchId}','${tenantId}','${inventoryId}','${providerId}','${productId}','PRESERVED-BATCH-0044','2026-01-01','2030-01-01',20,17,2,10.00,12.00,'ACTIVE',5,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "StockMovement"
  ("id","tenantId","inventoryId","batchId","providerId","productId","type","delta","onHandBefore","onHandAfter","referenceType","referenceId","reason","idempotencyKey","commandHash","resultingBatchVersion","actorType","actorMembershipId","occurredAt","createdAt")
VALUES
  ('${movementId}','${tenantId}','${inventoryId}','${batchId}','${providerId}','${productId}','STOCK_IN',20,0,20,'inventory.batch.receive','${batchId}','Task 0044 upgrade fixture','task-0044-preserved-movement',NULL,1,'TENANT_USER','${membershipId}',CURRENT_TIMESTAMP - INTERVAL '1 day',CURRENT_TIMESTAMP - INTERVAL '1 day');

INSERT INTO "InventoryImportJob"
  ("id","tenantId","providerId","stagedByMembershipId","appliedByMembershipId","sourceFormat","sourceFileName","contentHash","mapping","stageIdempotencyKey","stageCommandHash","applyIdempotencyKey","applyCommandHash","status","rowCount","validRowCount","invalidRowCount","appliedAt","createdAt")
VALUES
  ('${importJobId}','${tenantId}','${providerId}','${membershipId}','${membershipId}','CSV','preserved.csv',repeat('a',64),'{"Barcode":"identifier"}'::jsonb,'task-0044-preserved-stage',repeat('b',64),'task-0044-preserved-apply',repeat('c',64),'APPLIED',1,1,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "InventoryImportRow"
  ("id","importJobId","tenantId","providerId","rowNumber","productId","payload","validationErrors","status","inventoryId","batchId","appliedAt","createdAt")
VALUES
  ('${importRowId}','${importJobId}','${tenantId}','${providerId}',2,'${productId}','{"quantity":3}'::jsonb,'[]'::jsonb,'APPLIED','${inventoryId}','${batchId}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "InventoryImportReceipt"
  ("id","importJobId","tenantId","providerId","actorMembershipId","appliedRowCount","totalQuantity","createdAt")
VALUES
  ('${importReceiptId}','${importJobId}','${tenantId}','${providerId}','${membershipId}',1,3,CURRENT_TIMESTAMP);

INSERT INTO "MedicineReservation"
  ("id","tenantId","providerId","subjectUserId","status","expiresAt","confirmedAt","readyAt","idempotencyKey","creationHash","version","createdAt","updatedAt")
VALUES
  ('${reservationId}','${tenantId}','${providerId}','${userId}','READY','2030-01-01',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'task-0044-preserved-reservation',repeat('d',64),2,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "MedicineReservationItem"
  ("id","tenantId","reservationId","providerId","productId","quantity","createdAt")
VALUES
  ('${reservationItemId}','${tenantId}','${reservationId}','${providerId}','${productId}',2,CURRENT_TIMESTAMP);

INSERT INTO "MedicineReservationAllocation"
  ("id","tenantId","reservationId","itemId","inventoryId","batchId","providerId","productId","quantity","status","createdAt")
VALUES
  ('${reservationAllocationId}','${tenantId}','${reservationId}','${reservationItemId}','${inventoryId}','${batchId}','${providerId}','${productId}',2,'HELD',CURRENT_TIMESTAMP);
`;

const afterUpgradeAssertions = `
DO $$
DECLARE
  migration_count INTEGER;
BEGIN
  IF (SELECT count(*) FROM "Product" WHERE "id" = '${productId}' AND "barcode" = '4006381333931') <> 1 THEN
    RAISE EXCEPTION 'Task 0044 upgrade mutated accepted Product data';
  END IF;

  IF (SELECT count(*) FROM "ProductIdentifier" WHERE "id" = '${identifierId}' AND "normalizedValue" = '04006381333931') <> 1 THEN
    RAISE EXCEPTION 'Task 0044 upgrade mutated accepted barcode identifier data';
  END IF;

  IF (SELECT count(*) FROM "Inventory" WHERE "id" = '${inventoryId}' AND "sellingPrice" = 12.00 AND "taxPercentage" = 5.00 AND "version" = 3) <> 1 THEN
    RAISE EXCEPTION 'Task 0044 upgrade mutated accepted Inventory data';
  END IF;

  IF (SELECT count(*) FROM "Batch" WHERE "id" = '${batchId}' AND "onHandQuantity" = 17 AND "heldQuantity" = 2 AND "version" = 5) <> 1 THEN
    RAISE EXCEPTION 'Task 0044 upgrade mutated accepted Batch quantities';
  END IF;

  IF (SELECT count(*) FROM "StockMovement" WHERE "id" = '${movementId}' AND "delta" = 20 AND "onHandBefore" = 0 AND "onHandAfter" = 20) <> 1 THEN
    RAISE EXCEPTION 'Task 0044 upgrade mutated accepted stock ledger evidence';
  END IF;

  IF (SELECT count(*) FROM "InventoryImportJob" WHERE "id" = '${importJobId}' AND "status" = 'APPLIED') <> 1
     OR (SELECT count(*) FROM "InventoryImportRow" WHERE "id" = '${importRowId}' AND "status" = 'APPLIED') <> 1
     OR (SELECT count(*) FROM "InventoryImportReceipt" WHERE "id" = '${importReceiptId}' AND "totalQuantity" = 3) <> 1 THEN
    RAISE EXCEPTION 'Task 0044 upgrade mutated accepted Task 0042 import evidence';
  END IF;

  IF (SELECT count(*) FROM "MedicineReservation" WHERE "id" = '${reservationId}' AND "status" = 'READY' AND "version" = 2) <> 1
     OR (SELECT count(*) FROM "MedicineReservationAllocation" WHERE "id" = '${reservationAllocationId}' AND "status" = 'HELD' AND "quantity" = 2) <> 1 THEN
    RAISE EXCEPTION 'Task 0044 upgrade mutated existing reservation evidence';
  END IF;

  IF (SELECT count(*) FROM "PharmacySale") <> 0
     OR (SELECT count(*) FROM "PharmacyInvoice") <> 0
     OR (SELECT count(*) FROM "PharmacySalePayment") <> 0 THEN
    RAISE EXCEPTION 'Task 0044 upgrade fabricated POS transaction history';
  END IF;

  IF (SELECT count(*) FROM "Permission" WHERE "name" IN ('billing.pos.read','billing.pos.checkout','billing.pos.configure','billing.pos.void')) <> 4 THEN
    RAISE EXCEPTION 'Task 0044 POS permission catalogue is incomplete';
  END IF;

  IF (SELECT count(*) FROM "PharmacySaleReturn") <> 0
     OR (SELECT count(*) FROM "PharmacySaleReturnLine") <> 0
     OR (SELECT count(*) FROM "PharmacySaleReturnAllocation") <> 0
     OR (SELECT count(*) FROM "BatchRecallRecord") <> 0
     OR (SELECT count(*) FROM "InventoryExceptionRequest") <> 0
     OR (SELECT count(*) FROM "InventoryExceptionDecision") <> 0 THEN
    RAISE EXCEPTION 'Task 0044 upgrade fabricated inventory exception history';
  END IF;

  IF (SELECT count(*) FROM "Permission"
      WHERE "name" IN (
        'billing.pos.return',
        'inventory.batch.recall',
        'inventory.exception.request',
        'inventory.exception.approve'
      )) <> 4 THEN
    RAISE EXCEPTION 'Task 0044 permission catalogue is incomplete';
  END IF;

  SELECT count(*) INTO migration_count
  FROM "_prisma_migrations"
  WHERE "migration_name" = '${upgradeMigration}'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL;
  IF migration_count <> 1 THEN
    RAISE EXCEPTION 'Task 0044 migration is not recorded exactly once: %', migration_count;
  END IF;
END $$;

INSERT INTO "AuditEvent"
  ("id","scope","actorType","outcome","tenantId","actorMembershipId","actorUserId","eventType","resourceType","resourceId","metadata","occurredAt")
VALUES
  ('${posAuditId}','TENANT','TENANT_USER','SUCCEEDED','${tenantId}','${membershipId}','${userId}',
   'billing.pos.fiscal-profile.configured','PharmacyFiscalProfile','${providerId}',
   '{"providerId":"${providerId}","registrationType":"GST_REGULAR","version":1}'::jsonb,CURRENT_TIMESTAMP);
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

    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(
      project.schemaFile,
      scopedDatabaseUrl,
      `
DO $$
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name" = '${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0044 repeated deploy changed migration history';
  END IF;
  IF (SELECT count(*) FROM "Inventory" WHERE "id" = '${inventoryId}') <> 1
     OR (SELECT count(*) FROM "Batch" WHERE "id" = '${batchId}' AND "onHandQuantity" = 17 AND "heldQuantity" = 2) <> 1
     OR (SELECT count(*) FROM "StockMovement" WHERE "id" = '${movementId}') <> 1
     OR (SELECT count(*) FROM "InventoryImportReceipt" WHERE "id" = '${importReceiptId}') <> 1
     OR (SELECT count(*) FROM "MedicineReservation" WHERE "id" = '${reservationId}' AND "status" = 'READY') <> 1 THEN
    RAISE EXCEPTION 'Task 0044 repeated deploy changed accepted data';
  END IF;
END $$;
`,
    );

    process.stdout.write('Task 0044 populated upgrade verification passed.\n');
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}

verifyPopulatedUpgrade();
