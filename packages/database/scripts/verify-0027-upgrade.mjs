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

if (!databaseUrlValue) {
  throw new Error('DATABASE_URL is required for Task 0027 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');

const controlsMigration = '20260910120000_live_availability_request_controls';
const preferenceAdminMigration =
  '20260910130000_live_availability_request_preference_admin';
const task0027Migrations = [controlsMigration, preferenceAdminMigration];

const pnpmCommand =
  process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'pnpm';

function prismaProcessArgs(args) {
  if (process.platform === 'win32') {
    return ['/d', '/c', 'pnpm.cmd', 'exec', 'prisma', ...args];
  }

  return ['exec', 'prisma', ...args];
}

for (const requiredMigration of task0027Migrations) {
  if (!existsSync(join(sourceMigrations, requiredMigration, 'migration.sql'))) {
    throw new Error(`Required migration is missing: ${requiredMigration}`);
  }
}

function databaseName(label) {
  return `medsphere_0027_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  const result = spawnSync(pnpmCommand, prismaProcessArgs(args), {
    cwd: packageRoot,
    encoding: 'utf8',
    shell: false,
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

  if (result.status !== 0) {
    throw new Error(`Prisma command failed: ${args.join(' ')}\n${output.slice(-6000)}`);
  }

  return output;
}

function executeSql(schemaFile, scopedDatabaseUrl, sql) {
  runPrisma(['db', 'execute', '--stdin', '--schema', schemaFile], scopedDatabaseUrl, {
    input: sql,
  });
}

function createMigrationProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0027-upgrade-'));
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

  const migrationNames = readdirSync(sourceMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationName of migrationNames) {
    // Exact pre-Task-0027 baseline. Never pre-apply Task 0027 or later
    // migrations or the upgrade proof becomes invalid.
    if (migrationName >= controlsMigration) {
      continue;
    }

    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { projectRoot, migrationsRoot, schemaFile };
}

function copyMigration(project, migrationName) {
  cpSync(
    join(sourceMigrations, migrationName),
    join(project.migrationsRoot, migrationName),
    { recursive: true },
  );
}

function createDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
}

function dropDatabase(schemaFile, name) {
  executeSql(
    schemaFile,
    databaseUrl.toString(),
    `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`,
  );
}

// Deterministic fixture UUIDs.
const tenantOne = '10000000-0000-4000-8000-000000002701';
const tenantTwo = '10000000-0000-4000-8000-000000002702';
const providerOne = '40000000-0000-4000-8000-000000002701';
const providerTwo = '40000000-0000-4000-8000-000000002702';
const adminRole = 'a0000000-0000-4000-8000-000000002701';
const otherRole = 'a0000000-0000-4000-8000-000000002702';
const existingAuditEvent = 'b0000000-0000-4000-8000-000000002701';
const postUpgradeOldAuditEvent = 'b0000000-0000-4000-8000-000000002702';
const newAuditEvent = 'b0000000-0000-4000-8000-000000002703';

const baselineSeedSql = `
INSERT INTO "Tenant"
  ("id", "name", "slug", "organizationType", "isActive",
   "selfRegistrationEnabled", "version", "createdAt", "updatedAt")
VALUES
  ('${tenantOne}', 'Task 0027 Pharmacy Tenant A', 'task-0027-a', 'PHARMACY',
   true, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('${tenantTwo}', 'Task 0027 Pharmacy Tenant B', 'task-0027-b', 'PHARMACY',
   true, false, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Provider"
  ("id", "tenantId", "providerType", "businessName", "ownerName", "email",
   "phone", "address", "city", "state", "country", "postalCode", "latitude",
   "longitude", "isVerified", "isActive", "version", "createdAt", "updatedAt")
VALUES
  ('${providerOne}', '${tenantOne}', 'PHARMACY', 'Task 0027 Pharmacy A',
   'Fixture Owner A', 'task0027-a@medsphere.test', '0000002701',
   'Fixture address A', 'Chennai', 'Tamil Nadu', 'India', '600001',
   13.0827, 80.2707, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('${providerTwo}', '${tenantTwo}', 'PHARMACY', 'Task 0027 Pharmacy B',
   'Fixture Owner B', 'task0027-b@medsphere.test', '0000002702',
   'Fixture address B', 'Chennai', 'Tamil Nadu', 'India', '600002',
   13.0827, 80.2707, true, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "Role"
  ("id", "tenantId", "name", "description", "type", "version",
   "createdAt", "updatedAt")
VALUES
  ('${adminRole}', '${tenantOne}', 'TENANT_ADMINISTRATOR',
   'Task 0027 fixture administrator', 'SYSTEM', 1,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('${otherRole}', '${tenantOne}', 'TASK_0027_NON_ADMIN',
   'Task 0027 negative-control role', 'TENANT', 1,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

DO $$
DECLARE
  read_count INTEGER;
  manage_count INTEGER;
BEGIN
  SELECT count(*) INTO read_count
  FROM "Permission"
  WHERE "name" = 'inventory.availability-requests.read';

  SELECT count(*) INTO manage_count
  FROM "Permission"
  WHERE "name" = 'inventory.availability-requests.manage';

  IF read_count <> 1 OR manage_count <> 1 THEN
    RAISE EXCEPTION
      'Task 0027 baseline is not Task 0026-complete: read %, manage %',
      read_count, manage_count;
  END IF;
END $$;

INSERT INTO "AuditEvent"
  ("id", "scope", "actorType", "outcome", "tenantId", "eventType",
   "resourceType", "resourceId", "metadata", "occurredAt")
VALUES
  ('${existingAuditEvent}', 'TENANT', 'SYSTEM', 'SUCCEEDED',
   '${tenantOne}', 'inventory.availability-request.responded',
   'AvailabilityRequest', 'task-0027-existing-audit',
   '{"outcome":"AVAILABLE"}'::jsonb, CURRENT_TIMESTAMP);
`;

const assertionsAfterBothMigrations = `
DO $$
DECLARE
  pref_count INTEGER;
  live_enabled BOOLEAN;
  permission_count INTEGER;
  assignment_count INTEGER;
  non_admin_assignment_count INTEGER;
  old_audit_count INTEGER;
  migration_count INTEGER;
BEGIN
  -- Existing pharmacies must not be silently opted in.
  SELECT count(*) INTO pref_count
  FROM "PharmacyAvailabilityRequestPreference";

  IF pref_count <> 0 THEN
    RAISE EXCEPTION
      'Task 0027 migration unexpectedly backfilled pharmacy preferences: %',
      pref_count;
  END IF;

  -- Task 0026 permissions must survive unchanged.
  SELECT count(*) INTO permission_count
  FROM "Permission"
  WHERE "name" IN (
    'inventory.availability-requests.read',
    'inventory.availability-requests.manage'
  );

  IF permission_count <> 2 THEN
    RAISE EXCEPTION
      'Task 0027 removed or duplicated Task 0026 availability permissions';
  END IF;

  -- New least-privilege configuration permission exists exactly once.
  SELECT count(*) INTO permission_count
  FROM "Permission"
  WHERE "name" = 'inventory.availability-requests.configure';

  IF permission_count <> 1 THEN
    RAISE EXCEPTION
      'Task 0027 configure permission missing or duplicated: %',
      permission_count;
  END IF;

  SELECT count(*) INTO assignment_count
  FROM "RolePermission" rp
  JOIN "Permission" p ON p."id" = rp."permissionId"
  WHERE rp."roleId" = '${adminRole}'
    AND rp."tenantId" = '${tenantOne}'
    AND p."name" = 'inventory.availability-requests.configure';

  IF assignment_count <> 1 THEN
    RAISE EXCEPTION
      'Task 0027 configure permission not assigned exactly once to tenant administrator: %',
      assignment_count;
  END IF;

  SELECT count(*) INTO non_admin_assignment_count
  FROM "RolePermission" rp
  JOIN "Permission" p ON p."id" = rp."permissionId"
  WHERE rp."roleId" = '${otherRole}'
    AND p."name" = 'inventory.availability-requests.configure';

  IF non_admin_assignment_count <> 0 THEN
    RAISE EXCEPTION
      'Task 0027 configure permission leaked to a non-administrator role';
  END IF;

  -- Historical accepted audit evidence must survive the CHECK replacement.
  SELECT count(*) INTO old_audit_count
  FROM "AuditEvent"
  WHERE "id" = '${existingAuditEvent}'
    AND "eventType" = 'inventory.availability-request.responded';

  IF old_audit_count <> 1 THEN
    RAISE EXCEPTION
      'Task 0027 failed to preserve accepted Task 0026 audit evidence';
  END IF;

  SELECT count(*) INTO migration_count
  FROM "_prisma_migrations"
  WHERE "migration_name" IN (
    '${controlsMigration}',
    '${preferenceAdminMigration}'
  )
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL;

  IF migration_count <> 2 THEN
    RAISE EXCEPTION
      'Task 0027 migrations are not both recorded as successfully applied: %',
      migration_count;
  END IF;

  -- Omit liveRequestsEnabled to prove DB default-off behavior.
  INSERT INTO "PharmacyAvailabilityRequestPreference"
    ("providerId", "tenantId", "timezone", "createdAt", "updatedAt")
  VALUES
    ('${providerOne}', '${tenantOne}', 'Asia/Kolkata',
     CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

  SELECT "liveRequestsEnabled" INTO live_enabled
  FROM "PharmacyAvailabilityRequestPreference"
  WHERE "providerId" = '${providerOne}';

  IF live_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'Task 0027 pharmacy participation does not default to disabled';
  END IF;
END $$;

-- Provider/tenant scope FK must reject a provider paired with another tenant.
DO $$
BEGIN
  BEGIN
    INSERT INTO "PharmacyAvailabilityRequestPreference"
      ("providerId", "tenantId", "timezone", "createdAt", "updatedAt")
    VALUES
      ('${providerTwo}', '${tenantOne}', 'Asia/Kolkata',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    RAISE EXCEPTION 'Task 0027 cross-tenant provider preference unexpectedly succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;
END $$;

-- Quiet hours must be absent together or present together.
DO $$
BEGIN
  BEGIN
    UPDATE "PharmacyAvailabilityRequestPreference"
    SET "quietHoursStartMinute" = 120,
        "quietHoursEndMinute" = NULL
    WHERE "providerId" = '${providerOne}';

    RAISE EXCEPTION 'Task 0027 quiet-hours pair constraint unexpectedly allowed half a pair';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END $$;

-- Quiet-hour minute range is exactly 0..1439.
DO $$
BEGIN
  BEGIN
    UPDATE "PharmacyAvailabilityRequestPreference"
    SET "quietHoursStartMinute" = -1,
        "quietHoursEndMinute" = 120
    WHERE "providerId" = '${providerOne}';

    RAISE EXCEPTION 'Task 0027 quiet-hours range constraint unexpectedly allowed -1';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  BEGIN
    UPDATE "PharmacyAvailabilityRequestPreference"
    SET "quietHoursStartMinute" = 120,
        "quietHoursEndMinute" = 1440
    WHERE "providerId" = '${providerOne}';

    RAISE EXCEPTION 'Task 0027 quiet-hours range constraint unexpectedly allowed 1440';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;
END $$;

-- Valid overnight quiet hours are supported.
UPDATE "PharmacyAvailabilityRequestPreference"
SET "liveRequestsEnabled" = true,
    "quietHoursStartMinute" = 1320,
    "quietHoursEndMinute" = 420,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "providerId" = '${providerOne}';

-- Existing accepted event type remains insertable after allowlist replacement.
INSERT INTO "AuditEvent"
  ("id", "scope", "actorType", "outcome", "tenantId", "eventType",
   "resourceType", "resourceId", "metadata", "occurredAt")
VALUES
  ('${postUpgradeOldAuditEvent}', 'TENANT', 'SYSTEM', 'SUCCEEDED',
   '${tenantOne}', 'inventory.availability-request.responded',
   'AvailabilityRequest', 'task-0027-old-event-after-upgrade',
   '{"outcome":"AVAILABLE"}'::jsonb, CURRENT_TIMESTAMP);

-- New Task 0027 event is accepted.
INSERT INTO "AuditEvent"
  ("id", "scope", "actorType", "outcome", "tenantId", "eventType",
   "resourceType", "resourceId", "metadata", "occurredAt")
VALUES
  ('${newAuditEvent}', 'TENANT', 'SYSTEM', 'SUCCEEDED',
   '${tenantOne}', 'inventory.availability-request.preference.configured',
   'PharmacyAvailabilityRequestPreference', '${providerOne}',
   '{"liveRequestsEnabled":true}'::jsonb, CURRENT_TIMESTAMP);
`;

function verifyPopulatedUpgrade() {
  const label = 'populated_task0026_to_task0027';
  const name = databaseName(label);
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    createDatabase(project.schemaFile, name);

    // Deploy exact accepted history immediately before Task 0027.
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);

    executeSql(project.schemaFile, scopedDatabaseUrl, baselineSeedSql);

    // Production ordering: controls migration first, admin/audit migration second.
    copyMigration(project, controlsMigration);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);

    copyMigration(project, preferenceAdminMigration);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);

    executeSql(project.schemaFile, scopedDatabaseUrl, assertionsAfterBothMigrations);

    // A second deployment must be a safe no-op.
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);

    executeSql(
      project.schemaFile,
      scopedDatabaseUrl,
      `
DO $$
DECLARE
  migration_count INTEGER;
  configure_permission_count INTEGER;
  configure_assignment_count INTEGER;
  preference_count INTEGER;
BEGIN
  SELECT count(*) INTO migration_count
  FROM "_prisma_migrations"
  WHERE "migration_name" IN (
    '${controlsMigration}',
    '${preferenceAdminMigration}'
  )
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL;

  IF migration_count <> 2 THEN
    RAISE EXCEPTION
      'Task 0027 repeated deploy altered migration history: %',
      migration_count;
  END IF;

  SELECT count(*) INTO configure_permission_count
  FROM "Permission"
  WHERE "name" = 'inventory.availability-requests.configure';

  IF configure_permission_count <> 1 THEN
    RAISE EXCEPTION
      'Task 0027 repeated deploy duplicated configure permission: %',
      configure_permission_count;
  END IF;

  SELECT count(*) INTO configure_assignment_count
  FROM "RolePermission" rp
  JOIN "Permission" p ON p."id" = rp."permissionId"
  WHERE rp."roleId" = '${adminRole}'
    AND p."name" = 'inventory.availability-requests.configure';

  IF configure_assignment_count <> 1 THEN
    RAISE EXCEPTION
      'Task 0027 repeated deploy duplicated administrator permission assignment: %',
      configure_assignment_count;
  END IF;

  SELECT count(*) INTO preference_count
  FROM "PharmacyAvailabilityRequestPreference"
  WHERE "providerId" = '${providerOne}';

  IF preference_count <> 1 THEN
    RAISE EXCEPTION
      'Task 0027 repeated deploy mutated preference rows: %',
      preference_count;
  END IF;
END $$;
`,
    );

    process.stdout.write('Task 0027 populated upgrade verification passed.\n');
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}

verifyPopulatedUpgrade();
