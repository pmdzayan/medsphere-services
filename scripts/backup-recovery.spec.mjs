#!/usr/bin/env node
// backup-recovery.spec.mjs -- focused unit tests for the AIM backup/recovery
// tooling (Task 0022).
//
// These tests are mock-based and need NO PostgreSQL server, so they run in
// CI as part of `pnpm test:architecture` / `pnpm test:backup-recovery`.
// Real PostgreSQL round trips are the responsibility of
// scripts/db-recovery-validation.mjs (local/native and CI) and the existing
// .github/workflows/backup-restore-certification.yml workflow.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStatusRecord,
  canonicalFileHash,
  computeBackupMetrics,
  createVerifier,
  formatBackupMetrics,
  isProductionConnection,
  parseConnectionUrl,
  safeConnectionSummary,
  stripPrismaSchemaParam,
  validateBackupFile,
} from './backup-recovery-core.mjs';

// Windows-safe repository root: fileURLToPath yields a drive-letter path
// (C:\...) which is a valid spawnSync cwd, unlike URL.pathname (/C:\...).
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function runCli(script, env) {
  return spawnSync(process.execPath, [join('scripts', script)], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

// ---------------------------------------------------------------------------
// Connection parsing (must never leak or misparse credentials).
// ---------------------------------------------------------------------------

test('stripPrismaSchemaParam removes only the Prisma schema parameter', () => {
  const url = stripPrismaSchemaParam('postgresql://u:p@h:5433/db?schema=public&x=1');
  assert.equal(url.searchParams.get('schema'), null);
  assert.equal(url.searchParams.get('x'), '1');
});

test('parseConnectionUrl handles Prisma URLs and URL-encoded credentials', () => {
  const conn = parseConnectionUrl(
    'postgresql://medsphere_u%40ser:p%40ss@db.example.com:5433/aim_db?schema=public',
  );
  assert.equal(conn.host, 'db.example.com');
  assert.equal(conn.port, '5433');
  assert.equal(conn.user, 'medsphere_u@ser');
  assert.equal(conn.password, 'p@ss');
  assert.equal(conn.database, 'aim_db');
});

test('parseConnectionUrl rejects a URL without a username or database name', () => {
  assert.throws(() => parseConnectionUrl('postgresql://:pw@h/db'), /username/);
  assert.throws(() => parseConnectionUrl('postgresql://u:p@h/'), /database name/);
});

test('safeConnectionSummary never includes the user name or password', () => {
  const conn = parseConnectionUrl('postgresql://secretuser:supersecret@h:5432/db');
  const summary = safeConnectionSummary(conn);
  assert.equal(summary, 'h:5432/db');
  assert.ok(!summary.includes('secretuser'));
  assert.ok(!summary.includes('supersecret'));
});

// ---------------------------------------------------------------------------
// Production-target classification (restore safety, fail closed).
// ---------------------------------------------------------------------------

test('isProductionConnection flags an explicit production URL match', () => {
  const conn = parseConnectionUrl('postgresql://u:p@prod.example.com:5432/aim_prod');
  const explicit = parseConnectionUrl('postgresql://u2:p3@prod.example.com:5432/aim_prod');
  const result = isProductionConnection(conn, explicit);
  assert.equal(result.isProduction, true);
  assert.ok(result.reasons.some((r) => r.includes('AIM_PRODUCTION_DATABASE_URL')));
});

test('isProductionConnection flags managed production host markers', () => {
  for (const host of [
    'aim-db.cluster-ro-xxxx.us-east-1.rds.amazonaws.com',
    'aim-pg.postgres.database.azure.com',
    'aim-db.cluster-xxxx.region.rds.amazonaws.com',
    'aim-db.us-central1.leadproject.cloudsql.google.com',
  ]) {
    const result = isProductionConnection(
      parseConnectionUrl(`postgresql://u:p@${host}:5432/db`),
      undefined,
    );
    assert.equal(result.isProduction, true, `expected ${host} to be production-classified`);
  }
});

test('isProductionConnection allows ordinary/localhost targets', () => {
  for (const url of [
    'postgresql://u:p@localhost:5432/aim_dev',
    'postgresql://u:p@127.0.0.1:5432/aim_dev',
    'postgresql://u:p@192.168.1.10:5432/aim_staging_like',
  ]) {
    const result = isProductionConnection(parseConnectionUrl(url), undefined);
    assert.equal(result.isProduction, false, `expected ${url} to be non-production`);
  }
});

// ---------------------------------------------------------------------------
// Backup file validation and hashing.
// ---------------------------------------------------------------------------

test('validateBackupFile rejects missing, empty, and nonexistent files', () => {
  assert.equal(validateBackupFile(undefined).ok, false);
  assert.equal(validateBackupFile('   ').ok, false);
  assert.equal(validateBackupFile(join(tmpdir(), 'definitely-not-here.dump')).ok, false);
  const dir = mkdtempSync(join(tmpdir(), 'medsphere-br-spec-'));
  const empty = join(dir, 'empty.dump');
  writeFileSync(empty, '');
  assert.equal(validateBackupFile(empty).ok, false);
  rmSync(dir, { recursive: true, force: true });
});

test('validateBackupFile accepts a non-empty file and canonicalFileHash is deterministic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'medsphere-br-spec-'));
  const file = join(dir, 'sample.dump');
  const content = Buffer.from('PGDMP synthetic archive bytes');
  writeFileSync(file, content);
  const check = validateBackupFile(file);
  assert.equal(check.ok, true);
  assert.equal(check.sizeBytes, content.length);
  assert.equal(canonicalFileHash(file), canonicalFileHash(file));
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Integrity verification engine (injectable psql mock).
// ---------------------------------------------------------------------------

function scriptedMock(plan) {
  return (database, query) => {
    assert.equal(typeof database, 'string');
    assert.equal(typeof query, 'string');
    for (const [pattern, value] of plan) {
      if (pattern.test(query)) {
        return value;
      }
    }
    throw new Error(`unexpected query: ${query}`);
  };
}

function healthyPlan() {
  const plan = [[/SELECT 1;/, '1']];
  plan.push([/LEFT JOIN "TenantMembership" m\s*ON a\."actorMembershipId" = m\."id"/, '0']);
  for (const [, , parent] of [
    ['TenantMembership', 'tenantId', 'Tenant'],
    ['TenantMembership', 'userId', 'User'],
    ['UserPrivacy', 'userId', 'User'],
    ['ConsentRecord', 'userId', 'User'],
    ['UserSession', 'userId', 'User'],
    ['UserSession', 'tenantId', 'Tenant'],
    ['UserSession', 'membershipId', 'TenantMembership'],
    ['UserSessionRefreshCredential', 'sessionId', 'UserSession'],
    ['Provider', 'tenantId', 'Tenant'],
    ['Inventory', 'tenantId', 'Tenant'],
    ['Inventory', 'providerId', 'Provider'],
    ['Inventory', 'productId', 'Product'],
    ['Batch', 'inventoryId', 'Inventory'],
    ['MedicineReservation', 'tenantId', 'Tenant'],
    ['MedicineReservation', 'providerId', 'Provider'],
    ['AuditEvent', 'tenantId', 'Tenant'],
    ['AuditEvent', 'actorUserId', 'User'],
    ['AuditEvent', 'platformActorUserId', 'User'],
  ]) {
    plan.push([new RegExp(`LEFT JOIN "${parent}" p`), '0']);
  }
  for (const table of [
    'Tenant',
    'User',
    'TenantMembership',
    'UserPrivacy',
    'ConsentRecord',
    'UserSession',
    'UserSessionRefreshCredential',
    'Provider',
    'Product',
    'Inventory',
    'Batch',
    'MedicineReservation',
    'AuditEvent',
  ]) {
    plan.push([new RegExp(`to_regclass\\('"${table}"'\\)`), 't']);
    plan.push([new RegExp(`relname = '${table}' AND c\\.contype = 'p'`), '1']);
    plan.push([
      new RegExp(`pg_index i JOIN pg_class t ON t\\.oid = i\\.indrelid JOIN pg_attribute a`),
      '1',
    ]);
  }
  for (const table of [
    'TenantMembership',
    'UserPrivacy',
    'ConsentRecord',
    'UserSession',
    'UserSessionRefreshCredential',
    'Inventory',
    'Batch',
    'MedicineReservation',
    'AuditEvent',
  ]) {
    plan.push([new RegExp(`relname = '${table}' AND c\\.contype = 'f'`), '5']);
  }
  plan.push([/_prisma_migrations.*finished_at IS NOT NULL/, '40']);
  plan.push([/SELECT count\(\*\) FROM "Tenant";/, '1']);
  return plan;
}

test('createVerifier.runAll passes on a healthy mocked restore', () => {
  const verifier = createVerifier(scriptedMock(healthyPlan()), 'aim_db');
  const result = verifier.runAll({ expectedMigrations: 40, expectedCounts: { Tenant: 1 } });
  assert.equal(result.passed, true);
  assert.ok(result.checks.length >= 40);
});

test('createVerifier.runAll fails when a required check fails', () => {
  const plans = healthyPlan();
  const pkPattern = new RegExp(`relname = 'Tenant' AND c\\.contype = 'p'`);
  const index = plans.findIndex(([pattern]) => pattern.source === pkPattern.source);
  plans.splice(index, 1, [pkPattern, '0']);
  const verifier = createVerifier(scriptedMock(plans), 'aim_db');
  const result = verifier.runAll({});
  assert.equal(result.passed, false);
  assert.ok(result.checks.some((c) => !c.ok && c.name.includes('primary key present: Tenant')));
});

test('createVerifier.runAll detects orphan rows', () => {
  const plans = healthyPlan();
  const orphanPattern = new RegExp('LEFT JOIN "User" p');
  const index = plans.findIndex(([pattern]) => pattern.source === orphanPattern.source);
  plans.splice(index, 1, [orphanPattern, '7']);
  const verifier = createVerifier(scriptedMock(plans), 'aim_db');
  const result = verifier.runAll({});
  assert.equal(result.passed, false);
  assert.ok(result.checks.some((c) => !c.ok && c.name.includes('no orphan rows')));
});

// ---------------------------------------------------------------------------
// CLI fail-closed behavior (misused configurations never touch a database).
// ---------------------------------------------------------------------------

test('backup CLI fails closed when DATABASE_URL is missing', () => {
  const result = runCli('aim-backup.mjs', { DATABASE_URL: '', AIM_BACKUP_DIR: process.cwd() });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /DATABASE_URL is required/);
  assert.match(String(result.stdout), /AIM BACKUP: FAIL/);
});

test('backup CLI fails closed when AIM_BACKUP_DIR is missing', () => {
  const result = runCli('aim-backup.mjs', {
    DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
    AIM_BACKUP_DIR: '',
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /AIM_BACKUP_DIR is required/);
});

test('backup CLI rejects positional arguments', () => {
  const result = spawnSync(process.execPath, ['scripts/aim-backup.mjs', '--force'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
      AIM_BACKUP_DIR: process.cwd(),
    },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /no positional arguments/);
});

test('backup CLI process failure propagates and does not leak the password', () => {
  const dir = mkdtempSync(join(tmpdir(), 'medsphere-br-spec-'));
  const result = runCli('aim-backup.mjs', {
    DATABASE_URL: 'postgresql://u:SUPERSECRET_TEST_PW@127.0.0.1:1/db',
    AIM_BACKUP_DIR: join(dir, 'nowhere'),
  });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /AIM BACKUP: FAIL/);
  assert.ok(!output.includes('SUPERSECRET_TEST_PW'), 'password leaked into output');
  rmSync(dir, { recursive: true, force: true });
});

test('restore CLI fails closed when required configuration is missing', () => {
  const missingBackup = runCli('aim-restore.mjs', {
    RESTORE_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  });
  assert.notEqual(missingBackup.status, 0);
  assert.match(String(missingBackup.stderr), /AIM_BACKUP_FILE is required/);

  const missingTarget = runCli('aim-restore.mjs', { AIM_BACKUP_FILE: 'x.dump' });
  assert.notEqual(missingTarget.status, 0);
  assert.match(String(missingTarget.stderr), /RESTORE_DATABASE_URL is required/);
});
test('restore CLI rejects a nonexistent backup file', () => {
  const result = runCli('aim-restore.mjs', {
    AIM_BACKUP_FILE: join(tmpdir(), 'no-such-backup.dump'),
    RESTORE_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /does not exist/);
});

test('restore CLI rejects an unreadable/corrupt backup archive without leaking the password', () => {
  const dir = mkdtempSync(join(tmpdir(), 'medsphere-br-spec-'));
  const corrupt = join(dir, 'corrupt.dump');
  writeFileSync(corrupt, 'not a pg_dump archive at all');
  const result = runCli('aim-restore.mjs', {
    AIM_BACKUP_FILE: corrupt,
    RESTORE_DATABASE_URL: 'postgresql://u:SUPERSECRET_TEST_PW@127.0.0.1:1/db',
  });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /AIM RESTORE: FAIL/);
  assert.ok(!output.includes('SUPERSECRET_TEST_PW'), 'password leaked into output');
  rmSync(dir, { recursive: true, force: true });
});

test('restore CLI rejects an explicit production target with no override', () => {
  const result = runCli('aim-restore.mjs', {
    AIM_BACKUP_FILE: 'whatever.dump',
    RESTORE_DATABASE_URL: 'postgresql://u:p@aim-prod.example.com:5432/aim',
    AIM_PRODUCTION_DATABASE_URL: 'postgresql://u:p@aim-prod.example.com:5432/aim',
    AIM_RESTORE_DROP_EXISTING: '1',
    AIM_RESTORE_KEEP_ON_FAILURE: '1',
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /classified as a production database/);
});

test('restore CLI fails closed on a malformed AIM_PRODUCTION_DATABASE_URL before any tool runs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'medsphere-br-spec-'));
  const corrupt = join(dir, 'corrupt.dump');
  writeFileSync(corrupt, 'not a pg_dump archive at all');
  const result = runCli('aim-restore.mjs', {
    AIM_BACKUP_FILE: corrupt,
    RESTORE_DATABASE_URL: 'postgresql://u:SUPERSECRET_TEST_PW@127.0.0.1:1/db',
    AIM_PRODUCTION_DATABASE_URL: 'postgresql://u:PRODSECRET_PW@host:notaport/db',
    AIM_RESTORE_KEEP_ON_FAILURE: '1',
  });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /AIM_PRODUCTION_DATABASE_URL/);
  assert.match(output, /could not be parsed/i);
  // No database/tool operation proceeded: the corrupt archive is never even
  // inspected, so the pg_restore-readability error must NOT appear.
  assert.doesNotMatch(output, /not readable by pg_restore/);
  assert.doesNotMatch(output, /backup file/);
  // Secrets / malformed values never print.
  assert.ok(!output.includes('SUPERSECRET_TEST_PW'), 'target password leaked into output');
  assert.ok(!output.includes('PRODSECRET_PW'), 'production password leaked into output');
  assert.ok(
    !output.includes('postgresql://u:PRODSECRET_PW@host:notaport/db'),
    'raw production URL leaked into output',
  );
  rmSync(dir, { recursive: true, force: true });
});

test('restore CLI fails closed on a malformed AIM_PRODUCTION_DATABASE_URL even when the target is non-production', () => {
  // A valid ordinary target must still be refused when the production-URL
  // override is present but unparsable: never silently fall back to host
  // marker classification.
  const dir = mkdtempSync(join(tmpdir(), 'medsphere-br-spec-'));
  const corrupt = join(dir, 'corrupt.dump');
  writeFileSync(corrupt, 'not a pg_dump archive at all');
  const result = runCli('aim-restore.mjs', {
    AIM_BACKUP_FILE: corrupt,
    RESTORE_DATABASE_URL: 'postgresql://u:p@localhost:5432/aim_dev',
    AIM_PRODUCTION_DATABASE_URL: 'not-a-valid-url',
    AIM_RESTORE_KEEP_ON_FAILURE: '1',
  });
  assert.notEqual(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /AIM_PRODUCTION_DATABASE_URL/);
  assert.doesNotMatch(output, /not-readable|not readable by pg_restore/);
  assert.ok(!output.includes('not-a-valid-url\n'), 'raw production URL leaked into output');
  rmSync(dir, { recursive: true, force: true });
});

test('restore CLI rejects managed-host production endpoints', () => {
  const result = runCli('aim-restore.mjs', {
    AIM_BACKUP_FILE: 'whatever.dump',
    RESTORE_DATABASE_URL:
      'postgresql://u:p@aim-db.cluster-xxxx.us-east-1.rds.amazonaws.com:5432/aim',
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /production/);
});

test('restore CLI rejects the --force-production option by design', () => {
  const result = spawnSync(process.execPath, ['scripts/aim-restore.mjs', '--force-production'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      AIM_BACKUP_FILE: 'whatever.dump',
      RESTORE_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /intentionally unsupported/);
});

test('restore-verify CLI fails closed when RESTORE_DATABASE_URL is missing', () => {
  const result = runCli('aim-restore-verify.mjs', { RESTORE_DATABASE_URL: '' });
  assert.notEqual(result.status, 0);
  assert.match(String(result.stderr), /RESTORE_DATABASE_URL is required/);
  assert.match(String(result.stdout), /RESTORE INTEGRITY VERIFICATION: FAIL/);
});

test('backup-status CLI emits metrics even with no status file', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/aim-backup-status.mjs', '--file', join(tmpdir(), 'no-status.jsonl')],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0);
  assert.match(String(result.stdout), /medsphere_backup_status 0/);
});

test('computeBackupMetrics tracks success, failure, staleness, and restore verification', () => {
  const records = [
    buildStatusRecord({
      program: 'aim-backup',
      kind: 'backup',
      ok: true,
      timestamp: 1000,
      backupFile: 'a.dump',
    }),
    buildStatusRecord({
      program: 'aim-backup',
      kind: 'backup',
      ok: false,
      timestamp: 2000,
      backupFile: 'b.dump',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 3000,
      operationId: 'op-restore-1',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: true,
      timestamp: 3001,
      operationId: 'op-restore-1',
    }),
  ];
  const metrics = computeBackupMetrics(records, 50000, 3600, 7200);
  assert.equal(metrics.status, 0); // latest backup attempt failed
  assert.equal(metrics.lastSuccessTimestampSeconds, 1000);
  assert.equal(metrics.lastSuccessAgeSeconds, 49000);
  assert.equal(metrics.staleWarning, true);
  assert.equal(metrics.staleCritical, true);
  assert.equal(metrics.attemptsSuccess, 1);
  assert.equal(metrics.attemptsFailure, 1);
  assert.equal(metrics.restoreVerified, 1);
});

// ---------------------------------------------------------------------------
// Restore/verification correlation (fail closed on mismatched operationId).
// ---------------------------------------------------------------------------

test('computeBackupMetrics: matching restore+verify success => restoreVerified 1', () => {
  const records = [
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 100,
      operationId: 'op-1',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: true,
      timestamp: 101,
      operationId: 'op-1',
    }),
  ];
  assert.equal(computeBackupMetrics(records, 1000, 3600, 7200).restoreVerified, 1);
});

