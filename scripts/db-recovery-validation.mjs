#!/usr/bin/env node
// db-recovery-validation.mjs -- deterministic, repository-owned populated
// database backup/restore/recovery validation (AIM Task 0022).
//
// Proves against a REAL PostgreSQL server that:
//   A. a populated AIM database (Task 0013 privacy/consent rows, durable
//      session/refresh-credential rows, and Task 0019 exact-user AuditEvent
//      evidence) can be backed up, restored into an isolated database, and
//      verified (counts, canonical hashes, migration state, constraints,
//      FK/orphan checks, audit attribution, privacy, consent, sessions).
//   B. a backup from an OLDER valid schema restores and then advances to the
//      current schema through the accepted append-only Prisma migrations
//      (prisma migrate deploy), with no drift afterwards.
//
// Dedicated databases are created and dropped at the end (kept when
// DB_RECOVERY_VALIDATION_KEEP=1). The tool refuses the fixed deny-list
// (medsphere_dev, medsphere_ci, postgres, template*).
//
// Usage:
//   DATABASE_URL=... node scripts/db-recovery-validation.mjs
//
// Optional env:
//   AIM_T0022_SOURCE_DB / AIM_T0022_RESTORE_DB / AIM_T0022_OLDER_DB /
//   AIM_T0022_OLDER_RESTORE_DB -- dedicated database names
//   AIM_T0022_ALLOW_REPLACE=1    -- allow pre-existing dedicated databases
//   DB_RECOVERY_VALIDATION_KEEP=1 -- keep databases/artifacts for debugging

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { REQUIRED_TABLES } from './backup-recovery-core.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATABASE_PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'database');
const SCRIPTS_DIR = join(REPO_ROOT, 'scripts');
const OLDER_CUTOFF_MIGRATION = '20260905000000_platform_administration_foundation';
const DENY_LIST = new Set(['medsphere_dev', 'medsphere_ci', 'postgres', 'template0', 'template1']);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || !DATABASE_URL.trim()) {
  console.error('[FAIL] DATABASE_URL is required for real-PostgreSQL recovery validation.');
  process.exit(1);
}

const serverUrl = new URL(DATABASE_URL);
serverUrl.searchParams.delete('schema');

const sourceDb = process.env.AIM_T0022_SOURCE_DB ?? 'aim_t0022_source';
const restoreDb = process.env.AIM_T0022_RESTORE_DB ?? 'aim_t0022_restore';
const olderDb = process.env.AIM_T0022_OLDER_DB ?? 'aim_t0022_older';
const olderRestoreDb = process.env.AIM_T0022_OLDER_RESTORE_DB ?? 'aim_t0022_older_restore';
const allowReplace = process.env.AIM_T0022_ALLOW_REPLACE === '1';
const keepArtifacts = process.env.DB_RECOVERY_VALIDATION_KEEP === '1';

for (const name of [sourceDb, restoreDb, olderDb, olderRestoreDb]) {
  if (DENY_LIST.has(name)) {
    console.error(`[FAIL] Dedicated database name ${name} is on the deny-list.`);
    process.exit(1);
  }
}

const serverSummary = `${serverUrl.hostname}:${serverUrl.port || '5432'}`;
const pgUser = decodeURIComponent(serverUrl.username || '');
const pgPassword = decodeURIComponent(serverUrl.password || '');
const maintenanceDb = decodeURIComponent(serverUrl.pathname.replace(/^\//, ''));

function scopedUrl(name) {
  const url = new URL(serverUrl.toString());
  url.pathname = `/${name}`;
  url.searchParams.set('schema', 'public');
  return url.toString();
}

function pgEnv() {
  return { ...process.env, PGPASSWORD: pgPassword };
}

function spawnTool(args, { cwd = REPO_ROOT, env = {}, input, maxBuffer } = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, ...env },
    input,
    maxBuffer: maxBuffer ?? 10 * 1024 * 1024,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = String(result.stdout ?? '') + String(result.stderr ?? '');
    throw new Error(`command failed (${args.join(' ')}): ${output.slice(-4000)}`);
  }
  return result;
}

