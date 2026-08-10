import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const databaseUrlValue = process.env.DATABASE_URL;

if (!databaseUrlValue) {
  throw new Error('DATABASE_URL is required for S0.5 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const baselineMigrations = [
  '20260715163416_init_auth_schema',
  '20260720020000_complete_reproducible_baseline',
  '20260720120000_trusted_authentication_tenant_context',
  '20260725120000_tenant_safe_authorization_durable_audit',
];
const upgradeMigrations = [
  '20260731120000_inventory_ledger_medicine_reservation_integrity',
  '20260801000000_align_medicine_reservation_command_fk_name',
  '20260802120000_trusted_provider_stock_read',
  '20260802160000_inventory_stock_commands',
  '20260802180000_provider_reservation_operations',
  '20260808210000_session_credential_integrity',
  '20260809160000_completed_inventory_transfer',
  '20260810140000_completed_damaged_stock_write_off',
  '20260810180000_physical_batch_expiry_reconciliation',
];
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

for (const migrationName of [...baselineMigrations, ...upgradeMigrations]) {
  if (!existsSync(join(sourceMigrations, migrationName, 'migration.sql'))) {
    throw new Error(`Required migration is missing: ${migrationName}`);
  }
}

function databaseName(label) {
  return `medsphere_s05_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  const result = spawnSync(pnpmCommand, ['exec', 'prisma', ...args], {
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

  if (options.expectedFailure) {
    if (result.status === 0) {
      throw new Error(`Expected migration failure: ${options.expectedFailure}`);
    }
    if (!output.includes(options.expectedFailure)) {
      throw new Error(
        `Migration failed for the wrong reason. Expected: ${options.expectedFailure}\n${output.slice(-4000)}`,
      );
    }
    return;
  }

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
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-s05-upgrade-'));
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
  for (const migrationName of baselineMigrations) {
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { migrationsRoot, projectRoot, schemaFile };
}

function verifyScenario({ label, seedSql, assertionSql, expectedFailure }) {
  const name = databaseName(label);
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    executeSql(project.schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, seedSql);
    for (const migrationName of upgradeMigrations) {
      cpSync(join(sourceMigrations, migrationName), join(project.migrationsRoot, migrationName), {
        recursive: true,
      });
    }
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl, {
      expectedFailure,
    });
    if (assertionSql) {
      executeSql(project.schemaFile, scopedDatabaseUrl, assertionSql);
    }
    process.stdout.write(`S0.5 upgrade scenario passed: ${label}\n`);
  } finally {
    try {
      executeSql(
        project.schemaFile,
        databaseUrl.toString(),
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`,
      );
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}

const tenantOne = '10000000-0000-4000-8000-000000000001';
const tenantTwo = '10000000-0000-4000-8000-000000000002';
const userOne = '20000000-0000-4000-8000-000000000001';
const membershipOne = '30000000-0000-4000-8000-000000000001';
const administratorRoleOne = '35000000-0000-4000-8000-000000000001';
const providerOne = '40000000-0000-4000-8000-000000000001';
const productOne = '50000000-0000-4000-8000-000000000001';
const inventoryOne = '60000000-0000-4000-8000-000000000001';
const inventoryTwo = '60000000-0000-4000-8000-000000000002';
const batchOne = '70000000-0000-4000-8000-000000000001';
const batchTwo = '70000000-0000-4000-8000-000000000002';
const movementOne = '80000000-0000-4000-8000-000000000001';
const historyOne = '90000000-0000-4000-8000-000000000001';
const activeSession = 'a0000000-0000-4000-8000-000000000001';
const rotatedSession = 'a0000000-0000-4000-8000-000000000002';
const revokedSession = 'a0000000-0000-4000-8000-000000000003';
const rotatedFamily = 'b0000000-0000-4000-8000-000000000001';
const fixedTime = '2026-07-30T12:00:00.000Z';

