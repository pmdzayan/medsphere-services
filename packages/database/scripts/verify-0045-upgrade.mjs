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
  throw new Error('DATABASE_URL is required for Task 0045 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const upgradeMigration =
  '20260924010000_task_0045_compliance_retention_legal_hold_policy';
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
  return `medsphere_0045_upgrade_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function databaseUrlForName(name) {
  const scoped = new URL(databaseUrl);
  scoped.pathname = `/${name}`;
  scoped.searchParams.set('schema', 'public');
  return scoped.toString();
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
  if (result.error) throw result.error;
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

function executeSqlExpectFailure(schemaFile, scopedDatabaseUrl, sql, expectedFragment) {
  const result = spawnSync(
    pnpmCommand,
    prismaProcessArgs(['db', 'execute', '--stdin', '--schema', schemaFile]),
    {
      cwd: packageRoot,
      encoding: 'utf8',
      shell: false,
      env: {
        ...process.env,
        DATABASE_URL: scopedDatabaseUrl,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      input: sql,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  const output = sanitize(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status === 0 || !output.includes(expectedFragment)) {
    throw new Error(
      `Expected SQL failure containing "${expectedFragment}" but received:\n${output.slice(-6000)}`,
    );
  }
}

function createMigrationProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-0045-upgrade-'));
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
  for (const migrationName of readdirSync(sourceMigrations, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    if (migrationName >= upgradeMigration) continue;
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }
  return { projectRoot, migrationsRoot, schemaFile };
}

function copyUpgrade(project) {
  cpSync(
    join(sourceMigrations, upgradeMigration),
    join(project.migrationsRoot, upgradeMigration),
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

const tenantId = '10000000-0000-4000-8000-000000004501';
const subjectUserId = '20000000-0000-4000-8000-000000004501';
const adminUserId = '20000000-0000-4000-8000-000000004502';
const membershipId = '30000000-0000-4000-8000-000000004501';
const privacyId = '40000000-0000-4000-8000-000000004501';
const consentId = '50000000-0000-4000-8000-000000004501';
const notificationId = '60000000-0000-4000-8000-000000004501';
const timelineId = '70000000-0000-4000-8000-000000004501';
const auditId = '80000000-0000-4000-8000-000000004501';
const policyId = '90000000-0000-4000-8000-000000004501';
const decisionId = 'a0000000-0000-4000-8000-000000004501';
const jobId = 'b0000000-0000-4000-8000-000000004501';

const baselineSeedSql = `
INSERT INTO "Tenant"
  ("id","name","slug","organizationType","isActive","selfRegistrationEnabled","version","createdAt","updatedAt")
VALUES
  ('${tenantId}','Task 0045 Upgrade Pharmacy','task-0045-upgrade','PHARMACY',true,false,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "User"
  ("id","email","passwordHash","firstName","lastName","preferredLanguage","status","version","createdAt","updatedAt")
VALUES
  ('${subjectUserId}','subject-0045-upgrade@medsphere.test','fixture-not-a-real-credential','Subject','0045','en','ACTIVE',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('${adminUserId}','admin-0045-upgrade@medsphere.test','fixture-not-a-real-credential','Admin','0045','en','ACTIVE',1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "TenantMembership"
  ("id","tenantId","userId","status","isDefault","joinedAt","version","createdAt","updatedAt")
VALUES
  ('${membershipId}','${tenantId}','${subjectUserId}','ACTIVE',true,CURRENT_TIMESTAMP,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "UserPrivacy"
  ("id","userId","sharePhone","shareEmail","allowInAppChat","privatePickup","hideSensitiveNotifications","preferredLanguage","wantsReservationNotifications","wantsOperationalAlerts","version","createdAt","updatedAt")
VALUES
  ('${privacyId}','${subjectUserId}',false,false,true,false,true,'en',true,true,4,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT INTO "ConsentRecord"
  ("id","userId","category","status","version","source","createdAt")
VALUES
  ('${consentId}','${subjectUserId}','NOTIFICATIONS_RESERVATIONS','GRANTED',1,'settings_privacy_page',CURRENT_TIMESTAMP);

INSERT INTO "PatientNotification"
  ("id","recipientUserId","category","title","message","destinationType","createdAt")
VALUES
  ('${notificationId}','${subjectUserId}','SYSTEM','Preserved notification','Preserved sensitive content','NONE',CURRENT_TIMESTAMP - INTERVAL '60 days');

INSERT INTO "PatientTimelineEvent"
  ("id","recipientUserId","sourceType","sourceEventId","eventType","title","summary","destinationType","occurredAt","createdAt")
VALUES
  ('${timelineId}','${subjectUserId}','task-0045-upgrade','preserved-event','RESERVATION_STATUS_CHANGED','Preserved activity','Preserved summary','NONE',CURRENT_TIMESTAMP - INTERVAL '60 days',CURRENT_TIMESTAMP - INTERVAL '60 days');

INSERT INTO "AuditEvent"
  ("id","scope","actorType","outcome","tenantId","actorMembershipId","actorUserId","eventType","metadata","occurredAt")
VALUES
  ('${auditId}','TENANT','TENANT_USER','SUCCEEDED','${tenantId}','${membershipId}','${subjectUserId}','privacy.consent.granted','{"category":"NOTIFICATIONS_RESERVATIONS"}'::jsonb,CURRENT_TIMESTAMP);
`;

const afterUpgradeAssertions = `
DO $task0045$
BEGIN
  IF (SELECT count(*) FROM "UserPrivacy" WHERE "id" = '${privacyId}' AND "version" = 4) <> 1 THEN
    RAISE EXCEPTION 'Task 0045 upgrade mutated existing privacy preferences';
  END IF;

  IF (SELECT count(*) FROM "ConsentRecord" WHERE "id" = '${consentId}' AND "status" = 'GRANTED') <> 1 THEN
    RAISE EXCEPTION 'Task 0045 upgrade mutated append-only consent evidence';
  END IF;

  IF (SELECT count(*) FROM "AuditEvent" WHERE "id" = '${auditId}' AND "eventType" = 'privacy.consent.granted') <> 1 THEN
    RAISE EXCEPTION 'Task 0045 upgrade mutated accepted audit evidence';
  END IF;

  IF (SELECT count(*) FROM "PatientNotification"
      WHERE "id" = '${notificationId}' AND "privacyDispositionAt" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0045 upgrade mutated existing patient notification data';
  END IF;

  IF (SELECT count(*) FROM "PatientTimelineEvent"
      WHERE "id" = '${timelineId}' AND "privacyDispositionAt" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0045 upgrade mutated existing patient timeline data';
  END IF;

  IF (SELECT count(*) FROM "CompliancePolicy") <> 0
     OR (SELECT count(*) FROM "ComplianceLegalHold") <> 0
     OR (SELECT count(*) FROM "CompliancePolicyDecisionRecord") <> 0
     OR (SELECT count(*) FROM "ComplianceDispositionJob") <> 0 THEN
    RAISE EXCEPTION 'Task 0045 upgrade fabricated compliance history';
  END IF;

  IF (SELECT count(*) FROM "Permission"
      WHERE "name" IN ('platform.compliance.read','platform.compliance.manage')) <> 2 THEN
    RAISE EXCEPTION 'Task 0045 compliance permission catalogue is incomplete';
  END IF;

  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name" = '${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0045 migration is not recorded exactly once';
  END IF;
END;
$task0045$;

INSERT INTO "CompliancePolicy"
  ("id","tenantId","dataClass","allowedPurposes","retentionDays","expiryDisposition","subjectRequestDisposition","policyReference","version","effectiveAt","createdByPlatformUserId","createdAt")
VALUES
  ('${policyId}',NULL,'PATIENT_NOTIFICATION',ARRAY['LEGAL_COMPLIANCE']::"CompliancePurpose"[],30,'DELETE','ANONYMIZE','task-0045-upgrade-policy',1,CURRENT_TIMESTAMP,'${adminUserId}',CURRENT_TIMESTAMP);

INSERT INTO "CompliancePolicyDecisionRecord"
  ("id","tenantId","subjectUserId","subjectMembershipId","dataClass","purpose","context","requestedDisposition","effectiveDisposition","decision","policyId","evaluatedAt")
VALUES
  ('${decisionId}','${tenantId}','${subjectUserId}','${membershipId}','PATIENT_NOTIFICATION','LEGAL_COMPLIANCE','SUBJECT_REQUEST','ANONYMIZE','ANONYMIZE','ALLOW','${policyId}',CURRENT_TIMESTAMP);

INSERT INTO "ComplianceDispositionJob"
  ("id","tenantId","subjectUserId","subjectMembershipId","dataClass","purpose","source","requestedDisposition","effectiveDisposition","decision","status","policyId","decisionRecordId","idempotencyKey","commandHash","affectedRowCount","occurredAt")
VALUES
  ('${jobId}','${tenantId}','${subjectUserId}','${membershipId}','PATIENT_NOTIFICATION','LEGAL_COMPLIANCE','SUBJECT_REQUEST','ANONYMIZE','ANONYMIZE','ALLOW','COMPLETED','${policyId}','${decisionId}','task-0045-upgrade-job',repeat('a',64),1,CURRENT_TIMESTAMP);

INSERT INTO "AuditEvent"
  ("id","scope","actorType","outcome","tenantId","eventType","resourceType","resourceId","metadata","occurredAt")
VALUES
  (gen_random_uuid(),'TENANT','SYSTEM','SUCCEEDED','${tenantId}','compliance.disposition.processed','ComplianceDispositionJob','${jobId}',
   '{"dataClass":"PATIENT_NOTIFICATION","source":"SUBJECT_REQUEST","decision":"ALLOW","effectiveDisposition":"ANONYMIZE","status":"COMPLETED","affectedRowCount":1}'::jsonb,CURRENT_TIMESTAMP);
`;

function verifyPopulatedUpgrade() {
  const name = databaseName();
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    createDatabase(project.schemaFile, name);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, baselineSeedSql);

    copyUpgrade(project);
    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, afterUpgradeAssertions);

    executeSqlExpectFailure(
      project.schemaFile,
      scopedDatabaseUrl,
      `DELETE FROM "ComplianceDispositionJob" WHERE "id" = '${jobId}';`,
      'ComplianceDispositionJob is append-only',
    );

    executeSqlExpectFailure(
      project.schemaFile,
      scopedDatabaseUrl,
      `INSERT INTO "CompliancePolicy"
        ("id","tenantId","dataClass","allowedPurposes","expiryDisposition","subjectRequestDisposition","policyReference","version","effectiveAt","createdByPlatformUserId","createdAt")
       VALUES
        (gen_random_uuid(),'${tenantId}','PATIENT_NOTIFICATION',ARRAY['LEGAL_COMPLIANCE']::"CompliancePurpose"[],'RETAIN','RETAIN','invalid-tenant-global-policy',1,CURRENT_TIMESTAMP,'${adminUserId}',CURRENT_TIMESTAMP);`,
      'Global-user compliance data classes require the platform baseline policy',
    );

    runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl);
    executeSql(
      project.schemaFile,
      scopedDatabaseUrl,
      `
DO $task0045$
BEGIN
  IF (SELECT count(*) FROM "_prisma_migrations"
      WHERE "migration_name" = '${upgradeMigration}'
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Task 0045 repeated deploy changed migration history';
  END IF;
  IF (SELECT count(*) FROM "UserPrivacy" WHERE "id" = '${privacyId}') <> 1
     OR (SELECT count(*) FROM "ConsentRecord" WHERE "id" = '${consentId}') <> 1
     OR (SELECT count(*) FROM "PatientNotification" WHERE "id" = '${notificationId}') <> 1
     OR (SELECT count(*) FROM "PatientTimelineEvent" WHERE "id" = '${timelineId}') <> 1 THEN
    RAISE EXCEPTION 'Task 0045 repeated deploy changed accepted data';
  END IF;
END;
$task0045$;
`,
    );

    process.stdout.write('Task 0045 populated upgrade verification passed.\n');
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}

verifyPopulatedUpgrade();
