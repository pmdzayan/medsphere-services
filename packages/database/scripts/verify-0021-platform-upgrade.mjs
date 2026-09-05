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
  throw new Error('DATABASE_URL is required for Task 0021 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration = '20260905000000_platform_administration_foundation';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

if (!existsSync(join(sourceMigrations, upgradeMigration, 'migration.sql'))) {
  throw new Error(`Required migration is missing: ${upgradeMigration}`);
}

function databaseName(label) {
  return `medsphere_0021_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
    shell: process.platform === 'win32', // .cmd shim needs a shell on Windows
    env: { ...process.env, DATABASE_URL: scopedDatabaseUrl, FORCE_COLOR: '0', NO_COLOR: '1' },
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
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0021-upgrade-'));
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
    if (migrationName === upgradeMigration) continue;
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { projectRoot, schemaFile };
}

function createDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
}

function dropDatabase(schemaFile, name) {
  executeSql(schemaFile, databaseUrl.toString(), `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`);
}

function verifyScenario({ label, seedSql, assertionSql, expectFailureSql = null }) {
  const name = databaseName(label);
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    createDatabase(project.schemaFile, name);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    if (seedSql) {
      executeSql(project.schemaFile, scopedDatabaseUrl, seedSql);
    }
    cpSync(
      join(sourceMigrations, upgradeMigration),
      join(project.projectRoot, 'migrations', upgradeMigration),
      { recursive: true },
    );
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);

    if (assertionSql) {
      executeSql(project.schemaFile, scopedDatabaseUrl, assertionSql);
    }
    if (expectFailureSql) {
      let failedAsExpected = false;
      try {
        executeSql(project.schemaFile, scopedDatabaseUrl, expectFailureSql);
      } catch {
        failedAsExpected = true;
      }
      if (!failedAsExpected) {
        throw new Error(`Task 0021 scenario expected a DB failure but it succeeded: ${label}`);
      }
    }

    process.stdout.write(`Task 0021 upgrade scenario passed: ${label}\n`);
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}
// ---------------------------------------------------------------------------
// Scenario 1: upgrade a populated baseline; prove the platform catalogue is
// seeded, protected roles exist, and accepted tenant data is untouched.
// ---------------------------------------------------------------------------
verifyScenario({
  label: 'populated-baseline-upgrade-preserves-tenant-invariants',
  seedSql: `
    INSERT INTO "Tenant" ("id", "name", "slug", "isActive", "version", "createdAt", "updatedAt")
    VALUES ('${randomUUID()}', 'Task 0021 Tenant', 't0021-upgrade', true, 1, now(), now());
    INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "status", "createdAt", "updatedAt")
    VALUES ('${randomUUID()}', 'upgrade-user@medsphere.test', 'x', 'U', 'User', 'ACTIVE', now(), now());
    INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "status", "joinedAt", "createdAt", "updatedAt")
    VALUES ('${randomUUID()}', (SELECT "id" FROM "Tenant" LIMIT 1), (SELECT "id" FROM "User" LIMIT 1), 'ACTIVE', now(), now(), now());
    INSERT INTO "UserSession" ("id", "userId", "membershipId", "tenantId", "familyId", "refreshTokenHash", "expiresAt", "absoluteExpiresAt", "version", "securityVersion", "recentAuthenticatedAt", "createdAt", "updatedAt")
    VALUES (
      '${randomUUID()}', (SELECT "id" FROM "User" LIMIT 1), (SELECT "id" FROM "TenantMembership" LIMIT 1),
      (SELECT "id" FROM "Tenant" LIMIT 1), '${randomUUID()}', '${'x'.repeat(64)}',
      now() + interval '1 hour', now() + interval '1 day', 1, 1, now(), now(), now()
    );
  `,
  assertionSql: `
    DO $$
    BEGIN
      IF (SELECT count(*) FROM "UserSession") <> 1 THEN
        RAISE EXCEPTION 'Task 0021 upgrade altered tenant sessions';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM "PlatformRole" WHERE "key" = 'PLATFORM_OWNER' AND "isProtected") THEN
        RAISE EXCEPTION 'PLATFORM_OWNER missing';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM "PlatformRole" WHERE "key" = 'PLATFORM_ADMIN' AND "isProtected") THEN
        RAISE EXCEPTION 'PLATFORM_ADMIN missing';
      END IF;
      IF (SELECT count(*) FROM "Permission" WHERE "name" IN ('platform.administration.read', 'platform.administration.manage')) <> 2 THEN
        RAISE EXCEPTION 'platform permissions missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "PlatformRolePermission" prp
        JOIN "PlatformRole" pr ON pr."id" = prp."roleId"
        JOIN "Permission" p ON p."id" = prp."permissionId"
        WHERE pr."key" = 'PLATFORM_OWNER' AND p."name" = 'platform.administration.manage'
      ) THEN
        RAISE EXCEPTION 'PLATFORM_OWNER manage binding missing';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM "PlatformRolePermission" prp
        JOIN "PlatformRole" pr ON pr."id" = prp."roleId"
        WHERE pr."key" = 'PLATFORM_ADMIN'
      ) THEN
        RAISE EXCEPTION 'PLATFORM_ADMIN binding missing';
      END IF;
    END $$;
  `,
});

// ---------------------------------------------------------------------------
// Scenario 2: protected platform roles are immutable; a second owner is
// rejected by the one-active-owner unique index. All platform writes run
// post-upgrade (assertionSQL / expectFailureSQL execute after Task 0021).
// ---------------------------------------------------------------------------
verifyScenario({
  label: 'protected-owner-immutability-and-one-owner-invariant',
  seedSql: `
    INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "status", "createdAt", "updatedAt")
    VALUES
      ('${randomUUID()}', 'owner-one@medsphere.test', 'x', 'O', 'One', 'ACTIVE', now(), now()),
      ('${randomUUID()}', 'owner-two@medsphere.test', 'x', 'O', 'Two', 'ACTIVE', now(), now());
  `,
  assertionSql: `
    DO $$
    DECLARE v_user_id UUID;
            v_acct_id UUID;
            v_role_id UUID;
    BEGIN
      SELECT "id" INTO v_user_id FROM "User" WHERE "email" = 'owner-one@medsphere.test';
      INSERT INTO "PlatformAccount" ("id", "userId", "status", "version", "createdAt", "updatedAt")
      VALUES ('${randomUUID()}', v_user_id, 'ACTIVE', 1, now(), now())
      RETURNING "id" INTO v_acct_id;
      SELECT "id" INTO v_role_id FROM "PlatformRole" WHERE "key" = 'PLATFORM_OWNER';
      INSERT INTO "PlatformRoleAssignment" ("id", "platformAccountId", "roleId", "grantedRoleKey", "createdAt")
      VALUES ('${randomUUID()}', v_acct_id, v_role_id, 'PLATFORM_OWNER', now());

      IF (SELECT count(*) FROM "PlatformRoleAssignment" WHERE "grantedRoleKey" = 'PLATFORM_OWNER') <> 1 THEN
        RAISE EXCEPTION 'expected exactly one owner after first assignment';
      END IF;
    END $$;
  `,
  expectFailureSql: `
    -- A second platform account attempting a second owner MUST fail.
    WITH u AS (
      INSERT INTO "PlatformAccount" ("id", "userId", "status", "version", "createdAt", "updatedAt")
      SELECT '${randomUUID()}', "id", 'ACTIVE', 1, now(), now()
      FROM "User" WHERE "email" = 'owner-two@medsphere.test'
      RETURNING "id"
    )
    INSERT INTO "PlatformRoleAssignment" ("id", "platformAccountId", "roleId", "grantedRoleKey", "createdAt")
    SELECT '${randomUUID()}', u."id", pr."id", 'PLATFORM_OWNER', now()
    FROM u, "PlatformRole" pr WHERE pr."key" = 'PLATFORM_OWNER';
  `,
});
