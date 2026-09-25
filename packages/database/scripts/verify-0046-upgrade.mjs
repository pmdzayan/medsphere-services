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
  throw new Error('DATABASE_URL is required for Task 0046 upgrade verification');

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration = '20260924130000_task_0046_notification_operations_pickup_handoff';
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
  return `medsphere_0046_upgrade_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

function sqlMustFail(schemaFile, url, statement, expected) {
  const result = spawnSync(
    pnpmCommand,
    prismaProcessArgs(['db', 'execute', '--stdin', '--schema', schemaFile]),
    {
      cwd: packageRoot,
      encoding: 'utf8',
      shell: false,
      env: { ...process.env, DATABASE_URL: url, FORCE_COLOR: '0', NO_COLOR: '1' },
      input: statement,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (result.status === 0 || !output.includes(expected)) {
    throw new Error(
      `Expected SQL failure containing "${expected}" but received:\n${output.slice(-5000)}`,
    );
  }
}

function migrationProject() {
  const root = mkdtempSync(join(tmpdir(), 'medsphere-0046-upgrade-'));
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

const tenantId = '10000000-0000-4000-8000-000000004601';
const userId = '20000000-0000-4000-8000-000000004601';
const providerId = '30000000-0000-4000-8000-000000004601';
const reservationId = '40000000-0000-4000-8000-000000004601';
const tokenId = '50000000-0000-4000-8000-000000004601';

const seed = `
INSERT INTO "Tenant"
  ("id","name","slug","organizationType","isActive","selfRegistrationEnabled","version","createdAt","updatedAt")
VALUES
  ('${tenantId}','Task 0046 Upgrade Pharmacy','task-0046-upgrade','PHARMACY',true,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "User"
  ("id","email","passwordHash","firstName","lastName","preferredLanguage","status","version","createdAt","updatedAt")
VALUES
  ('${userId}','subject-0046-upgrade@medsphere.test','fixture-not-a-real-credential','Subject','0046','en','ACTIVE',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "Provider"
  ("id","tenantId","providerType","businessName","ownerName","email","phone","address","city","state","country","postalCode","latitude","longitude","isVerified","isActive","version","createdAt","updatedAt")
VALUES
  ('${providerId}','${tenantId}','PHARMACY','Task 0046 Pharmacy','Fixture Owner','provider-0046@medsphere.test','0000000046','46 Test Street','Chennai','Tamil Nadu','India','600001',13.0827,80.2707,true,true,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "MedicineReservation"
  ("id","tenantId","providerId","subjectUserId","status","expiresAt","confirmedAt","readyAt","idempotencyKey","creationHash","version","createdAt","updatedAt")
VALUES
  ('${reservationId}','${tenantId}','${providerId}','${userId}','READY',CURRENT_TIMESTAMP + INTERVAL '1 day',CURRENT_TIMESTAMP - INTERVAL '2 minutes',CURRENT_TIMESTAMP - INTERVAL '1 minute','task-0046-upgrade-reservation',repeat('a',64),7,CURRENT_TIMESTAMP - INTERVAL '3 minutes',CURRENT_TIMESTAMP);
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
DO $task0046$
BEGIN
  IF (SELECT count(*) FROM "MedicineReservation"
      WHERE "id"='${reservationId}' AND "status"='READY' AND "version"=7) <> 1 THEN
    RAISE EXCEPTION 'Task 0046 upgrade mutated existing reservation state';
  END IF;
  IF (SELECT count(*) FROM "MedicinePickupToken") <> 0
     OR (SELECT count(*) FROM "MedicinePickupHandoff") <> 0 THEN
    RAISE EXCEPTION 'Task 0046 upgrade fabricated pickup evidence';
  END IF;
  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name"='${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0046 migration is not recorded exactly once';
  END IF;
END;
$task0046$;

INSERT INTO "MedicinePickupToken"
  ("id","tenantId","providerId","reservationId","subjectUserId","tokenHash","tokenVersion","issuedAt","expiresAt","updatedAt")
VALUES
  ('${tokenId}','${tenantId}','${providerId}','${reservationId}','${userId}',repeat('b',64),1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '10 minutes',CURRENT_TIMESTAMP);
`,
    );

    sqlMustFail(
      project.schema,
      url,
      `DELETE FROM "MedicinePickupToken" WHERE "id"='${tokenId}';`,
      'MedicinePickupToken rows are not deletable',
    );

    runPrisma(['migrate', 'deploy', '--schema', project.schema], url);
    sql(
      project.schema,
      url,
      `
DO $task0046$
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name"='${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0046 repeated deploy changed migration history';
  END IF;
  IF (SELECT count(*) FROM "MedicineReservation" WHERE "id"='${reservationId}') <> 1 THEN
    RAISE EXCEPTION 'Task 0046 repeated deploy changed existing reservation';
  END IF;
END;
$task0046$;
`,
    );

    process.stdout.write('Task 0046 populated upgrade verification passed.\n');
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
