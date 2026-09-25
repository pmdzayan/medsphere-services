import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'packages/database/prisma/migrations/20260925123000_task_0049_telemetry_security_analytics_boundary/migration.sql',
);
const grantPath = path.join(
  root,
  'packages/database/scripts/task-0049-bi-reader-grants.sql',
);

export function checkAnalyticsBoundary(
  source = fs.readFileSync(migrationPath, 'utf8'),
  grants = fs.readFileSync(grantPath, 'utf8'),
) {
  const failures = [];

  const required = [
    'CREATE SCHEMA IF NOT EXISTS aim_analytics',
    'REVOKE ALL ON SCHEMA aim_analytics FROM PUBLIC',
    'daily_audit_activity',
    'WITH (security_barrier = true)',
    'HAVING COUNT(*) >= 20',
    '"occurredAt" < date_trunc(\'day\', CURRENT_TIMESTAMP)',
    'REVOKE ALL ON aim_analytics.daily_audit_activity FROM PUBLIC',
  ];
  for (const value of required) {
    if (!source.includes(value)) failures.push(`Missing analytics boundary invariant: ${value}`);
  }

  const viewBody =
    source.match(/CREATE OR REPLACE VIEW aim_analytics\.daily_audit_activity[\s\S]*?COMMENT ON SCHEMA/)?.[0] ??
    source;

  for (const forbidden of [
    'tenantId',
    'userId',
    'actorUserId',
    'actorMembershipId',
    'platformActorUserId',
    'providerId',
    'resourceId',
    'requestId',
    'ipAddress',
    'userAgent',
    'metadata',
  ]) {
    if (viewBody.includes(forbidden)) {
      failures.push(`Analytics read model exposes or references forbidden identifier field: ${forbidden}`);
    }
  }

  if (/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\b/i.test(source)) {
    failures.push('Analytics migration grants a write-capable privilege.');
  }
  if (/GRANT[\s\S]*ON\s+(?:TABLE\s+)?public\./i.test(source)) {
    failures.push('Analytics migration grants access to OLTP public-schema tables.');
  }

  const executableGrants = grants
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

  const grantRequirements = [
    'ALTER ROLE aim_bi_reader SET default_transaction_read_only = on',
    'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM aim_bi_reader',
    'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM aim_bi_reader',
    'REVOKE CREATE ON SCHEMA public FROM aim_bi_reader',
    'GRANT USAGE ON SCHEMA aim_analytics TO aim_bi_reader',
    'GRANT SELECT ON aim_analytics.daily_audit_activity TO aim_bi_reader',
  ];
  for (const value of grantRequirements) {
    if (!executableGrants.includes(value)) {
      failures.push(`Missing BI least-privilege invariant: ${value}`);
    }
  }
  if (
    /CREATE\s+ROLE|PASSWORD|GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)\b/i.test(executableGrants)
  ) {
    failures.push('BI grant script creates credentials or grants write-capable privileges.');
  }

  return failures;
}

export function run() {
  const failures = checkAnalyticsBoundary();
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    return 1;
  }
  process.stdout.write(
    'Task 0049 analytics boundary: PASS (suppressed, identifier-free, no PUBLIC/write grant)\n',
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
