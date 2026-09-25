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
  throw new Error('DATABASE_URL is required for Task 0051 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration = '20260925150000_task_0051_provider_domain_expansion_foundation';
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
  return `medsphere_0051_upgrade_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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
  const root = mkdtempSync(join(tmpdir(), 'medsphere-0051-upgrade-'));
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

const tenantId = randomUUID();
const userId = randomUUID();
const membershipId = randomUUID();
const assignedProviderId = randomUUID();
const otherProviderId = randomUUID();
const accessId = randomUUID();
const departmentId = randomUUID();
const locationScopeId = randomUUID();
const departmentScopeId = randomUUID();
const crossScopeId = randomUUID();
const clinicProviderId = randomUUID();
const doctorProviderId = randomUUID();
const professionalProfileId = randomUUID();

const seed = `
INSERT INTO "Tenant"
  ("id","name","slug","organizationType","isActive","selfRegistrationEnabled","version","createdAt","updatedAt")
VALUES
  ('${tenantId}','Task 0051 Hospital','task-0051-hospital','HOSPITAL',true,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "User"
  ("id","email","firstName","lastName","preferredLanguage","status","identityVerificationStatus","ageVerificationStatus","version","createdAt","updatedAt")
VALUES
  ('${userId}','task0051@example.invalid','Task','Professional','en','ACTIVE','PENDING','PENDING',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "TenantMembership"
  ("id","tenantId","userId","status","isDefault","joinedAt","version","createdAt","updatedAt")
VALUES
  ('${membershipId}','${tenantId}','${userId}','ACTIVE',true,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "Provider"
  ("id","tenantId","providerType","businessName","ownerName","email","phone","address","city","state","country","postalCode","latitude","longitude","isVerified","isActive","version","createdAt","updatedAt")
VALUES
  ('${assignedProviderId}','${tenantId}','HOSPITAL','Task 0051 Assigned Hospital','Owner','assigned@example.invalid','1000000000','1 Hospital Road','City','State','Country','600001',12.9,80.2,false,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('${otherProviderId}','${tenantId}','HOSPITAL','Task 0051 Other Hospital','Owner','other@example.invalid','1000000001','2 Hospital Road','City','State','Country','600002',12.8,80.1,false,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "MembershipProviderAccess"
  ("id","tenantId","membershipId","providerId","createdAt")
VALUES
  ('${accessId}','${tenantId}','${membershipId}','${assignedProviderId}',CURRENT_TIMESTAMP);
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
DO $task0051$
DECLARE
  provider_count integer;
  primary_location_count integer;
  enum_count integer;
BEGIN
  SELECT count(*) INTO provider_count FROM "Provider"
  WHERE "id" IN ('${assignedProviderId}','${otherProviderId}');
  IF provider_count <> 2 THEN
    RAISE EXCEPTION 'Task 0051 upgrade did not preserve existing providers';
  END IF;

  SELECT count(*) INTO primary_location_count
  FROM "ProviderLocation"
  WHERE "providerId" IN ('${assignedProviderId}','${otherProviderId}')
    AND "isPrimary" = true
    AND "code" = 'PRIMARY';
  IF primary_location_count <> 2 THEN
    RAISE EXCEPTION 'Task 0051 did not backfill exactly one primary location per existing provider';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ProviderLocation"
    WHERE "id"='${assignedProviderId}'
      AND "providerId"='${assignedProviderId}'
      AND "tenantId"='${tenantId}'
      AND "address"='1 Hospital Road'
  ) THEN
    RAISE EXCEPTION 'Task 0051 primary-location backfill did not preserve provider address identity';
  END IF;

  SELECT count(*) INTO enum_count
  FROM pg_enum e
  JOIN pg_type t ON t.oid=e.enumtypid
  WHERE t.typname='ProviderType'
    AND e.enumlabel IN ('CLINIC','LABORATORY','DOCTOR');
  IF enum_count <> 3 THEN
    RAISE EXCEPTION 'Task 0051 provider enum expansion is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "MembershipProviderAccess"
    WHERE "tenantId"='${tenantId}'
      AND "membershipId"='${membershipId}'
      AND "providerId"='${assignedProviderId}'
  ) THEN
    RAISE EXCEPTION 'Task 0051 upgrade changed accepted provider authority';
  END IF;

  INSERT INTO "ProviderDepartment"
    ("id","tenantId","providerId","locationId","code","name","isActive","version","createdAt","updatedAt")
  VALUES
    ('${departmentId}','${tenantId}','${assignedProviderId}','${assignedProviderId}','GENERAL','General',true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO "MembershipProviderLocationAccess"
    ("id","tenantId","membershipId","providerId","locationId","createdAt")
  VALUES
    ('${locationScopeId}','${tenantId}','${membershipId}','${assignedProviderId}','${assignedProviderId}',CURRENT_TIMESTAMP);

  INSERT INTO "MembershipProviderDepartmentAccess"
    ("id","tenantId","membershipId","providerId","departmentId","createdAt")
  VALUES
    ('${departmentScopeId}','${tenantId}','${membershipId}','${assignedProviderId}','${departmentId}',CURRENT_TIMESTAMP);

  BEGIN
    INSERT INTO "MembershipProviderLocationAccess"
      ("id","tenantId","membershipId","providerId","locationId","createdAt")
    VALUES
      ('${crossScopeId}','${tenantId}','${membershipId}','${otherProviderId}','${otherProviderId}',CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Task 0051 allowed subordinate scope without coarse provider authority';
  EXCEPTION
    WHEN foreign_key_violation THEN
      NULL;
  END;

  INSERT INTO "Provider"
    ("id","tenantId","providerType","businessName","ownerName","email","phone","address","city","state","country","postalCode","latitude","longitude","isVerified","isActive","version","createdAt","updatedAt")
  VALUES
    ('${clinicProviderId}','${tenantId}','CLINIC','Task 0051 Clinic','Owner','clinic@example.invalid','1000000002','3 Clinic Road','City','State','Country','600003',12.7,80.0,false,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('${doctorProviderId}','${tenantId}','DOCTOR','Task Doctor','Task Doctor','doctor@example.invalid','1000000003','4 Clinic Road','City','State','Country','600004',12.7,80.0,false,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO "ProviderProfessionalProfile"
    ("id","tenantId","providerId","userId","registrationNumber","registrationAuthority","version","createdAt","updatedAt")
  VALUES
    ('${professionalProfileId}','${tenantId}','${doctorProviderId}','${userId}','REG-0051','Task Medical Council',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  IF (SELECT is_nullable
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='ProviderVerification'
        AND column_name='businessRegistrationNumber') <> 'YES' THEN
    RAISE EXCEPTION 'Task 0051 professional verification field compatibility was not applied';
  END IF;

  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name"='${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0051 migration is not recorded exactly once';
  END IF;
END;
$task0051$;
`,
    );

    runPrisma(['migrate', 'deploy', '--schema', project.schema], url);
    sql(
      project.schema,
      url,
      `
DO $task0051$
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name"='${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0051 repeated deploy changed migration history';
  END IF;
  IF (SELECT count(*) FROM "ProviderLocation"
      WHERE "providerId" IN ('${assignedProviderId}','${otherProviderId}')
        AND "isPrimary" = true) <> 2 THEN
    RAISE EXCEPTION 'Task 0051 repeated deploy duplicated primary locations';
  END IF;
END;
$task0051$;
`,
    );

    process.stdout.write('Task 0051 populated upgrade verification passed.\n');
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
