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
  throw new Error('DATABASE_URL is required for Task 0019 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration = '20260903000000_exact_user_audit_accountability';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

if (!existsSync(join(sourceMigrations, upgradeMigration, 'migration.sql'))) {
  throw new Error(`Required migration is missing: ${upgradeMigration}`);
}

function databaseName(label) {
  return `medsphere_0019_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  const result = spawnSync(pnpmCommand, ['exec', 'prisma', ...args], {
    cwd: packageRoot,
    encoding: 'utf8',
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
    throw new Error(`Prisma command failed: ${args.join(' ')}\n${output.slice(-4000)}`);
  }
}

function executeSql(schemaFile, scopedDatabaseUrl, sql) {
  runPrisma(['db', 'execute', '--stdin', '--schema', schemaFile], scopedDatabaseUrl, {
    input: sql,
  });
}

function createMigrationProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0019-upgrade-'));
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

  // Baseline: every migration published before Task 0019, in declaration order.
  const migrationNames = readdirSync(sourceMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migrationName of migrationNames) {
    if (migrationName === upgradeMigration) continue;
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { migrationsRoot, projectRoot, schemaFile };
}

function createDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
}

function dropDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
}

function deployBaseline(project, scopedDatabaseUrl) {
  runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
}

function installUpgradeMigration(project) {
  cpSync(join(sourceMigrations, upgradeMigration), join(project.migrationsRoot, upgradeMigration), {
    recursive: true,
  });
}

function deployUpgrade(project, scopedDatabaseUrl) {
  installUpgradeMigration(project);
  runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
}

function verifyScenario({ label, seedSql, assertionSql }) {
  const name = databaseName(label);
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    createDatabase(project.schemaFile, name);
    deployBaseline(project, scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, seedSql);
    deployUpgrade(project, scopedDatabaseUrl);

    if (assertionSql) {
      executeSql(project.schemaFile, scopedDatabaseUrl, assertionSql);
    }

    process.stdout.write(`Task 0019 upgrade scenario passed: ${label}\n`);
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}
const tenantOne = '10000000-0000-4000-8000-000000000101';
const tenantTwo = '10000000-0000-4000-8000-000000000102';
const userOne = '20000000-0000-4000-8000-000000000101';
const userTwo = '20000000-0000-4000-8000-000000000102';
// Dedicated platform-user fixture -- distinct from the tenant-user fixtures.
// PLATFORM_USER audit evidence is attributed through platformActorUserId, which
// is a required, non-null reference to User(id) under the authoritative
// pre-0019 schema.
const platformUser = '20000000-0000-4000-8000-000000000103';
const membershipOne = '30000000-0000-4000-8000-000000000101';
const membershipTwo = '30000000-0000-4000-8000-000000000102';
const auditUserOne = '80000000-0000-4000-8000-000000000101';
const auditUserTwo = '80000000-0000-4000-8000-000000000102';
const auditSystem = '80000000-0000-4000-8000-000000000103';
const auditPlatformUser = '80000000-0000-4000-8000-000000000104';
const auditPlatformSystem = '80000000-0000-4000-8000-000000000105';

const tenantInsert = (id, slug) => `
INSERT INTO "Tenant" ("id", "name", "slug", "organizationType", "isActive", "version", "createdAt", "updatedAt")
VALUES ('${id}', '0019 fixture ${slug}', 'fixture-0019-${slug}', 'PHARMACY', true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`;

const userInsert = (id, email) => `
INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "status", "version", "createdAt", "updatedAt", "preferredLanguage")
VALUES ('${id}', '${email}', 'fixture-not-a-real-credential', 'Fixture', 'User', 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'en');
`;

const membershipInsert = (id, tenantId, userId) => `
INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "status", "isDefault", "joinedAt", "version", "createdAt", "updatedAt")
VALUES ('${id}', '${tenantId}', '${userId}', 'ACTIVE', false, CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
`;

const commonSeed = `
${tenantInsert(tenantOne, 'one')}
${tenantInsert(tenantTwo, 'two')}
${userInsert(userOne, 'user-one-0019@medsphere.test')}
${userInsert(userTwo, 'user-two-0019@medsphere.test')}
${membershipInsert(membershipOne, tenantOne, userOne)}
${membershipInsert(membershipTwo, tenantTwo, userTwo)}
`;

verifyScenario({
  label: 'preserves_historical_evidence',
  seedSql: `
${commonSeed}
${userInsert(platformUser, 'platform-user-0019@medsphere.test')}
-- Two historical human audit rows (membership-user pairs that exist), plus
-- tenant SYSTEM, PLATFORM_USER, and platform SYSTEM evidence. Every row is
-- valid under the pre-0019 actor-scope contract: PLATFORM_USER evidence is
-- attributed through platformActorUserId (required non-null under the
-- authoritative pre-0019 AuditEvent_actor_scope_check).
INSERT INTO "AuditEvent" ("id", "scope", "actorType", "outcome", "tenantId", "actorMembershipId", "platformActorUserId", "eventType", "metadata", "occurredAt")
VALUES
  ('${auditUserOne}', 'TENANT', 'TENANT_USER', 'SUCCEEDED', '${tenantOne}', '${membershipOne}', NULL, 'authentication.session.created', '{}', CURRENT_TIMESTAMP),
  ('${auditUserTwo}', 'TENANT', 'TENANT_USER', 'DENIED', '${tenantTwo}', '${membershipTwo}', NULL, 'authorization.permission.denied', '{"requiredPermissions":"authorization.roles.delete"}', CURRENT_TIMESTAMP),
  ('${auditSystem}', 'TENANT', 'SYSTEM', 'SUCCEEDED', '${tenantOne}', NULL, NULL, 'inventory.reservation.expired', '{}', CURRENT_TIMESTAMP),
  ('${auditPlatformUser}', 'PLATFORM', 'PLATFORM_USER', 'SUCCEEDED', NULL, NULL, '${platformUser}', 'authentication.sessions.logout.succeeded', '{"revokedCount":1}', CURRENT_TIMESTAMP),
  ('${auditPlatformSystem}', 'PLATFORM', 'SYSTEM', 'FAILED', NULL, NULL, NULL, 'authentication.session.refresh.failed', '{"reason":"session-not-found"}', CURRENT_TIMESTAMP);
`,
  assertionSql: `
DO $$
DECLARE
  totalRows int;
  tenantUserRows int;
  systemRows int;
BEGIN
  IF (SELECT count(*) FROM "AuditEvent") <> 5 THEN
    RAISE EXCEPTION 'Historical audit evidence was not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AuditEvent" WHERE "id" = '${auditUserOne}' AND "actorUserId" = '${userOne}'
  ) THEN
    RAISE EXCEPTION 'TENANT_USER row one was not backfilled with its exact user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "AuditEvent" WHERE "id" = '${auditUserTwo}' AND "actorUserId" = '${userTwo}'
  ) THEN
    RAISE EXCEPTION 'TENANT_USER row two was not backfilled with its exact user';
  END IF;

  -- PLATFORM_USER retains its exact original platformActorUserId and gains no
  -- TENANT-scoped actor user id.
  IF NOT EXISTS (
    SELECT 1 FROM "AuditEvent"
    WHERE "id" = '${auditPlatformUser}'
      AND "platformActorUserId" = '${platformUser}'
      AND "actorUserId" IS NULL
      AND "tenantId" IS NULL
      AND "actorMembershipId" IS NULL
  ) THEN
    RAISE EXCEPTION 'PLATFORM_USER evidence must retain its exact platformActorUserId with no tenant actor user id';
  END IF;

  -- Both historical TENANT_USER rows must carry exactly their membership user.
  SELECT count(*) INTO tenantUserRows FROM "AuditEvent"
  WHERE "actorType" = 'TENANT_USER' AND "actorUserId" IS NOT NULL;
  IF tenantUserRows <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two TENANT_USER rows with a resolved actor user id';
  END IF;

  -- tenant/platform SYSTEM rows must carry no actor user id.
  SELECT count(*) INTO systemRows FROM "AuditEvent"
  WHERE "actorType" = 'SYSTEM' AND "actorUserId" IS NOT NULL;
  IF systemRows <> 0 THEN
    RAISE EXCEPTION 'SYSTEM events must not gain an actor user id';
  END IF;

  -- No non-TENANT_USER row may gain a tenant actor user id.
  SELECT count(*) INTO totalRows FROM "AuditEvent"
  WHERE "actorType" <> 'TENANT_USER' AND "actorUserId" IS NOT NULL;
  IF totalRows <> 0 THEN
    RAISE EXCEPTION 'SYSTEM/PLATFORM_USER rows must not gain a tenant actor user id';
  END IF;
