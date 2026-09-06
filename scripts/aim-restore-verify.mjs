#!/usr/bin/env node
// aim-restore-verify.mjs -- standalone restore integrity verification
// (AIM Task 0022).
//
// Proves a restored database is structurally sound and matches expected
// migration/row-count state. pg_restore exiting 0 is not enough; this
// command verifies connections, required tables, primary keys, unique
// indexes, foreign-key counts, orphan rows (including the Task 0019 exact
// user-attribution composite FK), migration history, and optional expected
// row counts.
//
// Usage:
//   RESTORE_DATABASE_URL=... node scripts/aim-restore-verify.mjs
//
// Environment:
//   RESTORE_DATABASE_URL        -- required; the restored database to verify
//   AIM_RESTORE_EXPECTED_MIGRATIONS -- optional expected applied-migration count
//   AIM_RESTORE_EXPECTED_COUNTS -- optional JSON file {Table: expectedRowCount}
//
// Exit code 0 = PASS, non-zero = FAIL. Output is bounded and secret-free.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  createVerifier,
  parseConnectionUrl,
  safeConnectionSummary,
} from './backup-recovery-core.mjs';

const PROG = 'aim-restore-verify';

function fail(message) {
  throw new Error(message);
}

function main() {
  if (process.argv.slice(2).length > 0) {
    fail(`${PROG} does not accept arguments or flags.`);
  }

  const targetUrlRaw = process.env.RESTORE_DATABASE_URL;
  const expectedMigrationsRaw = process.env.AIM_RESTORE_EXPECTED_MIGRATIONS;
  const expectedCountsFile = process.env.AIM_RESTORE_EXPECTED_COUNTS;

  if (!targetUrlRaw || !targetUrlRaw.trim()) {
    fail('RESTORE_DATABASE_URL is required.');
  }

  let target;
  try {
    target = parseConnectionUrl(targetUrlRaw);
  } catch (error) {
    fail(`RESTORE_DATABASE_URL is invalid: ${error.message}`);
  }

  function pgEnv() {
    return { ...process.env, PGPASSWORD: target.password };
  }

  function psql(database, query) {
    return execFileSync(
      'psql',
      [
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
      ],
      { env: pgEnv(), encoding: 'utf8' },
    )
      .toString()
      .trim();
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

  const verifier = createVerifier(psql, target.database);
  const verification = verifier.runAll({
    expectedMigrations:
      expectedMigrationsRaw === undefined || expectedMigrationsRaw === ''
        ? undefined
        : Number(expectedMigrationsRaw),
    expectedCounts,
  });

  console.log(`== Restore integrity verification for ${safeConnectionSummary(target)} ==`);
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

  if (!verification.passed) {
    fail('Integrity verification failed.');
  }
}

try {
  main();
} catch (error) {
  console.error(`[FAIL] ${error.message}`);
  console.log('\nRESTORE INTEGRITY VERIFICATION: FAIL');
  process.exitCode = 1;
}
