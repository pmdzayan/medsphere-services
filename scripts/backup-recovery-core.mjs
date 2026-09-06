#!/usr/bin/env node
// backup-recovery-core.mjs -- shared, pure helpers for the AIM backup,
// restore, and recovery tooling (Task 0022).
//
// Design rules:
//   * Pure helpers here never print a password, a full connection URL, or
//     backup content. Every summary that could be logged passes through
//     safeConnectionSummary().
//   * Database verification accepts an injected psql runner
//     `(database, query) => trimmedText` so the same checks are used by the
//     restore CLI, the standalone restore-verify CLI, the deterministic
//     recovery validation script, and unit tests (with a mock runner).
//   * No proprietary serialization format is introduced: backups are
//     PostgreSQL custom-format archives produced by pg_dump.
//
// These repository-level operational scripts import this module; nothing
// under apps/ or packages/ may depend on them.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Connection parsing (Prisma DATABASE_URL compatible).
// ---------------------------------------------------------------------------

// Prisma's DATABASE_URL convention adds a `schema` query parameter that is
// not a standard libpq parameter; psql/pg_dump/pg_restore/createdb/dropdb
// reject it outright. Strip only that parameter (same fix already accepted
// in scripts/backup-restore-certification.mjs).
export function stripPrismaSchemaParam(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete('schema');
  return url;
}

export function parseConnectionUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error('connection URL is required');
  }
  const url = stripPrismaSchemaParam(rawUrl);
  const username = decodeURIComponent(url.username || '');
  const password = decodeURIComponent(url.password || '');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!username) {
    throw new Error('connection URL has no username');
  }
  if (!database) {
    throw new Error('connection URL has no database name');
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: username,
    password,
    database,
  };
}

// Safe to print: host/port/database only -- never user or password.
export function safeConnectionSummary(conn) {
  return `${conn.host}:${conn.port}/${conn.database}`;
}

// ---------------------------------------------------------------------------
// Production-target classification (restore safety).
// ---------------------------------------------------------------------------

// Conservative, documented host markers for managed production-style
// PostgreSQL endpoints. These are deliberately broader than "our production
// host" because the restore utility must fail closed: an operator who needs
// a managed/provider endpoint uses an explicitly documented process outside
// this utility (see docs/operations/backup-restore-runbook.md, "Restore").
export const PRODUCTION_HOST_MARKERS = [
  '.rds.amazonaws.com',
  '.compute.amazonaws.com',
  '.clustercfg.',
  '.postgres.database.azure.com',
  '.database.windows.net',
  '.azure.com',
  '.cloudsql.google.com',
  '.goog',
];

// ---------------------------------------------------------------------------
// CONTRACT: the second argument MUST already be a successfully parsed
// connection object (or null/undefined) from parseConnectionUrl(). This is
// deliberate: an unparsable AIM_PRODUCTION_DATABASE_URL must fail closed in
// the caller BEFORE any database/tool operation, and this helper must never
// see a raw string it could silently fail to classify. The caller parses the
// explicit production URL explicitly and refuses to continue on parse error.
// ---------------------------------------------------------------------------

export function isProductionConnection(conn, explicitProduction) {
  const reasons = [];
  if (explicitProduction) {
    if (
      explicitProduction.host === conn.host &&
      explicitProduction.port === conn.port &&
      explicitProduction.database === conn.database
    ) {
      reasons.push('matches AIM_PRODUCTION_DATABASE_URL');
    }
  }
  const host = conn.host.toLowerCase();
  for (const marker of PRODUCTION_HOST_MARKERS) {
    if (host.endsWith(marker)) {
      reasons.push(`host matches managed production endpoint marker "${marker}"`);
    }
  }
  return { isProduction: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Backup file validation / hashing.
// ---------------------------------------------------------------------------

export function validateBackupFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return { ok: false, reason: 'no backup file path was provided' };
  }
  if (!existsSync(filePath)) {
    return { ok: false, reason: `backup file does not exist: ${filePath}` };
  }
  const stats = statSync(filePath);
  if (!stats.isFile()) {
    return { ok: false, reason: `backup path is not a regular file: ${filePath}` };
  }
  if (stats.size === 0) {
    return { ok: false, reason: `backup file is empty: ${filePath}` };
  }
  return { ok: true, sizeBytes: stats.size, filePath };
}

