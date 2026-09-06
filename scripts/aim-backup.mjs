#!/usr/bin/env node
// aim-backup.mjs -- deterministic, repository-owned production backup
// workflow (AIM Task 0022).
//
// Windows-safe: every PostgreSQL tool is launched through execFileSync with
// an argument array (no shell string interpolation) and the password travels
// only via the PGPASSWORD environment variable, never argv, so it cannot
// appear in a process listing or in this script's logs.
//
// Backups are PostgreSQL custom-format archives (pg_dump --format=custom)
// with --no-owner --no-privileges, so pg_restore can restore them in a
// controlled way. No proprietary serialization format is introduced.
//
// Usage:
//   DATABASE_URL=... AIM_BACKUP_DIR=... node scripts/aim-backup.mjs
//
// Required environment:
//   DATABASE_URL      -- source database (Prisma-style URL accepted)
//   AIM_BACKUP_DIR     -- directory the backup file is written into
//
// Optional environment:
//   AIM_BACKUP_FILENAME -- backup file name (default:
//                         aim-backup-<UTC yyyymmddThhmmssZ>.dump)
//   AIM_BACKUP_OVERWRITE -- set to "1" to allow replacing an existing file
//                         at the resolved backup path
//   AIM_BACKUP_STATUS_FILE -- path to a JSONL status file to append a
//                         bounded {kind:"backup", ok, ...} record to
//
// Output: bounded operational evidence only. The connection summary is
// host:port/database (never a user name or password) and no backup content
// is printed. Exit code 0 = PASS, non-zero = FAIL.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  appendStatusRecord,
  buildStatusRecord,
  canonicalFileHash,
  parseConnectionUrl,
  safeConnectionSummary,
} from './backup-recovery-core.mjs';

const PROG = 'aim-backup';
const AUTHORS_NOTE = 'AIM backup workflow (Task 0022)';

function main() {
  if (process.argv.slice(2).length > 0) {
    throw new Error(
      `${PROG} takes no positional arguments. Configure via DATABASE_URL, AIM_BACKUP_DIR, and optional AIM_BACKUP_* env vars.`,
    );
  }

  const sourceUrlRaw = process.env.DATABASE_URL;
  const backupDir = process.env.AIM_BACKUP_DIR;
  const statusFile = process.env.AIM_BACKUP_STATUS_FILE ?? '';
  const overwrite = process.env.AIM_BACKUP_OVERWRITE === '1';
  const filename = process.env.AIM_BACKUP_FILENAME;

  function fail(message) {
    throw new Error(message);
  }

  if (!sourceUrlRaw || !sourceUrlRaw.trim()) {
    fail('DATABASE_URL is required.');
  }
  if (!backupDir || !backupDir.trim()) {
    fail('AIM_BACKUP_DIR is required.');
  }

  let source;
  try {
    source = parseConnectionUrl(sourceUrlRaw);
  } catch (error) {
    fail(`DATABASE_URL is invalid: ${error.message}`);
  }

  // PGPASSWORD travels via the environment only -- never argv, never logs.
  function pgEnv() {
    return { ...process.env, PGPASSWORD: source.password };
  }

  function run(cmd, args) {
    return execFileSync(cmd, args, { env: pgEnv(), encoding: 'utf8' }).toString();
  }

  const summary = safeConnectionSummary(source);
  console.log(`== ${AUTHORS_NOTE} -- source ${summary} ==`);
  console.log('== Validating configuration and output location ==');

  try {
    mkdirSync(backupDir, { recursive: true });
  } catch (error) {
    fail(`Could not create AIM_BACKUP_DIR "${backupDir}": ${error.message}`);
  }
  if (!existsSync(backupDir)) {
    fail(`AIM_BACKUP_DIR is not a reachable directory: ${backupDir}`);
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const resolvedFilename = filename || `aim-backup-${timestamp}.dump`;
  const backupPath = path.join(backupDir, resolvedFilename);

  if (existsSync(backupPath)) {
    if (overwrite) {
      console.log(`  note: replacing existing backup file ${resolvedFilename}`);
    } else {
      fail(
        `Backup file already exists: ${resolvedFilename} (set AIM_BACKUP_OVERWRITE=1 to intentionally replace it)`,
      );
    }
  }

  console.log('== Creating PostgreSQL custom-format backup ==');
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
    // Remove a partial file so a corrupt archive is never mistaken for a
    // valid backup.
    try {
      rmSync(backupPath, { force: true });
    } catch {
      // best effort
    }
    fail(`pg_dump failed: ${error.message}`);
  }

  let sizeBytes;
  let sha256Hash;
  try {
    const stats = statSync(backupPath);
    sizeBytes = stats.size;
    if (sizeBytes === 0) {
      fail('Backup file was created but is empty.');
    }
    sha256Hash = canonicalFileHash(backupPath);
  } catch (error) {
    fail(`Backup file is unreadable: ${error.message}`);
  }

  console.log('== Verifying the backup archive is readable ==');
  try {
    run('pg_restore', ['--list', backupPath]);
  } catch (error) {
    fail(`Backup archive is not readable by pg_restore: ${error.message}`);
  }

  appendStatusRecord(
    statusFile,
    buildStatusRecord({
      program: PROG,
      kind: 'backup',
      ok: true,
      detail: `pg_dump custom archive ${sizeBytes} bytes`,
      backupFile: resolvedFilename,
    }),
  );

  console.log('== Evidence ==');
  console.log(`  source                      : ${summary}`);
  console.log(`  backup file                 : ${backupPath}`);
  console.log(`  backup size (bytes)         : ${sizeBytes}`);
  console.log(`  sha256                      : ${sha256Hash}`);
  console.log(`  format                      : postgres custom archive (pg_dump --format=custom)`);
  console.log('  credentials logged          : no');
  console.log('\nAIM BACKUP: PASS');
}

try {
  main();
} catch (error) {
  console.error(`\n[FAIL] ${error.message}`);
  console.log('\nAIM BACKUP: FAIL');
  process.exitCode = 1;
}
