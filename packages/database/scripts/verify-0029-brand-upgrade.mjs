import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const databaseUrlValue = process.env.DATABASE_URL;

if (!databaseUrlValue) {
  throw new Error('DATABASE_URL is required for Task 0029 brand-upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const targetMigration = '20260830190000_aim_consumer_brand';
const targetMigrationSqlPath = join(sourceMigrations, targetMigration, 'migration.sql');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

if (!existsSync(targetMigrationSqlPath)) {
  throw new Error(`Required migration is missing: ${targetMigration}`);
}

const preTaskMigrations = readdirSync(sourceMigrations)
  .filter((entry) => entry < targetMigration)
  .filter((entry) => statSync(join(sourceMigrations, entry)).isDirectory())
  .filter((entry) => existsSync(join(sourceMigrations, entry, 'migration.sql')))
  .sort();

if (preTaskMigrations.length === 0) {
  throw new Error('No accepted pre-0029 migration history was found');
}

function databaseName() {
  return `medsphere_0029_brand_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

  return output;
}

function executeSql(schemaFile, scopedDatabaseUrl, sql) {
  runPrisma(['db', 'execute', '--stdin', '--schema', schemaFile], scopedDatabaseUrl, {
    input: sql,
  });
}

function createMigrationProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0029-brand-upgrade-'));
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
  for (const migrationName of preTaskMigrations) {
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { migrationsRoot, projectRoot, schemaFile };
}

const reservedTenantId = '10000000-0000-4000-8000-000000000029';
const ordinaryExactNameTenantId = '10000000-0000-4000-8000-000000000030';
const similarlyNamedTenantId = '10000000-0000-4000-8000-000000000031';
const customTenantId = '10000000-0000-4000-8000-000000000032';
const userId = '20000000-0000-4000-8000-000000000029';
const membershipId = '30000000-0000-4000-8000-000000000029';
const externalIdentityId = '40000000-0000-4000-8000-000000000029';
const fixedTime = '2026-08-01T12:00:00.000Z';

const seedSql = `
INSERT INTO "Tenant" (
  "id", "name", "slug", "organizationType", "isActive",
  "selfRegistrationEnabled", "version", "createdAt", "updatedAt"
) VALUES
  ('${reservedTenantId}', 'MedSphere Personal Accounts', 'medsphere-personal-accounts',
   'NONE', true, false, 7, '${fixedTime}', '${fixedTime}'),
  ('${ordinaryExactNameTenantId}', 'MedSphere Personal Accounts', 'ordinary-personal-accounts',
   'CLINIC', true, true, 3, '${fixedTime}', '${fixedTime}'),
  ('${similarlyNamedTenantId}', 'MedSphere Personal Accounts Clinic', 'similar-name-clinic',
   'CLINIC', true, true, 2, '${fixedTime}', '${fixedTime}'),
  ('${customTenantId}', 'Northside Community Clinic', 'northside-community-clinic',
   'CLINIC', true, true, 5, '${fixedTime}', '${fixedTime}');

INSERT INTO "User" (
  "id", "email", "passwordHash", "firstName", "lastName", "preferredLanguage",
  "status", "version", "createdAt", "updatedAt"
) VALUES (
  '${userId}', 'task0029@example.invalid', NULL, 'Task', 'Fixture', 'en',
  'ACTIVE', 4, '${fixedTime}', '${fixedTime}'
);

INSERT INTO "TenantMembership" (
  "id", "tenantId", "userId", "status", "isDefault", "joinedAt", "version",
  "createdAt", "updatedAt"
) VALUES (
  '${membershipId}', '${reservedTenantId}', '${userId}', 'ACTIVE', true,
  '${fixedTime}', 6, '${fixedTime}', '${fixedTime}'
);

INSERT INTO "ExternalAuthIdentity" (
  "id", "userId", "provider", "subject", "email", "emailVerified", "createdAt", "updatedAt"
) VALUES (
  '${externalIdentityId}', '${userId}', 'GOOGLE', 'task-0029-google-subject',
  'task0029@example.invalid', true, '${fixedTime}', '${fixedTime}'
);
`;

const postMigrationAssertions = `
DO $$
DECLARE
  reserved_row "Tenant"%ROWTYPE;
BEGIN
  SELECT * INTO STRICT reserved_row FROM "Tenant" WHERE "id" = '${reservedTenantId}';

  IF reserved_row."name" <> 'All In Medico Personal Accounts' THEN
    RAISE EXCEPTION 'exact legacy reserved display name was not rebranded';
  END IF;
  IF reserved_row."slug" <> 'medsphere-personal-accounts' OR
     reserved_row."organizationType" <> 'NONE' OR reserved_row."version" <> 7 THEN
    RAISE EXCEPTION 'reserved tenant technical identity or authority data changed';
  END IF;

  IF (SELECT "name" FROM "Tenant" WHERE "id" = '${ordinaryExactNameTenantId}')
       <> 'MedSphere Personal Accounts' THEN
    RAISE EXCEPTION 'ordinary tenant with the same display name was modified';
  END IF;
  IF (SELECT "name" FROM "Tenant" WHERE "id" = '${similarlyNamedTenantId}')
       <> 'MedSphere Personal Accounts Clinic' THEN
    RAISE EXCEPTION 'similarly named ordinary tenant was modified';
  END IF;
  IF (SELECT "name" FROM "Tenant" WHERE "id" = '${customTenantId}')
       <> 'Northside Community Clinic' THEN
    RAISE EXCEPTION 'custom organization name was modified';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Tenant"
    WHERE "id" <> '${reservedTenantId}'
      AND "updatedAt" <> '${fixedTime}'::timestamp
  ) THEN
    RAISE EXCEPTION 'unrelated tenant data was modified';
  END IF;
  IF (SELECT count(*) FROM "Tenant") <> 4 OR
     (SELECT count(*) FROM "User") <> 1 OR
     (SELECT count(*) FROM "TenantMembership") <> 1 OR
     (SELECT count(*) FROM "ExternalAuthIdentity") <> 1 THEN
    RAISE EXCEPTION 'migration changed fixture row counts';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "TenantMembership" membership
    JOIN "User" account ON account."id" = membership."userId"
    JOIN "ExternalAuthIdentity" external_identity
      ON external_identity."userId" = account."id"
    WHERE membership."id" = '${membershipId}'
      AND membership."tenantId" = '${reservedTenantId}'
      AND membership."userId" = '${userId}'
      AND membership."status" = 'ACTIVE'
      AND membership."isDefault" = true
      AND membership."version" = 6
      AND account."version" = 4
      AND external_identity."id" = '${externalIdentityId}'
      AND external_identity."provider" = 'GOOGLE'
      AND external_identity."subject" = 'task-0029-google-subject'
  ) THEN
    RAISE EXCEPTION 'membership or authentication relationship changed';
  END IF;
END $$;
`;

const name = databaseName();
const scopedDatabaseUrl = databaseUrlForName(name);
const project = createMigrationProject();

try {
  executeSql(project.schemaFile, databaseUrl.toString(), `CREATE DATABASE "${name}";`);
  runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
  executeSql(project.schemaFile, scopedDatabaseUrl, seedSql);

  cpSync(join(sourceMigrations, targetMigration), join(project.migrationsRoot, targetMigration), {
    recursive: true,
  });
  runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
  executeSql(project.schemaFile, scopedDatabaseUrl, postMigrationAssertions);

  executeSql(
    project.schemaFile,
    scopedDatabaseUrl,
    `CREATE TABLE "_Task0029Snapshot" AS
       SELECT "updatedAt" AS "reservedUpdatedAt"
       FROM "Tenant" WHERE "id" = '${reservedTenantId}';`,
  );
  executeSql(project.schemaFile, scopedDatabaseUrl, readFileSync(targetMigrationSqlPath, 'utf8'));
  executeSql(
    project.schemaFile,
    scopedDatabaseUrl,
    `DO $$
     BEGIN
       IF (SELECT "updatedAt" FROM "Tenant" WHERE "id" = '${reservedTenantId}')
            <> (SELECT "reservedUpdatedAt" FROM "_Task0029Snapshot") THEN
         RAISE EXCEPTION 'migration is not deterministic when re-applied';
       END IF;
     END $$;
     DROP TABLE "_Task0029Snapshot";`,
  );

  runPrisma(['migrate', 'status', '--schema', project.schemaFile], scopedDatabaseUrl);
  process.stdout.write(
    'Task 0029 populated brand migration passed: exact rename, tenant isolation, identity preservation, and deterministic replay\n',
  );
} finally {
  try {
    executeSql(
      project.schemaFile,
      databaseUrl.toString(),
      `DROP DATABASE IF EXISTS "${name}" WITH (FORCE);`,
    );
  } finally {
    rmSync(project.projectRoot, { recursive: true, force: true });
  }
}