export function canonicalFileHash(filePath) {
  const bytes = readFileSync(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// Integrity verification engine (injectable psql runner).
// ---------------------------------------------------------------------------
//
// psqlRun(database, query) must return trimmed text (the same contract used
// by scripts/backup-restore-certification.mjs).
export function createVerifier(psqlRun, defaultDatabase) {
  function run(database, query) {
    return psqlRun(database ?? defaultDatabase, query);
  }

  function tableExists(table) {
    return run(null, `SELECT to_regclass('"${table}"') IS NOT NULL;`) === 't';
  }

  function migrationCount(database) {
    return run(
      database,
      `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;`,
    );
  }

  function rowCount(table, database) {
    return Number(run(database, `SELECT count(*) FROM "${table}";`));
  }

  function canonicalTableHash(database, table) {
    const rows = run(database, `SELECT * FROM "${table}" ORDER BY id;`);
    const count = rows.trim().length === 0 ? 0 : rows.trim().split('\n').length;
    const hash = createHash('sha256').update(rows).digest('hex');
    return { count, hash };
  }

  function primaryKeyCount(table) {
    return Number(
      run(
        null,
        `SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = '${table}' AND c.contype = 'p';`,
      ),
    );
  }

  function foreignKeyCount(table) {
    return Number(
      run(
        null,
        `SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid WHERE t.relname = '${table}' AND c.contype = 'f';`,
      ),
    );
  }

  function uniqueIndexOnColumnCount(table, column) {
    return Number(
      run(
        null,
        `SELECT count(*) FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey) WHERE t.relname = '${table}' AND i.indisunique AND a.attname = '${column}';`,
      ),
    );
  }

  function orphanCount(child, childColumn, parent, parentColumn) {
    return Number(
      run(
        null,
        `SELECT count(*) FROM "${child}" c LEFT JOIN "${parent}" p ON c."${childColumn}" = p."${parentColumn}" WHERE c."${childColumn}" IS NOT NULL AND p."${parentColumn}" IS NULL;`,
      ),
    );
  }

  function auditCompositeOrphanCount() {
    return Number(run(null, AUDIT_ACTOR_COMPOSITE_ORPHAN_QUERY));
  }

  // Full battery used by the restore CLI and the standalone verify CLI.
  // expectedMigrations (number) and expectedCounts ({table: count}) are
  // optional; when absent those two groups are skipped (connection, schema,
  // constraint, and orphan checks always run).
  function runAll({ database, expectedMigrations, expectedCounts } = {}) {
    const target = database ?? defaultDatabase;
    const checks = [];
    const record = (name, ok, detail) => {
      checks.push({ name, ok, detail });
      return ok;
    };

    try {
      record('database connection succeeds', run(target, 'SELECT 1;') === '1', undefined);
    } catch {
      record('database connection succeeds', false, 'SELECT 1 failed');
    }
    record(
      'required tables all present',
      REQUIRED_TABLES.every((table) => tableExists(table)),
      REQUIRED_TABLES.join(','),
    );
    for (const table of REQUIRED_TABLES) {
      const count = primaryKeyCount(table);
      record(`primary key present: ${table}`, count >= 1, `pk_count=${count}`);
    }
    for (const [table, column] of REQUIRED_UNIQUE_INDEXES) {
      const count = uniqueIndexOnColumnCount(table, column);
      record(`unique index present: ${table}.${column}`, count >= 1, `index_count=${count}`);
    }
    for (const [table, minimum] of Object.entries(REQUIRED_FK_MINIMA)) {
      const count = foreignKeyCount(table);
      record(`fk count sufficient: ${table}`, count >= minimum, `fk_count=${count} min=${minimum}`);
    }
    for (const [child, childColumn, parent, parentColumn] of VERIFICATION_ORPHAN_PAIRS) {
      const count = orphanCount(child, childColumn, parent, parentColumn);
      record(
        `no orphan rows: ${child}.${childColumn} -> ${parent}`,
        count === 0,
        `orphans=${count}`,
      );
    }
    const auditOrphans = auditCompositeOrphanCount();
    record(
      'no orphan rows: AuditEvent(actorMembershipId, actorUserId, tenantId)',
      auditOrphans === 0,
      `orphans=${auditOrphans}`,
    );

    if (expectedMigrations !== undefined && expectedMigrations !== null) {
      const restoredMigrations = Number(migrationCount(target));
      record(
        'migration history matches expected',
        restoredMigrations === Number(expectedMigrations),
        `expected=${expectedMigrations} restored=${restoredMigrations}`,
      );
    }
    if (expectedCounts && typeof expectedCounts === 'object') {
      for (const [table, expected] of Object.entries(expectedCounts)) {
        const restored = rowCount(table, target);
        record(
          `row count matches expected: ${table}`,
          restored === Number(expected),
          `expected=${expected} restored=${restored}`,
        );
      }
    }

    const passed = checks.every((check) => check.ok);
    return { passed, checks, database: target };
  }

  return {
    run,
    tableExists,
    migrationCount,
    rowCount,
    canonicalTableHash,
    primaryKeyCount,
    foreignKeyCount,
    uniqueIndexOnColumnCount,
    orphanCount,
    auditCompositeOrphanCount,
    runAll,
  };
}

// Representative durable tables the recovery path must preserve. This is the
// same accepted set used by scripts/backup-restore-certification.mjs,
// extended with the Task 0013 privacy/consent tables and the Task 0014
// durable session tables so recovery proves those state types survive too.
export const REQUIRED_TABLES = [
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
];

// Child rows must always point at an existing parent row after restore.
// These are the orphan checks the integrity verifier runs (bounded list;
// the same relationships pg_dump/restore preserves via declarative FKs).
export const VERIFICATION_ORPHAN_PAIRS = [
  ['TenantMembership', 'tenantId', 'Tenant', 'id'],
  ['TenantMembership', 'userId', 'User', 'id'],
  ['UserPrivacy', 'userId', 'User', 'id'],
  ['ConsentRecord', 'userId', 'User', 'id'],
  ['UserSession', 'userId', 'User', 'id'],
  ['UserSession', 'tenantId', 'Tenant', 'id'],
  ['UserSession', 'membershipId', 'TenantMembership', 'id'],
  ['UserSessionRefreshCredential', 'sessionId', 'UserSession', 'id'],
  ['Provider', 'tenantId', 'Tenant', 'id'],
  ['Inventory', 'tenantId', 'Tenant', 'id'],
  ['Inventory', 'providerId', 'Provider', 'id'],
  ['Inventory', 'productId', 'Product', 'id'],
  ['Batch', 'inventoryId', 'Inventory', 'id'],
  ['MedicineReservation', 'tenantId', 'Tenant', 'id'],
  ['MedicineReservation', 'providerId', 'Provider', 'id'],
  ['AuditEvent', 'tenantId', 'Tenant', 'id'],
  ['AuditEvent', 'actorUserId', 'User', 'id'],
  ['AuditEvent', 'platformActorUserId', 'User', 'id'],
];

// The Task 0019 exact-user attribution FK is composite
// (actorMembershipId, actorUserId, tenantId) -> TenantMembership(id, userId, tenantId),
// so it needs a dedicated orphan check rather than the single-column pairs.
export const AUDIT_ACTOR_COMPOSITE_ORPHAN_QUERY = `
  SELECT count(*)
  FROM "AuditEvent" a
  LEFT JOIN "TenantMembership" m
    ON a."actorMembershipId" = m."id"
   AND a."actorUserId" = m."userId"
   AND a."tenantId" = m."tenantId"
  WHERE a."actorMembershipId" IS NOT NULL AND m."id" IS NULL;
`.trim();

// (table, indexed column) pairs whose UNIQUE index must still exist after
// restore -- Prisma-authored unique constraints that application behavior
// depends on (email uniqueness, slug uniqueness, refresh-credential hashes).
export const REQUIRED_UNIQUE_INDEXES = [
  ['Tenant', 'slug'],
  ['User', 'email'],
  ['UserSession', 'refreshTokenHash'],
  ['UserSessionRefreshCredential', 'hash'],
];

// Minimum counts of outgoing foreign-key constraints each durable table must
// retain after restore. The verifier fails if restore dropped constraints.
export const REQUIRED_FK_MINIMA = {
  TenantMembership: 2,
  UserPrivacy: 1,
  ConsentRecord: 1,
  UserSession: 3,
  UserSessionRefreshCredential: 1,
  Inventory: 3,
  Batch: 3,
  MedicineReservation: 2,
  AuditEvent: 4,
};
// ---------------------------------------------------------------------------
// Status records (bounded, secret-free operational evidence).
// ---------------------------------------------------------------------------

export function buildStatusRecord({
  program,
  kind,
  ok,
  detail,
  backupFile,
  timestamp,
  operationId,
} = {}) {
  return {
    program,
    kind,
    ok: Boolean(ok),
    timestamp: timestamp ?? Math.floor(Date.now() / 1000),
    ...(backupFile ? { backupFile } : {}),
    ...(operationId ? { operationId } : {}),
    ...(detail ? { detail } : {}),
  };
}

export function appendStatusRecord(filePath, record) {
  if (!filePath) {
    return;
  }
  const target = dirname(filePath);
  if (target && !existsSync(target)) {
    mkdirSync(target, { recursive: true });
  }
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

export function readStatusRecords(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  const records = [];
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // Never let one malformed record corrupt the whole status stream.
    }
  }
  return records;
}

// ---------------------------------------------------------------------------
// Backup observability metrics (provider-neutral Prometheus text format).
// ---------------------------------------------------------------------------
//
// These metrics describe the backup/recovery pipeline only -- they never
// carry database content, patient data, or credentials. Operators scrape
// them via a Prometheus node/textfile collector configured to run
// scripts/aim-backup-status.mjs (see
// docs/operations/v1-observability-runbook.md and
// docs/operations/v1-alert-rules.prometheus.yml).

export function computeBackupMetrics(records, nowSeconds, warnAfterSeconds, criticalAfterSeconds) {
  const backups = records.filter((record) => record.kind === 'backup');
  const restores = records.filter((record) => record.kind === 'restore');
  const verifies = records.filter((record) => record.kind === 'verify');

  // Never let sort()/pop() mutate the filtered arrays we still count from.
  const backupsSorted = [...backups].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const lastBackup = backupsSorted[backupsSorted.length - 1];
  const successes = backups.filter((record) => record.ok);
  const successesSorted = [...successes].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const lastSuccess = successesSorted[successesSorted.length - 1];

  const lastSuccessTs = lastSuccess ? Number(lastSuccess.timestamp) : 0;
  const lastSuccessAgeSeconds = lastSuccessTs > 0 ? Math.max(0, nowSeconds - lastSuccessTs) : 0;
  const staleWarning = lastSuccessTs > 0 && lastSuccessAgeSeconds > Number(warnAfterSeconds);
  const staleCritical = lastSuccessTs > 0 && lastSuccessAgeSeconds > Number(criticalAfterSeconds);

  const restoresSorted = [...restores].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  const latestRestore = restoresSorted[restoresSorted.length - 1];

  // Restore/verification correlation: a verification record is ONLY
  // meaningful when it belongs to the SAME restore operation (same
  // operationId). We deliberately fail closed: if the newest restore has no
  // matching successful verification record, the metric is 0 -- an older
  // successful verify never satisfies a newer restore, and uncorrelated
  // legacy records are never treated as verification.
  let restoreVerified = 0;
  if (latestRestore && latestRestore.ok && latestRestore.operationId) {
    const matchingVerify = verifies.find(
      (verify) => verify.operationId === latestRestore.operationId && verify.ok,
    );
    if (matchingVerify) {
      restoreVerified = 1;
    }
  }

  return {
    status: lastBackup ? (lastBackup.ok ? 1 : 0) : 0,
    lastSuccessTimestampSeconds: lastSuccessTs,
    lastSuccessAgeSeconds,
    staleWarning,
    staleCritical,
    attemptsSuccess: backups.filter((record) => record.ok).length,
    attemptsFailure: backups.filter((record) => !record.ok).length,
    restoreVerified: restoreVerified ? 1 : 0,
    restoreAttempted: restores.length,
  };
}

export function formatBackupMetrics(metrics, warnAfterSeconds, criticalAfterSeconds) {
  const lines = [
    '# HELP medsphere_backup_status Whether the most recent backup attempt succeeded (1) or failed (0).',
    '# TYPE medsphere_backup_status gauge',
    `medsphere_backup_status ${metrics.status}`,
    '',
    '# HELP medsphere_backup_last_success_timestamp_seconds Unix seconds of the most recent successful backup (0 when none).',
    '# TYPE medsphere_backup_last_success_timestamp_seconds gauge',
    `medsphere_backup_last_success_timestamp_seconds ${metrics.lastSuccessTimestampSeconds}`,
    '',
    '# HELP medsphere_backup_last_success_age_seconds Seconds since the most recent successful backup (0 when none).',
    '# TYPE medsphere_backup_last_success_age_seconds gauge',
    `medsphere_backup_last_success_age_seconds ${metrics.lastSuccessAgeSeconds}`,
    '',
    '# HELP medsphere_backup_attempts_total Backup attempts by outcome.',
    '# TYPE medsphere_backup_attempts_total counter',
    `medsphere_backup_attempts_total{outcome="success"} ${metrics.attemptsSuccess}`,
    `medsphere_backup_attempts_total{outcome="failure"} ${metrics.attemptsFailure}`,
    '',
    '# HELP medsphere_backup_restore_verified Whether the latest restore and integrity verification both succeeded (1) or not (0).',
    '# TYPE medsphere_backup_restore_verified gauge',
    `medsphere_backup_restore_verified ${metrics.restoreVerified}`,
    '',
    '# HELP medsphere_backup_stale Whether the latest successful backup is older than the configured warning/critical thresholds.',
    '# TYPE medsphere_backup_stale gauge',
    `medsphere_backup_stale{severity="warning"} ${metrics.staleWarning ? 1 : 0}`,
    `medsphere_backup_stale{severity="critical"} ${metrics.staleCritical ? 1 : 0}`,
    '',
    '# HELP medsphere_backup_staleness_warning_seconds Backup-age warning threshold (configuration reference).',
    '# TYPE medsphere_backup_staleness_warning_seconds gauge',
    `medsphere_backup_staleness_warning_seconds ${Number(warnAfterSeconds)}`,
    '# HELP medsphere_backup_staleness_critical_seconds Backup-age critical threshold (configuration reference).',
    '# TYPE medsphere_backup_staleness_critical_seconds gauge',
    `medsphere_backup_staleness_critical_seconds ${Number(criticalAfterSeconds)}`,
  ];
  return `${lines.join('\n')}\n`;
}
