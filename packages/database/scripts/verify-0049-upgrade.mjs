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
if (!databaseUrlValue)
  throw new Error('DATABASE_URL is required for Task 0049 upgrade verification');

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration = '20260925123000_task_0049_telemetry_security_analytics_boundary';
const pnpmCommand = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';

if (!existsSync(join(sourceMigrations, upgradeMigration, 'migration.sql'))) {
  throw new Error(`Required migration is missing: ${upgradeMigration}`);
}

function prismaProcessArgs(args) {
  return process.platform === 'win32'
    ? ['/d', '/c', 'pnpm.cmd', 'exec', 'prisma', ...args]
    : ['exec', 'prisma', ...args];
}

function databaseName() {
  return `medsphere_0049_upgrade_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function scopedUrl(name) {
  const value = new URL(databaseUrl);
  value.pathname = `/${name}`;
  value.searchParams.set('schema', 'public');
  return value.toString();
}

function runPrisma(args, url, input) {
  const result = spawnSync(pnpmCommand, prismaProcessArgs(args), {
    cwd: packageRoot,
    encoding: 'utf8',
    shell: false,
    env: { ...process.env, DATABASE_URL: url, FORCE_COLOR: '0', NO_COLOR: '1' },
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
      .replaceAll(databaseUrlValue, '[DATABASE_URL]')
      .replaceAll(databaseUrl.toString(), '[DATABASE_URL]');
    throw new Error(`Prisma command failed: ${args.join(' ')}\n${output.slice(-6000)}`);
  }
}

function sql(schemaFile, url, statement) {
  runPrisma(['db', 'execute', '--stdin', '--schema', schemaFile], url, statement);
}

function migrationProject() {
  const root = mkdtempSync(join(tmpdir(), 'medsphere-0049-upgrade-'));
  const migrations = join(root, 'migrations');
  const schema = join(root, 'schema.prisma');
  mkdirSync(migrations);
  writeFileSync(
    schema,
    ['datasource db {', '  provider = "postgresql"', '  url = env("DATABASE_URL")', '}', ''].join(
      '\n',
    ),
    'utf8',
  );
  cpSync(join(sourceMigrations, 'migration_lock.toml'), join(migrations, 'migration_lock.toml'));
  for (const name of readdirSync(sourceMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    if (name >= upgradeMigration) continue;
    cpSync(join(sourceMigrations, name), join(migrations, name), { recursive: true });
  }
  return { root, migrations, schema };
}

const seed = `
INSERT INTO "AuditEvent"
  ("id","scope","actorType","outcome","eventType","metadata","occurredAt")
SELECT
  gen_random_uuid(),
  'PLATFORM',
  'SYSTEM',
  'DENIED',
  'authentication.session.refresh.failed',
  '{}'::jsonb,
  date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '1 day' + INTERVAL '1 hour'
FROM generate_series(1, 20);

INSERT INTO "AuditEvent"
  ("id","scope","actorType","outcome","eventType","metadata","occurredAt")
SELECT
  gen_random_uuid(),
  'PLATFORM',
  'SYSTEM',
  'DENIED',
  'authorization.permission.denied',
  '{}'::jsonb,
  date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '1 day' + INTERVAL '2 hours'
FROM generate_series(1, 19);

INSERT INTO "AuditEvent"
  ("id","scope","actorType","outcome","eventType","metadata","occurredAt")
VALUES
  (
    gen_random_uuid(),
    'PLATFORM',
    'SYSTEM',
    'DENIED',
    'authentication.session.refresh.failed',
    '{}'::jsonb,
    CURRENT_TIMESTAMP
  );
`;

function verify() {
  const project = migrationProject();
  const name = databaseName();
  const url = scopedUrl(name);
  try {
    sql(project.schema, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
    runPrisma(['migrate', 'deploy', '--schema', project.schema], url);
    sql(project.schema, url, seed);

    cpSync(join(sourceMigrations, upgradeMigration), join(project.migrations, upgradeMigration), {
      recursive: true,
    });
    runPrisma(['migrate', 'deploy', '--schema', project.schema], url);

    sql(
      project.schema,
      url,
      `
DO $task0049$
DECLARE
  exposed_columns text[];
BEGIN
  IF (SELECT count(*) FROM "AuditEvent") <> 40 THEN
    RAISE EXCEPTION 'Task 0049 upgrade mutated source audit evidence';
  END IF;

  SELECT array_agg(column_name ORDER BY ordinal_position)
  INTO exposed_columns
  FROM information_schema.columns
  WHERE table_schema = 'aim_analytics'
    AND table_name = 'daily_audit_activity';

  IF exposed_columns <> ARRAY['activity_date','domain','outcome','event_count']::text[] THEN
    RAISE EXCEPTION 'Task 0049 analytics view exposed an unexpected column set: %', exposed_columns;
  END IF;

  IF (SELECT is_updatable FROM information_schema.views
      WHERE table_schema='aim_analytics' AND table_name='daily_audit_activity') <> 'NO' THEN
    RAISE EXCEPTION 'Task 0049 analytics view must not be updatable';
  END IF;

  IF (SELECT count(*) FROM aim_analytics.daily_audit_activity
      WHERE domain='authentication' AND outcome='DENIED' AND event_count=20) <> 1 THEN
    RAISE EXCEPTION 'Task 0049 failed to expose the eligible de-identified cohort';
  END IF;

  IF EXISTS (
    SELECT 1 FROM aim_analytics.daily_audit_activity WHERE domain='authorization'
  ) THEN
    RAISE EXCEPTION 'Task 0049 exposed a cohort below the suppression threshold';
  END IF;

  IF EXISTS (
    SELECT 1 FROM aim_analytics.daily_audit_activity
    WHERE activity_date = CURRENT_DATE
  ) THEN
    RAISE EXCEPTION 'Task 0049 exposed current-day near-real-time activity';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.table_privileges
    WHERE table_schema='aim_analytics'
      AND table_name='daily_audit_activity'
      AND grantee='PUBLIC'
  ) THEN
    RAISE EXCEPTION 'Task 0049 granted analytics view access to PUBLIC';
  END IF;

  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name"='${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0049 migration is not recorded exactly once';
  END IF;
END;
$task0049$;
`,
    );

    runPrisma(['migrate', 'deploy', '--schema', project.schema], url);
    sql(
      project.schema,
      url,
      `
DO $task0049$
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name"='${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0049 repeated deploy changed migration history';
  END IF;
  IF (SELECT count(*) FROM "AuditEvent") <> 40 THEN
    RAISE EXCEPTION 'Task 0049 repeated deploy changed source evidence';
  END IF;
END;
$task0049$;
`,
    );

    process.stdout.write('Task 0049 populated upgrade verification passed.\n');
  } finally {
    try {
      sql(
        project.schema,
        databaseUrl.toString(),
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`,
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  }
}

verify();