function pnpmCommand(args) {
  return process.platform === 'win32'
    ? [process.env.ComSpec || 'cmd.exe', '/d', '/c', 'pnpm.cmd', ...args]
    : ['pnpm', ...args];
}

function runPnpm(args, { cwd = REPO_ROOT, env = {} } = {}) {
  return spawnTool(pnpmCommand(args), { cwd, env });
}

function runNode(script, env) {
  return spawnTool([process.execPath, join(SCRIPTS_DIR, script)], {
    cwd: REPO_ROOT,
    env,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function psql(database, query) {
  return spawnTool(
    [
      'psql',
      '-h',
      serverUrl.hostname,
      '-p',
      serverUrl.port || '5432',
      '-U',
      pgUser,
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-q',
      '-c',
      query,
    ],
    { env: pgEnv() },
  ).stdout.trim();
}

function databaseExists(name) {
  return psql(maintenanceDb, `SELECT 1 FROM pg_database WHERE datname = '${name}';`) === '1';
}

function dropDatabase(name) {
  spawnTool(
    [
      'dropdb',
      '-h',
      serverUrl.hostname,
      '-p',
      serverUrl.port || '5432',
      '-U',
      pgUser,
      '--if-exists',
      name,
    ],
    { env: pgEnv() },
  );
}

function createDatabase(name) {
  spawnTool(
    ['createdb', '-h', serverUrl.hostname, '-p', serverUrl.port || '5432', '-U', pgUser, name],
    { env: pgEnv() },
  );
}

function prepareDedicatedDatabase(name) {
  if (databaseExists(name)) {
    if (!allowReplace) {
      throw new Error(
        `dedicated database ${name} already exists; set AIM_T0022_ALLOW_REPLACE=1 to intentionally replace it`,
      );
    }
    dropDatabase(name);
  }
  createDatabase(name);
}

function canonicalHashOf(text) {
  return createHash('sha256').update(text).digest('hex');
}

function canonicalTableRows(database, table) {
  const rows = psql(database, `SELECT * FROM "${table}" ORDER BY id;`);
  return {
    count: rows.trim().length === 0 ? 0 : rows.trim().split('\n').length,
    hash: canonicalHashOf(rows),
  };
}

function assertEqualEvidence(label, expected, actual) {
  if (expected !== actual) {
    throw new Error(`${label}: expected [${expected}] but restored [${actual}]`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Deterministic synthetic fixtures (no real people/healthcare data).
// ---------------------------------------------------------------------------
const IDS = {
  tenant: '00000000-0000-4000-a000-000000000001',
  role: '00000000-0000-4000-a000-000000000002',
  user: '00000000-0000-4000-a000-000000000003',
  membership: '00000000-0000-4000-a000-000000000004',
  membershipRole: '00000000-0000-4000-a000-000000000005',
  provider: '00000000-0000-4000-a000-000000000006',
  product: '00000000-0000-4000-a000-000000000007',
  inventory: '00000000-0000-4000-a000-000000000008',
  batch: '00000000-0000-4000-a000-000000000009',
  reservation: '00000000-0000-4000-a000-00000000000a',
  auditTenantUser: '00000000-0000-4000-a000-00000000000b',
  auditSystemTenant: '00000000-0000-4000-a000-00000000000c',
  userPrivacy: '00000000-0000-4000-a000-00000000000d',
  consentGranted: '00000000-0000-4000-a000-00000000000e',
  consentWithdrawn: '00000000-0000-4000-a000-00000000000f',
  session: '00000000-0000-4000-a000-0000000000f1',
  refreshCredential: '00000000-0000-4000-a000-0000000000f2',
  platformUser: '00000000-0000-4000-a000-0000000000f3',
  auditPlatformSystem: '00000000-0000-4000-a000-0000000000f4',
  auditPlatformUser: '00000000-0000-4000-a000-0000000000f5',
};

const TOKEN_HASH_ACTIVE = 'a'.repeat(64);
const TOKEN_HASH_ROTATION = 'b'.repeat(64);

function seedRepresentativeRows(database, { platformEvents } = {}) {
  const run = (sql) => psql(database, sql);

  run(`INSERT INTO "Tenant" (id, name, slug, "isActive", "selfRegistrationEnabled", "createdAt", "updatedAt")
      VALUES ('${IDS.tenant}', 'T0022 Recovery Tenant', 't0022-recovery-tenant', true, false, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "Role" (id, "tenantId", name, description, type, version, "createdAt", "updatedAt")
      VALUES ('${IDS.role}', '${IDS.tenant}', 'TENANT_ADMINISTRATOR', 'Built-in tenant authorization administrator', 'SYSTEM', 1, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "RolePermission" (id, "tenantId", "roleId", "permissionId", "createdAt")
      SELECT gen_random_uuid(), '${IDS.tenant}', '${IDS.role}', id, now() FROM "Permission"
      ON CONFLICT DO NOTHING;`);

  run(`INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", status, "phoneVerifiedAt", "identityVerificationStatus", "ageVerificationStatus", "ageVerified18Plus", "createdAt", "updatedAt")
      VALUES ('${IDS.user}', 't0022-admin@example.test', NULL, 'T0022', 'Admin', 'ACTIVE', now(), 'APPROVED', 'APPROVED', true, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", status, "identityVerificationStatus", "ageVerificationStatus", "ageVerified18Plus", "createdAt", "updatedAt")
      VALUES ('${IDS.platformUser}', 't0022-platform@example.test', NULL, 'T0022', 'Platform', 'ACTIVE', 'APPROVED', 'APPROVED', true, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "TenantMembership" (id, "tenantId", "userId", status, "joinedAt", "createdAt", "updatedAt")
      VALUES ('${IDS.membership}', '${IDS.tenant}', '${IDS.user}', 'ACTIVE', now(), now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "MembershipRole" (id, "tenantId", "membershipId", "roleId")
      VALUES ('${IDS.membershipRole}', '${IDS.tenant}', '${IDS.membership}', '${IDS.role}')
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "Provider" (id, "tenantId", "providerType", "businessName", "ownerName", email, phone, address, city, state, country, "postalCode", latitude, longitude, "isVerified", "isActive", "createdAt", "updatedAt")
      VALUES ('${IDS.provider}', '${IDS.tenant}', 'PHARMACY', 'T0022 Recovery Pharmacy', 'T0022 Owner', 't0022-provider@example.test', '0000000000', 'Synthetic Address', 'Chennai', 'Tamil Nadu', 'India', '600001', 13.0827, 80.2707, true, true, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "Product" (id, name, brand, category, manufacturer, "dosageForm", strength, "requiresPrescription", "isActive", "createdAt", "updatedAt")
      VALUES ('${IDS.product}', 'T0022 Recovery Paracetamol', 'Synthetic Brand', 'MEDICINE', 'Synthetic Manufacturer', 'TABLET', '500 mg', false, true, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "Inventory" (id, "tenantId", "providerId", "productId", sku, "sellingPrice", mrp, "discountPercentage", "taxPercentage", "minimumStockLevel", "isVisible", version, "createdAt", "updatedAt")
      VALUES ('${IDS.inventory}', '${IDS.tenant}', '${IDS.provider}', '${IDS.product}', 'T0022-SKU-1', 25.00, 30.00, 0.00, 5.00, 10, true, 1, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "Batch" (id, "tenantId", "inventoryId", "providerId", "productId", "batchNumber", "manufacturingDate", "expiryDate", "receivedQuantity", "onHandQuantity", "heldQuantity", "purchasePrice", "sellingPrice", status, version, "createdAt", "updatedAt")
      VALUES ('${IDS.batch}', '${IDS.tenant}', '${IDS.inventory}', '${IDS.provider}', '${IDS.product}', 'T0022-BATCH-1', '2026-01-01', '2028-01-01', 100, 100, 0, 20.00, 25.00, 'ACTIVE', 1, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  run(`INSERT INTO "MedicineReservation" (id, "tenantId", "providerId", "subjectUserId", status, "expiresAt", "idempotencyKey", "creationHash", version, "createdAt", "updatedAt")
      VALUES ('${IDS.reservation}', '${IDS.tenant}', '${IDS.provider}', '${IDS.user}', 'PENDING', now() + interval '1 day', 't0022-idempotency-1', '${'0'.repeat(64)}', 1, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  // Privacy preferences (Task 0013) -- recovery must preserve, not reset.
  run(`INSERT INTO "UserPrivacy" (id, "userId", "sharePhone", "shareEmail", "allowInAppChat", "privatePickup", "hideSensitiveNotifications", "preferredLanguage", "wantsReservationNotifications", "wantsOperationalAlerts", version, "createdAt", "updatedAt")
      VALUES ('${IDS.userPrivacy}', '${IDS.user}', false, true, true, false, true, 'en', true, false, 3, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  // Consent log (Task 0013): one GRANTED + one WITHDRAWN append-only event.
  // Recovery must preserve the log exactly; a withdrawal is never rewritten.
  run(`INSERT INTO "ConsentRecord" (id, "userId", category, status, version, source, "createdAt")
      VALUES ('${IDS.consentGranted}', '${IDS.user}', 'NOTIFICATIONS_RESERVATIONS', 'GRANTED', 2, 'settings_privacy_page', now())
      ON CONFLICT (id) DO NOTHING;`);
  run(`INSERT INTO "ConsentRecord" (id, "userId", category, status, version, source, "createdAt")
      VALUES ('${IDS.consentWithdrawn}', '${IDS.user}', 'LOCATION_USE', 'WITHDRAWN', 1, 'settings_privacy_page', now())
      ON CONFLICT (id) DO NOTHING;`);

  // Durable session state (Task 0014) -- recovery must preserve active
  // sessions and their refresh-credential rotation chains.
  run(`INSERT INTO "UserSession" (id, "userId", "tenantId", "membershipId", "familyId", "refreshTokenHash", "ipAddress", "userAgent", "deviceName", "expiresAt", "absoluteExpiresAt", "lastUsedAt", status, "securityVersion", "recentAuthenticatedAt", version, "createdAt", "updatedAt")
      VALUES ('${IDS.session}', '${IDS.user}', '${IDS.tenant}', '${IDS.membership}', '00000000-0000-4000-a000-0000000000e1', '${TOKEN_HASH_ACTIVE}', '127.0.0.1', 't0022-recovery-agent', 't0022-recovery-device', now() + interval '7 days', now() + interval '30 days', now(), 'ACTIVE', 1, now(), 1, now(), now())
      ON CONFLICT (id) DO NOTHING;`);
  run(`INSERT INTO "UserSessionRefreshCredential" (id, "sessionId", hash, status, "rotationSequence", "issuedAt", "createdAt")
      VALUES ('${IDS.refreshCredential}', '${IDS.session}', '${TOKEN_HASH_ROTATION}', 'ACTIVE', 1, now(), now())
      ON CONFLICT (id) DO NOTHING;`);

  // Audit evidence (Task 0019 exact-user attribution). TENANT_USER rows carry
  // the membership-user-tenant triple; SYSTEM rows carry no actor user; the
  // PLATFORM rows carry the global platform actor where applicable. These
  // must survive recovery byte-for-byte and never be rewritten.
  run(`INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "tenantId", "actorMembershipId", "actorUserId", "platformActorUserId", "eventType", "resourceType", "resourceId", "requestId", "ipAddress", "userAgent", metadata, "occurredAt")
      VALUES ('${IDS.auditTenantUser}', 'TENANT', 'TENANT_USER', 'SUCCEEDED', '${IDS.tenant}', '${IDS.membership}', '${IDS.user}', NULL, 'authentication.account.activated', 'User', '${IDS.user}', 'req-t0022-001', '127.0.0.1', 't0022-audit-agent', '{"evidence":"task0022-tenant-user"}'::jsonb, now())
      ON CONFLICT (id) DO NOTHING;`);
  run(`INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "tenantId", "actorMembershipId", "actorUserId", "platformActorUserId", "eventType", "resourceType", "resourceId", "requestId", metadata, "occurredAt")
      VALUES ('${IDS.auditSystemTenant}', 'TENANT', 'SYSTEM', 'SUCCEEDED', '${IDS.tenant}', NULL, NULL, NULL, 'inventory.reservation.created', 'MedicineReservation', '${IDS.reservation}', 'req-t0022-002', '{"evidence":"task0022-system-tenant"}'::jsonb, now())
      ON CONFLICT (id) DO NOTHING;`);

  if (platformEvents) {
    run(`INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "tenantId", "actorMembershipId", "actorUserId", "platformActorUserId", "eventType", "requestId", metadata, "occurredAt")
        VALUES ('${IDS.auditPlatformSystem}', 'PLATFORM', 'SYSTEM', 'SUCCEEDED', NULL, NULL, NULL, NULL, 'platform.session.revoked', 'req-t0022-003', '{"evidence":"task0022-system-platform"}'::jsonb, now())
        ON CONFLICT (id) DO NOTHING;`);
    run(`INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "tenantId", "actorMembershipId", "actorUserId", "platformActorUserId", "eventType", "requestId", metadata, "occurredAt")
        VALUES ('${IDS.auditPlatformUser}', 'PLATFORM', 'PLATFORM_USER', 'SUCCEEDED', NULL, NULL, NULL, '${IDS.platformUser}', 'platform.invitation.created', 'req-t0022-004', '{"evidence":"task0022-platform-user"}'::jsonb, now())
        ON CONFLICT (id) DO NOTHING;`);
  }
}

// ---------------------------------------------------------------------------
// Evidence collection and comparison.
// ---------------------------------------------------------------------------
function collectEvidence(database) {
  const evidence = {
    migrations: psql(
      database,
      `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`,
    ),
    tables: {},
    projections: {},
    projectionHashes: {},
  };
  for (const table of REQUIRED_TABLES) {
    evidence.tables[table] = canonicalTableRows(database, table);
  }
  evidence.projections.audit = psql(
    database,
    `SELECT id, scope, "actorType", outcome, "tenantId", "actorMembershipId", "actorUserId", "platformActorUserId", "eventType", "resourceType", "resourceId", "requestId", "ipAddress", metadata::text FROM "AuditEvent" ORDER BY id;`,
  );
  evidence.projections.privacy = psql(
    database,
    `SELECT "userId", "sharePhone", "shareEmail", "allowInAppChat", "privatePickup", "hideSensitiveNotifications", "preferredLanguage", "wantsReservationNotifications", "wantsOperationalAlerts", version FROM "UserPrivacy" ORDER BY id;`,
  );
  evidence.projections.consent = psql(
    database,
    `SELECT id, "userId", category, status, version, source FROM "ConsentRecord" ORDER BY id;`,
  );
  evidence.projections.session = psql(
    database,
    `SELECT id, "userId", "tenantId", "membershipId", "familyId", "refreshTokenHash", status, "securityVersion", version FROM "UserSession" ORDER BY id;`,
  );
  evidence.projections.refresh = psql(
    database,
    `SELECT id, "sessionId", hash, status, "rotationSequence" FROM "UserSessionRefreshCredential" ORDER BY id;`,
  );
  for (const [name, text] of Object.entries(evidence.projections)) {
    evidence.projectionHashes[name] = canonicalHashOf(text);
  }
  return evidence;
}

function assertEvidenceMatches(sourceEvidence, restoredEvidence, label) {
  assertEqualEvidence(
    `${label}: migration count`,
    sourceEvidence.migrations,
    restoredEvidence.migrations,
  );
  for (const table of REQUIRED_TABLES) {
    assertEqualEvidence(
      `${label}: ${table} row count`,
      sourceEvidence.tables[table].count,
      restoredEvidence.tables[table].count,
    );
    assertEqualEvidence(
      `${label}: ${table} content hash`,
      sourceEvidence.tables[table].hash,
      restoredEvidence.tables[table].hash,
    );
  }
  for (const [name, hash] of Object.entries(sourceEvidence.projectionHashes)) {
    assertEqualEvidence(
      `${label}: ${name} projection hash`,
      hash,
      restoredEvidence.projectionHashes[name],
    );
  }
}

// ---------------------------------------------------------------------------
// Scenario A: current-schema populated backup -> restore -> verify.
// ---------------------------------------------------------------------------
function runScenarioA() {
  console.log('\n=== Scenario A: current-schema populated backup -> restore -> verify ===');
  prepareDedicatedDatabase(sourceDb);
  runPnpm(['--filter', '@medsphere/database', 'run', 'prisma:deploy'], {
    cwd: DATABASE_PACKAGE_ROOT,
    env: { DATABASE_URL: scopedUrl(sourceDb) },
  });
  seedRepresentativeRows(sourceDb, { platformEvents: true });

  const evidence = collectEvidence(sourceDb);
  console.log(`  source migration count: ${evidence.migrations}`);
  console.log(
    `  source rows: ${Object.entries(evidence.tables)
      .map(([table, entry]) => `${table}=${entry.count}`)
      .join(', ')}`,
  );

  const workDir = mkdtempSync(join(tmpdir(), 'medsphere-t0022-scenario-a-'));
  const statusFile = join(workDir, 't0022-status.jsonl');
  const backupFile = join(workDir, 't0022-current.dump');
  runNode('aim-backup.mjs', {
    DATABASE_URL: scopedUrl(sourceDb),
    AIM_BACKUP_DIR: workDir,
    AIM_BACKUP_FILENAME: 't0022-current.dump',
    AIM_BACKUP_STATUS_FILE: statusFile,
  });

  const expectedCounts = {};
  for (const [table, entry] of Object.entries(evidence.tables)) {
    expectedCounts[table] = entry.count;
  }
  const countsFile = join(workDir, 't0022-expected-counts.json');
  writeFileSync(countsFile, JSON.stringify(expectedCounts, null, 2));

  const restoreEnv = {
    AIM_BACKUP_FILE: backupFile,
    RESTORE_DATABASE_URL: scopedUrl(restoreDb),
    DATABASE_URL: scopedUrl(sourceDb),
    AIM_RESTORE_EXPECTED_MIGRATIONS: evidence.migrations,
    AIM_RESTORE_EXPECTED_COUNTS: countsFile,
    AIM_BACKUP_STATUS_FILE: statusFile,
  };
  if (allowReplace) {
    restoreEnv.AIM_RESTORE_DROP_EXISTING = '1';
  }
  runNode('aim-restore.mjs', restoreEnv);

  const restoredEvidence = collectEvidence(restoreDb);
  assertEvidenceMatches(evidence, restoredEvidence, 'Scenario A');

  const tenantUserAttribution = psql(
    restoreDb,
    `SELECT "actorMembershipId" IS NOT NULL AND "actorUserId" = '${IDS.user}' AND "tenantId" = '${IDS.tenant}' AND "platformActorUserId" IS NULL FROM "AuditEvent" WHERE id = '${IDS.auditTenantUser}';`,
  );
  assertEqualEvidence(
    'Scenario A: TENANT_USER exact attribution preserved',
    't',
    tenantUserAttribution,
  );

  const withdrawalPreserved = psql(
    restoreDb,
    `SELECT count(*) FROM "ConsentRecord" WHERE id = '${IDS.consentWithdrawn}' AND status = 'WITHDRAWN' AND category = 'LOCATION_USE';`,
  );
  assertEqualEvidence('Scenario A: withdrawn consent record preserved', '1', withdrawalPreserved);

  const consentNotRegenerated = psql(
    restoreDb,
    `SELECT count(*) FROM "ConsentRecord" WHERE id <> '${IDS.consentGranted}' AND id <> '${IDS.consentWithdrawn}';`,
  );
  assertEqualEvidence(
    'Scenario A: consent log not regenerated or rewritten',
    '0',
    consentNotRegenerated,
  );

  console.log(`  backup file  : ${backupFile}`);
  console.log(`  restore target: ${restoreDb}`);
  return { workDir };
}

// ---------------------------------------------------------------------------
// Scenario B: backup from an OLDER valid schema -> restore -> forward
// migrations bring it to the current schema with no drift.
// ---------------------------------------------------------------------------
function createOlderMigrationProject(cutoff) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-t0022-older-'));
  const migrationsRoot = join(projectRoot, 'migrations');
  mkdirSync(migrationsRoot, { recursive: true });
  const schemaFile = join(projectRoot, 'schema.prisma');
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
  const repoMigrations = join(DATABASE_PACKAGE_ROOT, 'prisma', 'migrations');
  copyFileSync(
    join(repoMigrations, 'migration_lock.toml'),
    join(migrationsRoot, 'migration_lock.toml'),
  );
  const names = readdirSync(repoMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const baseline = names.filter((name) => name < cutoff);
  if (baseline.length === 0) {
    throw new Error(`no baseline migrations found before ${cutoff}`);
  }
  for (const name of baseline) {
    copyFolderRecursive(join(repoMigrations, name), join(migrationsRoot, name));
  }
  return { projectRoot, schemaFile, baselineCount: baseline.length };
}

function copyFolderRecursive(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursive(from, to);
    } else {
      copyFileSync(from, to);
    }
  }
}

function runScenarioB() {
  console.log('\n=== Scenario B: older-schema backup -> restore -> forward migration ===');
  prepareDedicatedDatabase(olderDb);
  const { projectRoot, schemaFile, baselineCount } =
    createOlderMigrationProject(OLDER_CUTOFF_MIGRATION);
  try {
    runPnpm(['exec', 'prisma', 'migrate', 'deploy', '--schema', schemaFile], {
      cwd: DATABASE_PACKAGE_ROOT,
      env: { DATABASE_URL: scopedUrl(olderDb) },
    });
  } catch (error) {
    rmSync(projectRoot, { recursive: true, force: true });
    throw error;
  }
  seedRepresentativeRows(olderDb, { platformEvents: false });

  const olderEvidence = collectEvidence(olderDb);
  console.log(
    `  older-schema migration count: ${olderEvidence.migrations} (baseline ${baselineCount})`,
  );

  const workDir = mkdtempSync(join(tmpdir(), 'medsphere-t0022-scenario-b-'));
  const statusFile = join(workDir, 't0022-status-b.jsonl');
  const backupFile = join(workDir, 't0022-older.dump');
  runNode('aim-backup.mjs', {
    DATABASE_URL: scopedUrl(olderDb),
    AIM_BACKUP_DIR: workDir,
    AIM_BACKUP_FILENAME: 't0022-older.dump',
    AIM_BACKUP_STATUS_FILE: statusFile,
  });

  const counts = {};
  for (const [table, entry] of Object.entries(olderEvidence.tables)) {
    counts[table] = entry.count;
  }
  const countsFile = join(workDir, 't0022-expected-counts-b.json');
  writeFileSync(countsFile, JSON.stringify(counts, null, 2));

  const restoreEnv = {
    AIM_BACKUP_FILE: backupFile,
    RESTORE_DATABASE_URL: scopedUrl(olderRestoreDb),
    DATABASE_URL: scopedUrl(olderDb),
    AIM_RESTORE_EXPECTED_MIGRATIONS: olderEvidence.migrations,
    AIM_RESTORE_EXPECTED_COUNTS: countsFile,
    AIM_BACKUP_STATUS_FILE: statusFile,
  };
  if (allowReplace) {
    restoreEnv.AIM_RESTORE_DROP_EXISTING = '1';
  }
  runNode('aim-restore.mjs', restoreEnv);

  // The restored older-schema database must now advance to the current
  // schema through the accepted append-only Prisma migration chain
  // (prisma migrate deploy + status + drift, via the repo's prisma:verify).
  runPnpm(['--filter', '@medsphere/database', 'run', 'prisma:verify'], {
    cwd: DATABASE_PACKAGE_ROOT,
    env: { DATABASE_URL: scopedUrl(olderRestoreDb) },
  });

  const currentMigrations = psql(
    olderRestoreDb,
    `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`,
  );
  const tenantSurvives = psql(
    olderRestoreDb,
    `SELECT count(*) FROM "Tenant" WHERE id = '${IDS.tenant}';`,
  );
  const auditSurvives = psql(
    olderRestoreDb,
    `SELECT count(*) FROM "AuditEvent" WHERE id = '${IDS.auditTenantUser}' AND "actorUserId" = '${IDS.user}';`,
  );
  assertEqualEvidence('Scenario B: tenant row survives forward migration', '1', tenantSurvives);
  assertEqualEvidence('Scenario B: audit evidence survives forward migration', '1', auditSurvives);

  console.log(`  forward-migrated migration count: ${currentMigrations}`);
  console.log(`  backup file  : ${backupFile}`);
  console.log(`  forward target: ${olderRestoreDb}`);
  return { workDir, projectRoot };
}

// ---------------------------------------------------------------------------
// Cleanup and entry point.
// ---------------------------------------------------------------------------
function cleanupArtifacts(workDirs, projectRoots) {
  if (keepArtifacts) {
    console.log(
      '\n  DB_RECOVERY_VALIDATION_KEEP=1: leaving dedicated databases and artifacts in place.',
    );
    return;
  }
  for (const name of [olderRestoreDb, olderDb, restoreDb, sourceDb]) {
    dropDatabase(name);
  }
  for (const dir of projectRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const dir of workDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log('\n  dedicated databases dropped; temporary artifacts removed');
}

function main() {
  console.log('== DB recovery validation (real PostgreSQL) ==');
  console.log(`  server: ${serverSummary}`);
  console.log(`  server version: ${psql(maintenanceDb, 'SELECT version();')}`);
  console.log(`  pg_dump: ${spawnTool(['pg_dump', '--version'], {}).stdout.trim()}`);
  console.log(`  pg_restore: ${spawnTool(['pg_restore', '--version'], {}).stdout.trim()}`);

  const workDirs = [];
  const projectRoots = [];
  let failure = null;

  try {
    const scenarioA = runScenarioA();
    workDirs.push(scenarioA.workDir);
    console.log('\nSCENARIO A: PASS');
  } catch (error) {
    failure = error;
    console.error(`\nSCENARIO A: FAIL -- ${error.message}`);
  }

  if (!failure) {
    try {
      const scenarioB = runScenarioB();
      workDirs.push(scenarioB.workDir);
      projectRoots.push(scenarioB.projectRoot);
      console.log('\nSCENARIO B: PASS');
    } catch (error) {
      failure = error;
      console.error(`\nSCENARIO B: FAIL -- ${error.message}`);
    }
  }

  try {
    cleanupArtifacts(workDirs, projectRoots);
  } catch (error) {
    console.error(`\n  cleanup warning: ${error.message}`);
  }

  console.log('');
  if (failure) {
    console.log('DB RECOVERY VALIDATION: FAIL');
    process.exit(1);
  }
  console.log('DB RECOVERY VALIDATION: PASS');
}

main();