const identityAndCatalogue = `
INSERT INTO "Tenant" ("id", "name", "slug", "isActive", "version", "createdAt", "updatedAt")
VALUES
  ('${tenantOne}', 'Fixture tenant one', 's05-fixture-one', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('${tenantTwo}', 'Fixture tenant two', 's05-fixture-two', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "User" (
  "id", "email", "passwordHash", "firstName", "lastName", "status", "version",
  "createdAt", "updatedAt", "preferredLanguage"
) VALUES (
  '${userOne}', 's05-fixture@example.invalid', 'fixture-not-a-real-credential',
  'Fixture', 'User', 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'en'
);
INSERT INTO "TenantMembership" (
  "id", "tenantId", "userId", "status", "isDefault", "joinedAt", "version",
  "createdAt", "updatedAt"
) VALUES (
  '${membershipOne}', '${tenantOne}', '${userOne}', 'ACTIVE', true,
  CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Role" (
  "id", "tenantId", "name", "description", "type", "version", "createdAt", "updatedAt"
) VALUES (
  '${administratorRoleOne}', '${tenantOne}', 'TENANT_ADMINISTRATOR',
  'Fixture administrator', 'SYSTEM', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "MembershipRole" (
  "id", "tenantId", "membershipId", "roleId", "createdAt"
) VALUES (
  gen_random_uuid(), '${tenantOne}', '${membershipOne}', '${administratorRoleOne}', CURRENT_TIMESTAMP
);
INSERT INTO "Provider" (
  "id", "tenantId", "providerType", "businessName", "ownerName", "email", "phone",
  "address", "city", "state", "country", "postalCode", "latitude", "longitude",
  "isVerified", "isActive", "version", "createdAt", "updatedAt"
) VALUES (
  '${providerOne}', '${tenantOne}', 'PHARMACY', 'Fixture pharmacy', 'Fixture owner',
  'pharmacy@example.invalid', '0000000000', 'Fixture address', 'Chennai', 'Tamil Nadu',
  'India', '600001', 13.0827, 80.2707, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Product" (
  "id", "name", "brand", "category", "manufacturer", "dosageForm", "strength",
  "requiresPrescription", "isActive", "version", "createdAt", "updatedAt"
) VALUES (
  '${productOne}', 'Fixture medicine', 'Fixture brand', 'MEDICINE', 'Fixture manufacturer',
  'TABLET', '10 mg', false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
`;

function inventoryRow({ id, batchNumber, quantity, mrp = '120.00', reserved = 0 }) {
  return `
INSERT INTO "Inventory" (
  "id", "providerId", "productId", "sku", "batchNumber", "expiryDate", "quantity",
  "reservedQuantity", "sellingPrice", "mrp", "discountPercentage", "taxPercentage",
  "minimumStockLevel", "inStock", "isVisible", "version", "createdAt", "updatedAt"
) VALUES (
  '${id}', '${providerOne}', '${productOne}', 'SKU-001', '${batchNumber}',
  '2030-01-01T00:00:00.000Z', ${quantity}, ${reserved}, 100.00, ${mrp}, 0.00, 5.00,
  5, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);`;
}

function batchRow({ id, batchNumber, quantity, initial = 20 }) {
  return `
INSERT INTO "Batch" (
  "id", "providerId", "productId", "batchNumber", "manufacturingDate", "expiryDate",
  "initialQuantity", "currentQuantity", "purchasePrice", "sellingPrice", "status",
  "version", "createdAt", "updatedAt"
) VALUES (
  '${id}', '${providerOne}', '${productOne}', '${batchNumber}', '2025-01-01T00:00:00.000Z',
  '2030-01-01T00:00:00.000Z', ${initial}, ${quantity}, 80.00, 100.00, 'ACTIVE',
  1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);`;
}

const matchingMovementAndHistory = `
INSERT INTO "StockMovement" (
  "id", "inventoryId", "batchId", "providerId", "productId", "type", "quantity",
  "quantityBefore", "quantityAfter", "referenceType", "referenceId", "reason", "userId",
  "version", "createdAt", "updatedAt"
) VALUES (
  '${movementOne}', '${inventoryOne}', '${batchOne}', '${providerOne}', '${productOne}',
  'STOCK_IN', 10, 0, 10, 'receipt', 'fixture-receipt', 'Fixture receipt', '${userOne}',
  1, '${fixedTime}', '${fixedTime}'
);
INSERT INTO "InventoryHistory" (
  "id", "inventoryId", "batchId", "providerId", "productId", "type", "quantity",
  "quantityBefore", "quantityAfter", "referenceType", "referenceId", "reason", "userId",
  "createdAt"
) VALUES (
  '${historyOne}', '${inventoryOne}', '${batchOne}', '${providerOne}', '${productOne}',
  'STOCK_IN', 10, 0, 10, 'receipt', 'fixture-receipt', 'Fixture receipt', '${userOne}',
  '${fixedTime}'
);
`;

const legacySessionHistory = `
INSERT INTO "UserSession" (
  "id", "membershipId", "familyId", "refreshTokenHash", "expiresAt",
  "absoluteExpiresAt", "lastUsedAt", "status", "replacedById", "revokedAt",
  "revocationReason", "createdAt", "updatedAt"
) VALUES
  (
    '${activeSession}', '${membershipOne}', '${rotatedFamily}', repeat('a', 64),
    '2030-01-01', '2030-02-01', '${fixedTime}', 'ACTIVE', NULL, NULL, NULL,
    '${fixedTime}'::timestamptz + INTERVAL '1 minute',
    '${fixedTime}'::timestamptz + INTERVAL '1 minute'
  ),
  (
    '${rotatedSession}', '${membershipOne}', '${rotatedFamily}', repeat('b', 64),
    '2030-01-01', '2030-02-01', '${fixedTime}', 'ROTATED', '${activeSession}', NULL,
    NULL, '${fixedTime}', '${fixedTime}'
  ),
  (
    '${revokedSession}', '${membershipOne}', gen_random_uuid(), repeat('c', 64),
    '2030-01-01', '2030-02-01', '${fixedTime}', 'REVOKED', NULL, '${fixedTime}',
    'fixture-revocation', '${fixedTime}', '${fixedTime}'
  );
`;