END $$;
`,
});

verifyScenario({
  label: 'rejects_missing_actor_user',
  seedSql: `${commonSeed}`,
  assertionSql: `
DO $$
BEGIN
  BEGIN
    INSERT INTO "AuditEvent" ("id", "scope", "actorType", "outcome", "tenantId", "actorMembershipId", "eventType", "metadata")
    VALUES (md5('0019-missing-actor')::uuid, 'TENANT', 'TENANT_USER', 'DENIED', '${tenantOne}', '${membershipOne}', 'authorization.permission.denied', '{}');
    RAISE EXCEPTION 'TENANT_USER insert without actorUserId unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;
`,
});

verifyScenario({
  label: 'rejects_cross_user_and_cross_tenant_pairs',
  seedSql: `${commonSeed}`,
  assertionSql: `
DO $$
BEGIN
  BEGIN
    INSERT INTO "AuditEvent" ("id", "scope", "actorType", "outcome", "tenantId", "actorMembershipId", "actorUserId", "eventType", "metadata")
    VALUES (md5('0019-cross-user')::uuid, 'TENANT', 'TENANT_USER', 'DENIED', '${tenantOne}', '${membershipOne}', '${userTwo}', 'authorization.permission.denied', '{}');
    RAISE EXCEPTION 'cross-user membership pair unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO "AuditEvent" ("id", "scope", "actorType", "outcome", "tenantId", "actorMembershipId", "actorUserId", "eventType", "metadata")
    VALUES (md5('0019-cross-tenant')::uuid, 'TENANT', 'TENANT_USER', 'DENIED', '${tenantOne}', '${membershipTwo}', '${userTwo}', 'authorization.permission.denied', '{}');
    RAISE EXCEPTION 'cross-tenant membership pair unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;
`,
});

process.stdout.write('Task 0019 populated upgrade verification passed.\n');
