#!/usr/bin/env node
// aim-restore.mjs -- deterministic, repository-owned ISOLATED recovery
// workflow (AIM Task 0022).
//
// This tool restores a PostgreSQL custom-format backup into a NEW, isolated,
// non-production database. It deliberately has NO option to target the live
// production database: there is no --force-production, and preflight checks
// fail closed with explicit reasons. Production promotion is a separate
// controlled operator process documented in
// docs/operations/backup-restore-runbook.md.
//
// Windows-safe: every PostgreSQL tool is launched via execFileSync with an
// argument array; the password travels only via PGPASSWORD.
//
// Usage:
//   AIM_BACKUP_FILE=... RESTORE_DATABASE_URL=... node scripts/aim-restore.mjs
//
// Required environment:
//   AIM_BACKUP_FILE        -- path to a PostgreSQL custom-format backup
//   RESTORE_DATABASE_URL   -- the isolated restore target (never production)
//
// Optional environment:
//   DATABASE_URL                    -- source database reference; restoring
//                                      over the source database is refused
//   AIM_PRODUCTION_DATABASE_URL     -- explicit production URL; a matching
//                                      restore target is refused
//   AIM_RESTORE_DROP_EXISTING=1     -- allow replacing an existing restore
//                                      target containing NO AIM tables
//   AIM_RESTORE_EXPECTED_MIGRATIONS -- expected applied-migration count
//   AIM_RESTORE_EXPECTED_COUNTS     -- JSON file {Table: expectedRowCount}
//   AIM_BACKUP_STATUS_FILE          -- JSONL status file for bounded records
//   AIM_RESTORE_KEEP_ON_FAILURE=1   -- keep the target for debugging

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  appendStatusRecord,
  buildStatusRecord,
  createVerifier,
  isProductionConnection,
  parseConnectionUrl,
  REQUIRED_TABLES,
  safeConnectionSummary,
  validateBackupFile,
} from './backup-recovery-core.mjs';

const PROG = 'aim-restore';