verifyScenario({
  label: 'valid_populated',
  seedSql: `
${identityAndCatalogue}
${inventoryRow({ id: inventoryOne, batchNumber: 'BATCH-001', quantity: 10 })}
${inventoryRow({ id: inventoryTwo, batchNumber: 'BATCH-002', quantity: 15 })}
${batchRow({ id: batchOne, batchNumber: 'BATCH-001', quantity: 10 })}
${batchRow({ id: batchTwo, batchNumber: 'BATCH-002', quantity: 15 })}
${matchingMovementAndHistory}
${legacySessionHistory}
`,
  assertionSql: `
DO $$
BEGIN
  IF (SELECT count(*) FROM "Inventory" WHERE "tenantId" = '${tenantOne}') <> 1 THEN
    RAISE EXCEPTION 'Inventory configuration was not consolidated';
  END IF;
  IF (SELECT count(*) FROM "Batch" WHERE "inventoryId" = '${inventoryOne}') <> 2 THEN
    RAISE EXCEPTION 'Batches were not attached to the canonical inventory';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "StockMovement"
    WHERE "id" = '${movementOne}' AND "tenantId" = '${tenantOne}'
      AND "delta" = 10 AND "onHandBefore" = 0 AND "onHandAfter" = 10
      AND "actorMembershipId" = '${membershipOne}'
  ) THEN
    RAISE EXCEPTION 'Stock movement was not converted correctly';
  END IF;
  IF to_regclass('"InventoryHistory"') IS NOT NULL OR to_regclass('"Reservation"') IS NOT NULL THEN
    RAISE EXCEPTION 'Rejected prototype tables were not retired';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"MedicineReservationCommand"'::regclass
      AND contype = 'f'
      AND conname = 'MedicineReservationCommand_reservationId_tenantId_provider_fkey'
  ) THEN
    RAISE EXCEPTION 'Medicine reservation command foreign-key name was not repaired';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "MembershipProviderAccess"
    WHERE "tenantId" = '${tenantOne}'
      AND "membershipId" = '${membershipOne}'
      AND "providerId" = '${providerOne}'
  ) THEN
    RAISE EXCEPTION 'Tenant administrator provider access was not backfilled';
  END IF;
  IF (
    SELECT count(*) FROM "RolePermission" rp
    JOIN "Permission" p ON p."id" = rp."permissionId"
    WHERE rp."roleId" = '${administratorRoleOne}'
      AND p."name" IN (
        'authorization.provider-access.read',
        'authorization.provider-access.manage',
        'inventory.stock.read',
        'inventory.listings.manage',
        'inventory.stock.receive',
        'inventory.stock.adjust',
        'inventory.stock.transfer',
        'inventory.stock.damage',
        'inventory.reservations.read',
        'inventory.reservations.manage'
      )
  ) <> 10 THEN
    RAISE EXCEPTION 'Gate 3 through G3.10 permissions were not assigned to the tenant administrator';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"StockMovement"'::regclass
      AND conname = 'StockMovement_command_hash_check'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Stock movement command-hash constraint is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"StockMovement"'::regclass
      AND conname = 'StockMovement_damage_contract_check'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Damaged-stock movement contract constraint is missing';
  END IF;
  IF to_regclass('"BatchExpiryRecord"') IS NULL THEN
    RAISE EXCEPTION 'Batch expiry evidence table is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"AuditEvent"'::regclass
      AND conname = 'AuditEvent_batch_expiry_metadata_check'
      AND contype = 'c'
  ) THEN
    RAISE EXCEPTION 'Batch expiry audit metadata constraint is missing';
  END IF;
  IF (
    SELECT count(*) FROM "UserSession"
    WHERE "userId" = '${userOne}' AND "tenantId" = '${tenantOne}' AND "version" = 1
  ) <> 3 THEN
    RAISE EXCEPTION 'Session identity tuple was not backfilled';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "UserSessionRefreshCredential"
    WHERE "sessionId" = '${activeSession}' AND "status" = 'ACTIVE'
      AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "rotationSequence" = 2
  ) THEN
    RAISE EXCEPTION 'Active session credential was not preserved as active';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "UserSessionRefreshCredential" AS used
    JOIN "UserSessionRefreshCredential" AS successor ON successor."id" = used."replacedById"
    WHERE used."sessionId" = '${rotatedSession}' AND used."status" = 'USED'
      AND used."usedAt" IS NOT NULL AND used."revokedAt" IS NULL
      AND used."rotationSequence" = 1 AND successor."sessionId" = '${activeSession}'
  ) THEN
    RAISE EXCEPTION 'Rotated session credential was not preserved as used';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "UserSessionRefreshCredential"
    WHERE "sessionId" = '${revokedSession}' AND "status" = 'REVOKED'
      AND "usedAt" IS NULL AND "revokedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Revoked session credential was not preserved as revoked';
  END IF;
END $$;
INSERT INTO "AuditEvent" (
  "id", "scope", "actorType", "outcome", "tenantId", "eventType", "metadata", "occurredAt"
) VALUES (
  gen_random_uuid(), 'TENANT', 'SYSTEM', 'SUCCEEDED', '${tenantOne}',
  'inventory.reservation.expired', '{}'::jsonb, CURRENT_TIMESTAMP
);
DO $$
BEGIN
  BEGIN
    INSERT INTO "Batch" (
      "id", "tenantId", "inventoryId", "providerId", "productId", "batchNumber",
      "expiryDate", "receivedQuantity", "onHandQuantity", "heldQuantity",
      "purchasePrice", "sellingPrice", "status", "version", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), '${tenantTwo}', '${inventoryOne}', '${providerOne}', '${productOne}',
      'CROSS-TENANT', '2030-01-01', 1, 1, 0, 1.00, 1.00, 'ACTIVE', 1,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Cross-tenant batch was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;
`,
});

