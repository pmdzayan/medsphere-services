#!/usr/bin/env node
// PostgreSQL backup, restore, and disaster-recovery certification.
//
// Proves, with a real pg_dump -> clean database -> pg_restore round trip
// against synthetic MedSphere data, that:
//   1. a backup can be created from a running MedSphere PostgreSQL database
//   2. that backup can be restored into a genuinely separate, clean
//      database (never the source database)
//   3. required representative tables survive the round trip with matching
//      row counts and canonical content hashes, and applied migration-history
//      count matches -- not merely "pg_restore exited 0"
//
// This is CI/launch-readiness verification infrastructure, not a product
// feature, and follows the same conventions already accepted for
// scripts/task5-smoke-test.mjs: no shell string interpolation (every
// external command is invoked via execFileSync with an argument array),
// no logging of a full connection string or password, and synthetic data
// only -- no real healthcare records.
//
// Usage:
//   DATABASE_URL=postgresql://user:pass@host:5432/dbname node scripts/backup-restore-certification.mjs
//
// Optional env vars:
//   BACKUP_CERT_RESTORE_DB   -- name for the clean restore-target database
//                               (default: "<source>_bkrestore_cert")
//   BACKUP_CERT_KEEP_ARTIFACTS=1 -- skip deleting the backup file and the
//                               restore database at the end (debugging only)

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = new URL('..', import.meta.url).pathname;

const REQUIRED_TABLES = [
  'Tenant',
  'User',
  'TenantMembership',
  'Provider',
  'Product',
  'Inventory',
  'Batch',
  'MedicineReservation',
  'AuditEvent',
];

let cleanupState = null;

function fail(message) {
  console.error(`\n[FAIL] ${message}`);
  cleanupArtifacts();
  console.log('\nBACKUP RESTORE CERTIFICATION: FAIL');
  process.exit(1);
}

const sourceUrlRaw = process.env.DATABASE_URL;
if (!sourceUrlRaw) {
  fail('DATABASE_URL is required (synthetic source database only).');
}

// Prisma's DATABASE_URL convention adds a `schema` query parameter that is
// not a standard libpq connection parameter; psql/pg_dump/pg_restore/
// createdb/dropdb all reject it outright. Strip only that parameter (same
// fix already accepted in scripts/task5-smoke-test.mjs).
function stripPrismaSchemaParam(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete('schema');
  return url;
}

function connectionParts(rawUrl) {
  const url = stripPrismaSchemaParam(rawUrl);
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

const source = connectionParts(sourceUrlRaw);
if (!source.database) {
  fail('DATABASE_URL has no database name; cannot certify.');
}

const restoreDbName = process.env.BACKUP_CERT_RESTORE_DB ?? `${source.database}_bkrestore_cert`;
const keepArtifacts = process.env.BACKUP_CERT_KEEP_ARTIFACTS === '1';

if (restoreDbName === source.database) {
  fail('Restore database name must differ from the source database name.');
}

// Every child process below uses PGPASSWORD via the environment rather
// than embedding the password in argv, so it never appears in a process
// listing (ps/`docker top`) or in this script's own logs.
function pgEnv() {
  return { ...process.env, PGPASSWORD: source.password };
}

function run(cmd, args, { input } = {}) {
  return execFileSync(cmd, args, { env: pgEnv(), encoding: 'utf8', input }).toString();
}

function psql(database, query) {
  return run('psql', [
    '-h',
    source.host,
    '-p',
    source.port,
    '-U',
    source.user,
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-q',
    '-c',
    query,
  ]).trim();
}

function connectionSummary(database) {
  // Safe to print: host/port/db name only, never user/password.
  return `${source.host}:${source.port}/${database}`;
}

const evidence = [];
function record(name, ok, detail) {
  evidence.push({ name, ok, detail });
  console.log(`[${ok ? 'ok  ' : 'FAIL'}] ${name}${detail ? ` -- ${detail}` : ''}`);
}

function cleanupArtifacts() {
  if (!cleanupState) {
    return true;
  }

  if (keepArtifacts) {
    console.log(
      `\nBACKUP_CERT_KEEP_ARTIFACTS=1: leaving ${cleanupState.backupPath} and ${cleanupState.restoreDbName} in place.`,
    );
    return true;
  }

  console.log('\n== Cleaning up temporary artifacts ==');
  let cleanupPassed = true;

  try {
    rmSync(cleanupState.workDir, { recursive: true, force: true });
    record('temporary backup file removed', true);
  } catch (error) {
    cleanupPassed = false;
    record('temporary backup file removed', false, error.message);
  }

  try {
    run('dropdb', [
      '-h',
      source.host,
      '-p',
      source.port,
      '-U',
      source.user,
      '--if-exists',
      cleanupState.restoreDbName,
    ]);
    record('restore database dropped', true);
  } catch (error) {
    cleanupPassed = false;
    record('restore database dropped', false, error.message);
  }

  return cleanupPassed;
}

// ---------------------------------------------------------------------
// Step 1-2: confirm the source database is reachable and migrations are
// current. `prisma migrate deploy` is idempotent -- safe to run even if a
// prior CI step already applied migrations -- and is the repository's own
// accepted migration-application command (packages/database/package.json
// "prisma:deploy"), reused rather than reimplemented.
// ---------------------------------------------------------------------
console.log(`== Verifying source database schema (${connectionSummary(source.database)}) ==`);
try {
  psql(source.database, 'SELECT 1;');
} catch (error) {
  fail(`Source database is not reachable: ${error.message}`);
}

try {
  execFileSync('pnpm', ['--filter', '@medsphere/database', 'run', 'prisma:deploy'], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: sourceUrlRaw },
    stdio: 'inherit',
  });
  record('source schema migrations applied', true);
} catch (error) {
  fail(`Could not apply/verify migrations on the source database: ${error.message}`);
}