test('computeBackupMetrics: matching restore + verify failure => restoreVerified 0', () => {
  const records = [
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 100,
      operationId: 'op-1',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: false,
      timestamp: 101,
      operationId: 'op-1',
    }),
  ];
  assert.equal(computeBackupMetrics(records, 1000, 3600, 7200).restoreVerified, 0);
});

test('computeBackupMetrics: new successful restore with NO new verify => restoreVerified 0', () => {
  // Old restore+verify succeeded; a newer restore (new operationId) has no
  // matching verification record. The old verify must NOT satisfy it.
  const records = [
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 100,
      operationId: 'op-1',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: true,
      timestamp: 101,
      operationId: 'op-1',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 200,
      operationId: 'op-2',
    }),
  ];
  assert.equal(computeBackupMetrics(records, 1000, 3600, 7200).restoreVerified, 0);
});

test('computeBackupMetrics: older successful verify never satisfies a newer restore', () => {
  // An older verify for op-old must never count toward a newer restore op-new.
  const records = [
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 100,
      operationId: 'op-old',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: true,
      timestamp: 101,
      operationId: 'op-old',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 200,
      operationId: 'op-new',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: true,
      timestamp: 201,
      operationId: 'op-other',
    }),
  ];
  assert.equal(computeBackupMetrics(records, 1000, 3600, 7200).restoreVerified, 0);
});