verifyScenario({
  label: 'quantity_mismatch',
  seedSql: `${identityAndCatalogue}
${inventoryRow({ id: inventoryOne, batchNumber: 'BATCH-001', quantity: 9 })}
${batchRow({ id: batchOne, batchNumber: 'BATCH-001', quantity: 10 })}`,
  expectedFailure: 'S0.5 migration blocked: inventory and batch quantities do not reconcile',
});

verifyScenario({
  label: 'incompatible_configuration',
  seedSql: `${identityAndCatalogue}
${inventoryRow({ id: inventoryOne, batchNumber: 'BATCH-001', quantity: 10 })}
${inventoryRow({ id: inventoryTwo, batchNumber: 'BATCH-002', quantity: 15, mrp: '130.00' })}
${batchRow({ id: batchOne, batchNumber: 'BATCH-001', quantity: 10 })}
${batchRow({ id: batchTwo, batchNumber: 'BATCH-002', quantity: 15 })}`,
  expectedFailure: 'S0.5 migration blocked: duplicate inventory configuration is incompatible',
});

verifyScenario({
  label: 'unmatched_history',
  seedSql: `${identityAndCatalogue}
${inventoryRow({ id: inventoryOne, batchNumber: 'BATCH-001', quantity: 10 })}
${batchRow({ id: batchOne, batchNumber: 'BATCH-001', quantity: 10 })}
INSERT INTO "InventoryHistory" (
  "id", "inventoryId", "batchId", "providerId", "productId", "type", "quantity",
  "quantityBefore", "quantityAfter", "userId", "createdAt"
) VALUES (
  '${historyOne}', '${inventoryOne}', '${batchOne}', '${providerOne}', '${productOne}',
  'STOCK_IN', 10, 0, 10, '${userOne}', '${fixedTime}'
);`,
  expectedFailure: 'S0.5 migration blocked: inventory history is not represented in the ledger',
});

verifyScenario({
  label: 'held_stock',
  seedSql: `${identityAndCatalogue}
${inventoryRow({ id: inventoryOne, batchNumber: 'BATCH-001', quantity: 10, reserved: 1 })}
${batchRow({ id: batchOne, batchNumber: 'BATCH-001', quantity: 10 })}`,
  expectedFailure: 'S0.5 migration blocked: legacy held inventory cannot be allocated safely',
});

verifyScenario({
  label: 'legacy_reservation',
  seedSql: `${identityAndCatalogue}
INSERT INTO "Reservation" (
  "id", "userId", "providerId", "reservationType", "status", "scheduledAt",
  "version", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(), '${userOne}', '${providerOne}', 'MEDICINE_PICKUP', 'PENDING',
  CURRENT_TIMESTAMP + INTERVAL '1 day', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);`,
  expectedFailure: 'S0.5 migration blocked: legacy reservations require explicit remediation',
});

verifyScenario({
  label: 'invalid_quantity',
  seedSql: `${identityAndCatalogue}
${inventoryRow({ id: inventoryOne, batchNumber: 'BATCH-001', quantity: 0 })}
${batchRow({ id: batchOne, batchNumber: 'BATCH-001', quantity: 0, initial: 0 })}`,
  expectedFailure: 'S0.5 migration blocked: invalid legacy batch values',
});

process.stdout.write('S0.5 through G3.10 populated upgrade verification passed.\n');
