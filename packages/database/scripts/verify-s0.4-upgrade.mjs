import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const databaseUrlValue = process.env.DATABASE_URL;

if (!databaseUrlValue) {
  throw new Error('DATABASE_URL is required for S0.4 upgrade verification');
}

const databaseUrl = new URL(databaseUrlValue);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceMigrations = join(packageRoot, 'prisma', 'migrations');
const baselineMigrations = [
  '20260715163416_init_auth_schema',
  '20260720020000_complete_reproducible_baseline',
  '20260720120000_trusted_authentication_tenant_context',
];
const s04Migration = '20260725120000_tenant_safe_authorization_durable_audit';
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

for (const migrationName of [...baselineMigrations, s04Migration]) {
  if (!existsSync(join(sourceMigrations, migrationName, 'migration.sql'))) {
    throw new Error(`Required migration is missing: ${migrationName}`);
  }
}

function databaseName(label) {
  return `medsphere_s04_${label}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
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

  if (options.expectedFailure) {
    if (result.status === 0) {
      throw new Error(`Expected migration failure: ${options.expectedFailure}`);
    }

    if (!output.includes(options.expectedFailure)) {
      throw new Error(
        `Migration failed for the wrong reason. Expected: ${options.expectedFailure}\n${output.slice(-4000)}`,
      );
    }

    return;
  }

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
  const projectRoot = mkdtempSync(join(tmpdir(), 'medsphere-s04-upgrade-'));
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

  for (const migrationName of baselineMigrations) {
    cpSync(join(sourceMigrations, migrationName), join(migrationsRoot, migrationName), {
      recursive: true,
    });
  }

  return { migrationsRoot, projectRoot, schemaFile };
}

function installS04Migration(project) {
  cpSync(join(sourceMigrations, s04Migration), join(project.migrationsRoot, s04Migration), {
    recursive: true,
  });
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

function deployS04(project, scopedDatabaseUrl, expectedFailure) {
  installS04Migration(project);
  runPrisma(['migrate', 'deploy', '--schema', project.schemaFile], scopedDatabaseUrl, {
    expectedFailure,
  });
}

function verifyScenario({ label, seedSql, assertionSql, expectedFailure }) {
  const name = databaseName(label);
  const scopedDatabaseUrl = databaseUrlForName(name);
  const project = createMigrationProject();

  try {
    createDatabase(project.schemaFile, name);
    deployBaseline(project, scopedDatabaseUrl);
    executeSql(project.schemaFile, scopedDatabaseUrl, seedSql);
    deployS04(project, scopedDatabaseUrl, expectedFailure);

    if (assertionSql) {
      executeSql(project.schemaFile, scopedDatabaseUrl, assertionSql);
    }

    process.stdout.write(`S0.4 upgrade scenario passed: ${label}\n`);
  } finally {
    try {
      dropDatabase(project.schemaFile, name);
    } finally {
      rmSync(project.projectRoot, { recursive: true, force: true });
    }
  }
}

const tenantOne = '10000000-0000-4000-8000-000000000001';
const tenantTwo = '10000000-0000-4000-8000-000000000002';
const userOne = '20000000-0000-4000-8000-000000000001';
const membershipOne = '30000000-0000-4000-8000-000000000001';
const roleOne = '40000000-0000-4000-8000-000000000001';
const permissionOne = '50000000-0000-4000-8000-000000000001';
const rolePermissionOne = '60000000-0000-4000-8000-000000000001';
const userRoleOne = '70000000-0000-4000-8000-000000000001';
const auditOne = '80000000-0000-4000-8000-000000000001';

const tenantOneInsert = `
INSERT INTO "Tenant" (
  "id", "name", "slug", "email", "isActive", "version", "createdAt", "updatedAt"
) VALUES (
  '${tenantOne}', 'Fixture tenant one', 'fixture-tenant-one', NULL, true, 1,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
`;

const tenantTwoInsert = `
INSERT INTO "Tenant" (
  "id", "name", "slug", "email", "isActive", "version", "createdAt", "updatedAt"
) VALUES (
  '${tenantTwo}', 'Fixture tenant two', 'fixture-tenant-two', NULL, true, 1,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
`;

const userOneInsert = `
INSERT INTO "User" (
  "id", "email", "passwordHash", "firstName", "lastName", "status", "version",
  "createdAt", "updatedAt", "preferredLanguage"
) VALUES (
  '${userOne}', 'fixture@example.invalid', 'fixture-not-a-real-credential',
  'Fixture', 'User', 'ACTIVE', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'en'
);
`;

verifyScenario({
  label: 'valid',
  seedSql: `
${tenantOneInsert}
${userOneInsert}
INSERT INTO "TenantMembership" (
  "id", "tenantId", "userId", "status", "isDefault", "joinedAt", "version",
  "createdAt", "updatedAt"
) VALUES (
  '${membershipOne}', '${tenantOne}', '${userOne}', 'ACTIVE', true,
  CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Role" (
  "id", "tenantId", "name", "description", "type", "version", "createdAt", "updatedAt"
) VALUES (
  '${roleOne}', '${tenantOne}', 'INVENTORY_READER', 'Legacy fixture role',
  'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Permission" (
  "id", "tenantId", "name", "description", "version", "createdAt", "updatedAt"
) VALUES (
  '${permissionOne}', '${tenantOne}', 'authorization.roles.read',
  'Legacy accepted permission', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "RolePermission" (
  "id", "roleId", "permissionId", "createdAt"
) VALUES (
  '${rolePermissionOne}', '${roleOne}', '${permissionOne}', CURRENT_TIMESTAMP
);
INSERT INTO "UserRole" ("id", "userId", "roleId", "createdAt")
VALUES ('${userRoleOne}', '${userOne}', '${roleOne}', CURRENT_TIMESTAMP);
`,
  assertionSql: `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "MembershipRole"
    WHERE "id" = '${userRoleOne}'
      AND "tenantId" = '${tenantOne}'
      AND "membershipId" = '${membershipOne}'
      AND "roleId" = '${roleOne}'
  ) THEN
    RAISE EXCEPTION 'Valid legacy assignment was not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "RolePermission" rp
    JOIN "Permission" p ON p."id" = rp."permissionId"
    WHERE rp."id" = '${rolePermissionOne}'
      AND rp."tenantId" = '${tenantOne}'
      AND rp."roleId" = '${roleOne}'
      AND p."name" = 'authorization.roles.read'
  ) THEN
    RAISE EXCEPTION 'Valid legacy role permission was not preserved';
  END IF;

  IF (SELECT count(*) FROM "Permission") <> 8 THEN
    RAISE EXCEPTION 'Permission catalogue does not contain exactly eight rows';
  END IF;

  IF (
    SELECT count(*)
    FROM "Role"
    WHERE "tenantId" = '${tenantOne}'
      AND "name" = 'TENANT_ADMINISTRATOR'
      AND "type" = 'SYSTEM'
      AND "deletedAt" IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'Tenant administrator role was not created exactly once';
  END IF;

  IF (
    SELECT count(*)
    FROM "RolePermission" rp
    JOIN "Role" r ON r."id" = rp."roleId"
    WHERE r."tenantId" = '${tenantOne}'
      AND r."name" = 'TENANT_ADMINISTRATOR'
      AND r."type" = 'SYSTEM'
  ) <> 8 THEN
    RAISE EXCEPTION 'Tenant administrator permissions are incomplete';
  END IF;
END $$;
`,
});

verifyScenario({
  label: 'legacy_audit',
  seedSql: `
INSERT INTO "AuditLog" (
  "id", "organizationId", "userId", "module", "action", "resourceType",
  "resourceId", "oldValue", "newValue", "createdAt"
) VALUES (
  '${auditOne}', '${tenantOne}', '${userOne}', 'fixture', 'ACCESS', 'fixture',
  'fixture', NULL, NULL, CURRENT_TIMESTAMP
);
`,
  expectedFailure: 'S0.4 migration blocked: mutable legacy audit rows require explicit remediation',
});

verifyScenario({
  label: 'unknown_permission',
  seedSql: `
${tenantOneInsert}
INSERT INTO "Permission" (
  "id", "tenantId", "name", "description", "version", "createdAt", "updatedAt"
) VALUES (
  '${permissionOne}', '${tenantOne}', 'unsupported.permission',
  'Unsupported fixture permission', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
`,
  expectedFailure:
    'S0.4 migration blocked: unsupported or deleted legacy permissions require explicit remediation',
});

verifyScenario({
  label: 'invalid_builtin_role',
  seedSql: `
${tenantOneInsert}
INSERT INTO "Role" (
  "id", "tenantId", "name", "description", "type", "version", "createdAt", "updatedAt"
) VALUES (
  '${roleOne}', '${tenantOne}', 'SUPER_ADMIN', 'Invalid fixture built-in role',
  'SYSTEM', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
`,
  expectedFailure:
    'S0.4 migration blocked: invalid built-in legacy roles require explicit remediation',
});

verifyScenario({
  label: 'cross_tenant_role_permission',
  seedSql: `
${tenantOneInsert}
${tenantTwoInsert}
INSERT INTO "Role" (
  "id", "tenantId", "name", "description", "type", "version", "createdAt", "updatedAt"
) VALUES (
  '${roleOne}', '${tenantOne}', 'INVENTORY_READER', 'Fixture role',
  'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Permission" (
  "id", "tenantId", "name", "description", "version", "createdAt", "updatedAt"
) VALUES (
  '${permissionOne}', '${tenantTwo}', 'authorization.roles.read',
  'Cross-tenant fixture permission', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "RolePermission" (
  "id", "roleId", "permissionId", "createdAt"
) VALUES (
  '${rolePermissionOne}', '${roleOne}', '${permissionOne}', CURRENT_TIMESTAMP
);
`,
  expectedFailure:
    'S0.4 migration blocked: invalid legacy role-permission mappings require explicit remediation',
});

verifyScenario({
  label: 'invalid_assignment',
  seedSql: `
${tenantOneInsert}
${tenantTwoInsert}
${userOneInsert}
INSERT INTO "TenantMembership" (
  "id", "tenantId", "userId", "status", "isDefault", "joinedAt", "version",
  "createdAt", "updatedAt"
) VALUES (
  '${membershipOne}', '${tenantTwo}', '${userOne}', 'ACTIVE', true,
  CURRENT_TIMESTAMP, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "Role" (
  "id", "tenantId", "name", "description", "type", "version", "createdAt", "updatedAt"
) VALUES (
  '${roleOne}', '${tenantOne}', 'INVENTORY_READER', 'Fixture role',
  'TENANT', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);
INSERT INTO "UserRole" ("id", "userId", "roleId", "createdAt")
VALUES ('${userRoleOne}', '${userOne}', '${roleOne}', CURRENT_TIMESTAMP);
`,
  expectedFailure:
    'S0.4 migration blocked: invalid legacy role assignments require explicit remediation',
});

process.stdout.write('S0.4 populated upgrade verification passed.\n');