// ---------------------------------------------------------------------
// Step 3: populate deterministic synthetic MedSphere data.
//
// Follows the exact accepted pattern in
// scripts/task5-smoke-test.mjs::bootstrapUncreatableFoundationState --
// direct SQL only for rows no accepted API can create (Tenant, a SYSTEM
// role and its full permission grant, per the migration-authored rule
// cited there), then ordinary domain rows built on top. All values are
// fixed/synthetic; no real names, phone numbers, or healthcare data.
// ---------------------------------------------------------------------
console.log('\n== Seeding deterministic synthetic data ==');

const ids = {
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
  auditEvent: '00000000-0000-4000-a000-00000000000b',
};

function seed() {
  psql(
    source.database,
    `INSERT INTO "Tenant" (id, name, slug, "isActive", "selfRegistrationEnabled", "createdAt", "updatedAt")
     VALUES ('${ids.tenant}', 'DR Certification Tenant', 'dr-cert-tenant', true, false, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "Role" (id, "tenantId", name, description, type, version, "createdAt", "updatedAt")
     VALUES ('${ids.role}', '${ids.tenant}', 'TENANT_ADMINISTRATOR', 'Built-in tenant authorization administrator', 'SYSTEM', 1, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  // Same accepted invariant cited in task5-smoke-test.mjs: TENANT_ADMINISTRATOR
  // always holds every row in "Permission" (migration-authored, not a
  // testing convenience).
  psql(
    source.database,
    `INSERT INTO "RolePermission" (id, "tenantId", "roleId", "permissionId", "createdAt")
     SELECT gen_random_uuid(), '${ids.tenant}', '${ids.role}', id, now() FROM "Permission"
     ON CONFLICT DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "User" (id, email, "passwordHash", "firstName", "lastName", status, "phoneVerifiedAt", "identityVerificationStatus", "ageVerificationStatus", "ageVerified18Plus", "createdAt", "updatedAt")
     VALUES ('${ids.user}', 'dr-cert-admin@example.test', NULL, 'DrCert', 'Admin', 'ACTIVE', now(), 'APPROVED', 'APPROVED', true, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "TenantMembership" (id, "tenantId", "userId", status, "joinedAt", "createdAt", "updatedAt")
     VALUES ('${ids.membership}', '${ids.tenant}', '${ids.user}', 'ACTIVE', now(), now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "MembershipRole" (id, "tenantId", "membershipId", "roleId")
     VALUES ('${ids.membershipRole}', '${ids.tenant}', '${ids.membership}', '${ids.role}')
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "Provider" (id, "tenantId", "providerType", "businessName", "ownerName", email, phone, address, city, state, country, "postalCode", latitude, longitude, "isVerified", "isActive", "createdAt", "updatedAt")
     VALUES ('${ids.provider}', '${ids.tenant}', 'PHARMACY', 'DR Certification Pharmacy', 'DR Cert Owner', 'dr-cert-provider@example.test', '0000000000', 'Synthetic Address', 'Chennai', 'Tamil Nadu', 'India', '600001', 13.0827, 80.2707, true, true, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "Product" (id, name, brand, category, manufacturer, "dosageForm", strength, "requiresPrescription", "isActive", "createdAt", "updatedAt")
     VALUES ('${ids.product}', 'DR Certification Paracetamol', 'Synthetic Brand', 'MEDICINE', 'Synthetic Manufacturer', 'TABLET', '500 mg', false, true, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "Inventory" (id, "tenantId", "providerId", "productId", sku, "sellingPrice", mrp, "discountPercentage", "taxPercentage", "minimumStockLevel", "isVisible", version, "createdAt", "updatedAt")
     VALUES ('${ids.inventory}', '${ids.tenant}', '${ids.provider}', '${ids.product}', 'DR-CERT-SKU-1', 25.00, 30.00, 0.00, 5.00, 10, true, 1, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "Batch" (id, "tenantId", "inventoryId", "providerId", "productId", "batchNumber", "manufacturingDate", "expiryDate", "receivedQuantity", "onHandQuantity", "heldQuantity", "purchasePrice", "sellingPrice", status, version, "createdAt", "updatedAt")
     VALUES ('${ids.batch}', '${ids.tenant}', '${ids.inventory}', '${ids.provider}', '${ids.product}', 'DR-CERT-BATCH-1', '2026-01-01', '2028-01-01', 100, 100, 0, 20.00, 25.00, 'ACTIVE', 1, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "MedicineReservation" (id, "tenantId", "providerId", "subjectUserId", status, "expiresAt", "idempotencyKey", "creationHash", version, "createdAt", "updatedAt")
     VALUES ('${ids.reservation}', '${ids.tenant}', '${ids.provider}', '${ids.user}', 'PENDING', now() + interval '1 day', 'dr-cert-idempotency-1', '${'0'.repeat(64)}', 1, now(), now())
     ON CONFLICT (id) DO NOTHING;`,
  );

  psql(
    source.database,
    `INSERT INTO "AuditEvent" (id, scope, "actorType", outcome, "tenantId", "eventType", "occurredAt", metadata)
     VALUES ('${ids.auditEvent}', 'TENANT', 'SYSTEM', 'SUCCEEDED', '${ids.tenant}', 'authentication.account.activated', now(), '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING;`,
  );
}

try {
  seed();
  record('synthetic data seeded', true, `tenant ${ids.tenant}`);
} catch (error) {
  fail(`Could not seed synthetic data: ${error.message}`);
}

// ---------------------------------------------------------------------
// Step 4: pre-backup verification evidence -- row count + a canonical
// SHA-256 hash of every row (ordered by primary key, unaligned/tuples-only
// output) for each representative table. This is what step 10/11 compares
// against after restore; it is a computed-value equality check, not a
// wall-clock/timestamp assertion, so it stays deterministic even though
// the rows themselves contain `now()`-generated timestamps -- those
// timestamps are copied byte-for-byte by pg_dump/pg_restore, so comparing
// their hash before/after is exact, not flaky.
// ---------------------------------------------------------------------
function canonicalTableHash(database, table) {
  const rows = run('psql', [
    '-h',
    source.host,
    '-p',
    source.port,
    '-U',
    source.user,
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-F',
    '|',
    '-q',
    '-c',
    `SELECT * FROM "${table}" ORDER BY id;`,
  ]);
  const count = rows.trim().length === 0 ? 0 : rows.trim().split('\n').length;
  const hash = createHash('sha256').update(rows).digest('hex');
  return { count, hash };
}

console.log('\n== Recording pre-backup verification evidence ==');
const preBackup = {};
for (const table of REQUIRED_TABLES) {
  try {
    preBackup[table] = canonicalTableHash(source.database, table);
    record(`pre-backup evidence: ${table}`, true, `rows=${preBackup[table].count}`);
  } catch (error) {
    fail(`Could not record pre-backup evidence for "${table}": ${error.message}`);
  }
}

const preBackupMigrations = (() => {
  try {
    return psql(
      source.database,
      `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`,
    );
  } catch (error) {
    fail(`Could not read migration history from source database: ${error.message}`);
  }
})();

// ---------------------------------------------------------------------
// Step 5-6: create the backup and hash it.
// ---------------------------------------------------------------------
const workDir = mkdtempSync(path.join(tmpdir(), 'medsphere-dr-cert-'));
const backupPath = path.join(workDir, 'medsphere-backup.dump');
cleanupState = { workDir, backupPath, restoreDbName };

console.log(`\n== Creating backup (custom format) ==`);
try {
  run('pg_dump', [
    '-h',
    source.host,
    '-p',
    source.port,
    '-U',
    source.user,
    '-d',
    source.database,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    backupPath,
  ]);
} catch (error) {
  fail(`pg_dump failed: ${error.message}`);
}

let backupHash;
let backupSizeBytes;
try {
  const backupBytes = readFileSync(backupPath);
  backupHash = createHash('sha256').update(backupBytes).digest('hex');
  backupSizeBytes = statSync(backupPath).size;
  if (backupSizeBytes === 0) {
    fail('Backup file was created but is empty.');
  }
  record('backup created', true, `${backupSizeBytes} bytes, sha256=${backupHash}`);
} catch (error) {
  fail(`Backup file is unreadable: ${error.message}`);
}

// ---------------------------------------------------------------------
// Step 7-8: create a genuinely separate, clean database and restore into
// it. Never restores over the source database.
// ---------------------------------------------------------------------
console.log(`\n== Creating clean restore-target database (${connectionSummary(restoreDbName)}) ==`);
try {
  // Drop any leftover database from a prior failed/interrupted run before
  // creating a fresh one, so the restore target is provably clean.
  run('dropdb', [
    '-h',
    source.host,
    '-p',
    source.port,
    '-U',
    source.user,
    '--if-exists',
    restoreDbName,
  ]);
  run('createdb', ['-h', source.host, '-p', source.port, '-U', source.user, restoreDbName]);
  record('clean restore database created', true, restoreDbName);
} catch (error) {
  fail(`Could not create the clean restore database: ${error.message}`);
}

console.log('\n== Restoring backup into the clean database ==');
try {
  run('pg_restore', [
    '-h',
    source.host,
    '-p',
    source.port,
    '-U',
    source.user,
    '-d',
    restoreDbName,
    '--no-owner',
    '--no-privileges',
    backupPath,
  ]);
  record('pg_restore completed', true);
} catch (error) {
  fail(`pg_restore failed: ${error.message}`);
}

// ---------------------------------------------------------------------
// Step 9: verify restored schema.
// ---------------------------------------------------------------------
console.log('\n== Verifying restored schema ==');
let certificationPassed = true;

try {
  for (const table of REQUIRED_TABLES) {
    const exists = psql(restoreDbName, `SELECT to_regclass('"${table}"') IS NOT NULL;`);
    if (exists !== 't') {
      certificationPassed = false;
      record(`restored schema: ${table}`, false, 'table missing after restore');
    } else {
      record(`restored schema: ${table}`, true);
    }
  }

  const restoredMigrations = psql(
    restoreDbName,
    `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`,
  );
  if (restoredMigrations !== preBackupMigrations) {
    certificationPassed = false;
    record(
      'restored migration history matches source',
      false,
      `source=${preBackupMigrations} restored=${restoredMigrations}`,
    );
  } else {
    record(
      'restored migration history matches source',
      true,
      `${restoredMigrations} applied migrations`,
    );
  }
} catch (error) {
  certificationPassed = false;
  record('restored schema verification', false, error.message);
}

// ---------------------------------------------------------------------
// Step 10: verify restored data against the pre-backup evidence.
// ---------------------------------------------------------------------
console.log('\n== Verifying restored data integrity ==');
for (const table of REQUIRED_TABLES) {
  try {
    const restored = canonicalTableHash(restoreDbName, table);
    const expected = preBackup[table];
    const rowCountMatches = restored.count === expected.count;
    const hashMatches = restored.hash === expected.hash;
    if (rowCountMatches && hashMatches) {
      record(`restored data: ${table}`, true, `rows=${restored.count}, hash matches`);
    } else {
      certificationPassed = false;
      record(
        `restored data: ${table}`,
        false,
        `expected rows=${expected.count} hash=${expected.hash}, got rows=${restored.count} hash=${restored.hash}`,
      );
    }
  } catch (error) {
    certificationPassed = false;
    record(`restored data: ${table}`, false, error.message);
  }
}

// ---------------------------------------------------------------------
// Step 11-12: cleanup and final verdict. Cleanup runs regardless of
// outcome; a cleanup failure is reported but never silently upgrades a
// FAIL to a PASS, nor a PASS into a silent FAIL.
// ---------------------------------------------------------------------
const cleanupPassed = cleanupArtifacts();
if (!cleanupPassed) {
  certificationPassed = false;
}

console.log('\n== Certification evidence summary ==');
for (const entry of evidence) {
  console.log(
    `  [${entry.ok ? 'ok  ' : 'FAIL'}] ${entry.name}${entry.detail ? ` -- ${entry.detail}` : ''}`,
  );
}

if (certificationPassed) {
  console.log('\nBACKUP RESTORE CERTIFICATION: PASS');
  process.exit(0);
} else {
  console.log('\nBACKUP RESTORE CERTIFICATION: FAIL');
  process.exit(1);
}