function main() {
  if (process.argv.slice(2).length > 0) {
    throw new Error(
      `${PROG} does not accept arguments or flags. Options such as --force-production are intentionally unsupported. Configure the restore entirely via environment variables.`,
    );
  }

  const backupFile = process.env.AIM_BACKUP_FILE;
  const targetUrlRaw = process.env.RESTORE_DATABASE_URL;
  const sourceUrlRaw = process.env.DATABASE_URL;
  const explicitProductionUrlRaw = process.env.AIM_PRODUCTION_DATABASE_URL;
  const statusFile = process.env.AIM_BACKUP_STATUS_FILE ?? '';
  const dropExisting = process.env.AIM_RESTORE_DROP_EXISTING === '1';
  const keepOnFailure = process.env.AIM_RESTORE_KEEP_ON_FAILURE === '1';
  const expectedMigrationsRaw = process.env.AIM_RESTORE_EXPECTED_MIGRATIONS;
  const expectedCountsFile = process.env.AIM_RESTORE_EXPECTED_COUNTS;
  let createdTargetThisRun = false;
  // One correlation identifier per restore operation, shared by the restore
  // and verification status records so backup observability can never pair a
  // verification record with a different restore operation.
  const operationId = randomUUID();

  function fail(message) {
    throw new Error(message);
  }

  // failClean is used after the target database was created by this run so the
  // disposable isolated target is removed on failure unless explicitly kept.
  function failClean(message) {
    if (createdTargetThisRun && !keepOnFailure) {
      try {
        run('dropdb', [
          '-h',
          target.host,
          '-p',
          target.port,
          '-U',
          target.user,
          '--if-exists',
          target.database,
        ]);
        console.error(`  note: dropped restore target ${target.database} after failure`);
      } catch {
        console.error(
          '  note: could not drop the restore target; remove it manually before retrying.',
        );
      }
    }
    fail(message);
  }

  if (!backupFile || !backupFile.trim()) {
    fail('AIM_BACKUP_FILE is required.');
  }
  if (!targetUrlRaw || !targetUrlRaw.trim()) {
    fail('RESTORE_DATABASE_URL is required.');
  }

  let target;
  try {
    target = parseConnectionUrl(targetUrlRaw);
  } catch (error) {
    fail(`RESTORE_DATABASE_URL is invalid: ${error.message}`);
  }

  let source = null;
  if (sourceUrlRaw && sourceUrlRaw.trim()) {
    try {
      source = parseConnectionUrl(sourceUrlRaw);
    } catch (error) {
      fail(`DATABASE_URL is invalid: ${error.message}`);
    }
  }

  // Parse AIM_PRODUCTION_DATABASE_URL explicitly at configuration time. If it
  // is present and cannot be parsed, fail closed IMMEDIATELY -- before any
  // database inspection, create/drop, or pg_restore -- with a bounded,
  // secret-free error. We never silently fall back to host-marker
  // classification, and the raw value is never logged.
  let explicitProduction = null;
  if (explicitProductionUrlRaw && explicitProductionUrlRaw.trim()) {
    try {
      explicitProduction = parseConnectionUrl(explicitProductionUrlRaw);
    } catch {
      fail(
        'AIM_PRODUCTION_DATABASE_URL is present but could not be parsed; refusing to ' +
          'continue before any database operation. Fix the configuration and retry. ' +
          'The misconfigured value is never logged.',
      );
    }
  }

  function pgEnv() {
    return { ...process.env, PGPASSWORD: target.password };
  }

  function run(cmd, args) {
    return execFileSync(cmd, args, { env: pgEnv(), encoding: 'utf8' }).toString();
  }

  function psql(database, query) {
    return run('psql', [
      '-h',
      target.host,
      '-p',
      target.port,
      '-U',
      target.user,
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

  const targetSummary = safeConnectionSummary(target);
  console.log(`== ${PROG} -- isolated restore workflow ==`);

  // ---------------------------------------------------------------------------
  // Preflight 1: production guard (fail closed, no override).
  // ---------------------------------------------------------------------------
  const productionCheck = isProductionConnection(target, explicitProduction);
  if (productionCheck.isProduction) {
    fail(
      `Restore target ${targetSummary} is classified as a production database (${productionCheck.reasons.join('; ')}). ${PROG} never restores into production.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Preflight 2: source == target guard (never restore over the source).
  // ---------------------------------------------------------------------------
  if (source) {
    if (
      source.host === target.host &&
      source.port === target.port &&
      source.database === target.database
    ) {
      fail(
        `Restore target ${targetSummary} is identical to the source database; restoring over the source is forbidden.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Preflight 3: the backup archive must exist, be non-empty, and be readable.
  // ---------------------------------------------------------------------------
  const backupCheck = validateBackupFile(backupFile);
  if (!backupCheck.ok) {
    fail(backupCheck.reason);
  }
  console.log('== Verifying backup archive readability ==');
  try {
    run('pg_restore', ['--list', backupFile]);
    console.log(`  backup file readable: ${backupFile}`);
  } catch (error) {
    fail(`Backup archive is missing, empty, or not readable by pg_restore: ${error.message}`);
  }

  // ---------------------------------------------------------------------------
  // Preflight 4: expected migration count.
  // ---------------------------------------------------------------------------
  let expectedMigrations = expectedMigrationsRaw;
  if (expectedMigrations === undefined || expectedMigrations === '') {
    if (source) {
      try {
        expectedMigrations = psql(
          source.database,
          `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`,
        );
        console.log(`  expected migration count from source: ${expectedMigrations}`);
      } catch (error) {
        fail(
          `Could not read the source database migration history (${error.message}). Set AIM_RESTORE_EXPECTED_MIGRATIONS explicitly, or run against the source server.`,
        );
      }
    }
  }

  let expectedCounts = null;
  if (expectedCountsFile) {
    if (!existsSync(expectedCountsFile)) {
      fail(`AIM_RESTORE_EXPECTED_COUNTS file does not exist: ${expectedCountsFile}`);
    }
    try {
      expectedCounts = JSON.parse(readFileSync(expectedCountsFile, 'utf8'));
    } catch (error) {
      fail(`AIM_RESTORE_EXPECTED_COUNTS is not valid JSON: ${error.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Preflight 5: the target must be a NEW or provably empty non-AIM database.
  // ---------------------------------------------------------------------------
  const checkDatabase = source ? source.database : 'postgres';
  console.log('== Preparing isolated restore target ==');
  let targetExisted = false;
  let targetAlreadyHasAimData = false;
  try {
    const exists = psql(
      checkDatabase,
      `SELECT 1 FROM pg_database WHERE datname = '${target.database}';`,
    );
    targetExisted = exists === '1';
  } catch (error) {
    fail(`Could not inspect the target server (${error.message}).`);
  }

  if (targetExisted) {
    try {
      const hasMigrations =
        psql(target.database, `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL;`) ===
        't';
      const tablesPresent = [];
      for (const table of REQUIRED_TABLES) {
        if (psql(target.database, `SELECT to_regclass('public."${table}"') IS NOT NULL;`) === 't') {
          tablesPresent.push(table);
        }
      }
      targetAlreadyHasAimData = hasMigrations || tablesPresent.length > 0;
      if (targetAlreadyHasAimData) {
        fail(
          `Restore target ${targetSummary} already exists with AIM objects` +
            `${hasMigrations ? ' (including the Prisma migration table)' : ''}` +
            `${tablesPresent.length > 0 ? ` including: ${tablesPresent.join(', ')}` : ''}. ` +
            `This tool only restores into a NEW database; an operator must drop the existing target manually after confirming it is disposable.`,
        );
      }
    } catch (error) {
      fail(`Could not inspect the existing restore target ${targetSummary}: ${error.message}`);
    }

    if (!dropExisting) {
      fail(
        `Restore target ${targetSummary} already exists (and contains no AIM tables). ` +
          `Set AIM_RESTORE_DROP_EXISTING=1 to drop and recreate it as an explicit operator action.`,
      );
    }

    console.log(
      `  dropping existing empty target ${target.database} (AIM_RESTORE_DROP_EXISTING=1)`,
    );
    try {
      run('dropdb', [
        '-h',
        target.host,
        '-p',
        target.port,
        '-U',
        target.user,
        '--if-exists',
        target.database,
      ]);
    } catch (error) {
      fail(`Could not drop the existing empty target: ${error.message}`);
    }
  }

  console.log(`  creating isolated target ${targetSummary}`);
  try {
    run('createdb', ['-h', target.host, '-p', target.port, '-U', target.user, target.database]);
  } catch (error) {
    fail(`Could not create the restore target database: ${error.message}`);
  }
  createdTargetThisRun = true;

  // ---------------------------------------------------------------------------
  // Restore.
  // ---------------------------------------------------------------------------
  console.log('== Restoring backup into the isolated target ==');
  try {
    run('pg_restore', [
      '-h',
      target.host,
      '-p',
      target.port,
      '-U',
      target.user,
      '-d',
      target.database,
      '--no-owner',
      '--no-privileges',
      backupFile,
    ]);
  } catch (error) {
    failClean(`pg_restore failed: ${error.message}`);
  }

  // ---------------------------------------------------------------------------
  // Integrity verification.
  // ---------------------------------------------------------------------------
  console.log('== Running restore integrity verification ==');
  const verifier = createVerifier(
    (database, query) => psql(database ?? target.database, query),
    target.database,
  );
  const verification = verifier.runAll({
    expectedMigrations:
      expectedMigrations === undefined || expectedMigrations === ''
        ? undefined
        : Number(expectedMigrations),
    expectedCounts,
  });

  for (const check of verification.checks) {
    console.log(
      `  [${check.ok ? 'ok  ' : 'FAIL'}] ${check.name}${check.detail ? ` -- ${check.detail}` : ''}`,
    );
  }
  console.log(
    verification.passed
      ? '\nRESTORE INTEGRITY VERIFICATION: PASS'
      : '\nRESTORE INTEGRITY VERIFICATION: FAIL',
  );

  appendStatusRecord(
    statusFile,
    buildStatusRecord({
      program: PROG,
      kind: 'restore',
      ok: true,
      operationId,
      detail: `restored into ${targetSummary}`,
      backupFile: backupFile.split(/[\\/]/).pop(),
    }),
  );
  appendStatusRecord(
    statusFile,
    buildStatusRecord({
      program: PROG,
      kind: 'verify',
      ok: verification.passed,
      operationId,
      detail: verification.passed
        ? `${verification.checks.length} integrity checks passed`
        : `${verification.checks.filter((c) => !c.ok).length} integrity checks failed`,
    }),
  );

  if (!verification.passed) {
    failClean(`Restore integrity verification failed for target ${targetSummary}.`);
  }

  console.log('== Evidence ==');
  console.log(`  backup file                 : ${backupFile}`);
  console.log(`  restore target              : ${targetSummary}`);
  console.log(`  migration count             : ${expectedMigrations ?? 'not asserted'}`);
  console.log('  credentials logged          : no');
  console.log('\nAIM RESTORE: PASS');
}

try {
  main();
} catch (error) {
  console.error(`\n[FAIL] ${error.message}`);
  console.log('\nAIM RESTORE: FAIL');
  process.exitCode = 1;
}