test('computeBackupMetrics: newer successful correlated pair returns to 1', () => {
  const records = [
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 100,
      operationId: 'op-1',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: true,
      timestamp: 101,
      operationId: 'op-1',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'restore',
      ok: true,
      timestamp: 200,
      operationId: 'op-2',
    }),
    buildStatusRecord({
      program: 'aim-restore',
      kind: 'verify',
      ok: true,
      timestamp: 201,
      operationId: 'op-2',
    }),
  ];
  assert.equal(computeBackupMetrics(records, 1000, 3600, 7200).restoreVerified, 1);
});

test('computeBackupMetrics: legacy uncorrelated records are treated conservatively as 0', () => {
  // Records without operationId cannot be correlated; never invent one.
  const records = [
    buildStatusRecord({ program: 'aim-restore', kind: 'restore', ok: true, timestamp: 100 }),
    buildStatusRecord({ program: 'aim-restore', kind: 'verify', ok: true, timestamp: 101 }),
  ];
  assert.equal(computeBackupMetrics(records, 1000, 3600, 7200).restoreVerified, 0);
});

test('formatBackupMetrics emits bounded text with zero sensitive fields', () => {
  const metrics = computeBackupMetrics([], 1000, 100800, 259200);
  const text = formatBackupMetrics(metrics, 100800, 259200);
  assert.match(text, /medsphere_backup_status 0/);
  assert.doesNotMatch(text, /password|postgresql:\/\/|secret|token|@/);
});
