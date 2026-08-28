#!/usr/bin/env node
// Batch 2 Task 5 -- live smoke test.
//
// This is CI validation infrastructure only, not a product feature. It
// exercises the accepted V1 stack over real HTTP against a genuinely
// running backend + frontend + PostgreSQL + Redis, using only synthetic
// data created for this run.
//
// Corrections applied per CTO audit:
// 1. Direct SQL is isolated to bootstrapUncreatableFoundationState() and
//    contains only rows no accepted API can create. Everything else
//    (provider-access grant, inventory listing, batch receipt) now goes
//    through the real accepted HTTP APIs.
// 2. The administrator permission grant is no longer "all permissions for
//    testing convenience" -- it is the exact rule the accepted migrations
//    themselves apply (cited inline at the point of use).
// 3. Every HTTP check validates response/state semantics, not just status
//    codes.
// 4. required/informational is real: every accepted V1 workflow is
//    required: true. Exactly one predeclared, documented gap is allowed
//    to be a non-blocking PARTIAL. Any other PARTIAL, any BROKEN, and any
//    NOT_TESTABLE on a required check fails the run.
// 5. Notification: DB/connectivity failure is BROKEN, never PARTIAL.
//    "Working" here means proven fail-closed with no provider configured,
//    not a successful send.
// 6. The results matrix always prints, and the original failure always
//    determines the exit code, even on an unexpected exception.
// 7. Backend/frontend PIDs are tracked and liveness is checked before each
//    major check group; a dead process fails the run and stops further
//    dependent checks without losing already-recorded results.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const BACKEND = process.env.SMOKE_BACKEND_URL ?? 'http://localhost:3000';
const FRONTEND = process.env.SMOKE_FRONTEND_URL ?? 'http://localhost:3001';
const DATABASE_URL = process.env.DATABASE_URL;
const ORG_JOIN_CODE_PEPPER = process.env.ORG_JOIN_CODE_PEPPER;
const BACKEND_PID_FILE = process.env.SMOKE_BACKEND_PID_FILE ?? '/tmp/backend.pid';
const FRONTEND_PID_FILE = process.env.SMOKE_FRONTEND_PID_FILE ?? '/tmp/frontend.pid';
const BACKEND_LOG_FILE = process.env.SMOKE_BACKEND_LOG_FILE ?? '/tmp/backend.log';
const FRONTEND_LOG_FILE = process.env.SMOKE_FRONTEND_LOG_FILE ?? '/tmp/frontend.log';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required to seed synthetic smoke-test data.');
  process.exit(1);
}

if (!ORG_JOIN_CODE_PEPPER) {
  console.error('ORG_JOIN_CODE_PEPPER is required to seed synthetic organization join codes.');
  process.exit(1);
}

const orgJoinCodePepper = Buffer.from(ORG_JOIN_CODE_PEPPER, 'base64');
if (orgJoinCodePepper.length < 32) {
  console.error('ORG_JOIN_CODE_PEPPER must decode to at least 32 bytes.');
  process.exit(1);
}

const results = [];
function record(
  name,
  status,
  detail,
  { required = true, allowedPartial = false, phase = 'general' } = {},
) {
  results.push({ name, status, detail, required, allowedPartial, phase });
  const marker =
    status === 'WORKING'
      ? 'ok  '
      : status === 'PARTIAL'
        ? 'part'
        : status === 'BROKEN'
          ? 'FAIL'
          : 'skip';
  console.log(`[${marker}] ${name}: ${status}${detail ? ` -- ${detail}` : ''}`);
  return status;
}

function fails(entry) {
  if (!entry.required) return false;
  if (entry.status === 'BROKEN') return true;
  if (entry.status === 'NOT_TESTABLE') return true;
  if (entry.status === 'PARTIAL' && !entry.allowedPartial) return true;
  return false;
}

class ProcessDiedError extends Error {}

function readPid(path) {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8').trim();
  const pid = Number(raw);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function pidAlive(pid) {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tailFile(path, lines = 40) {
  if (!existsSync(path)) return '(log file not found)';
  const content = readFileSync(path, 'utf8');
  return content.split('\n').slice(-lines).join('\n');
}

function assertProcessesAlive(groupLabel) {
  const backendPid = readPid(BACKEND_PID_FILE);
  const frontendPid = readPid(FRONTEND_PID_FILE);
  const backendAlive = pidAlive(backendPid);
  const frontendAlive = pidAlive(frontendPid);
  if (backendAlive && frontendAlive) return;

  const dead = [];
  if (!backendAlive) dead.push('backend');
  if (!frontendAlive) dead.push('frontend');
  console.error(`\n${dead.join(' and ')} process no longer running before "${groupLabel}".`);
  if (!backendAlive) {
    console.error(`--- backend log tail (${BACKEND_LOG_FILE}) ---`);
    console.error(tailFile(BACKEND_LOG_FILE));
  }
  if (!frontendAlive) {
    console.error(`--- frontend log tail (${FRONTEND_LOG_FILE}) ---`);
    console.error(tailFile(FRONTEND_LOG_FILE));
  }
  record(`process supervision before "${groupLabel}"`, 'BROKEN', `${dead.join(', ')} not running`);
  throw new ProcessDiedError(`${dead.join(', ')} died before ${groupLabel}`);
}

// psql (unlike Prisma's own client) does not understand the `schema`
// query parameter Prisma's DATABASE_URL convention adds
// (postgresql://...?schema=public) -- it is a Prisma-specific
// extension, not a standard libpq connection parameter, and psql
// rejects it outright ("invalid URI query parameter: schema"). Remove
// only that specific parameter; any other legitimate libpq/PostgreSQL
// query option present on DATABASE_URL (sslmode, connect_timeout,
// etc.) is left intact and still reaches psql.
const PSQL_URL = (() => {
  const url = new URL(DATABASE_URL);
  url.searchParams.delete('schema');
  return url.toString();
})();

function sql(query) {
  // -q ("run quietly -- no messages, only query output") suppresses
  // psql's command-completion tags (e.g. "UPDATE 1", "INSERT 0 1") that
  // otherwise print on their own line after any data-modifying
  // statement, even in -t -A mode -- confirmed directly: without -q, an
  // `UPDATE ... RETURNING id` returns "<uuid>\nUPDATE 1", corrupting any
  // caller that expects the returned value alone (bootstrapMembershipActivation's
  // adminMembershipId, in particular, would otherwise embed literal
  // "UPDATE 1" text into a later INSERT). -q does not suppress genuine
  // errors or actual query result rows -- confirmed directly with a
  // real division-by-zero query, which still surfaced with a non-zero
  // exit and psql's ERROR text on stderr.
  return execFileSync('psql', [PSQL_URL, '-t', '-A', '-q', '-c', query], {
    encoding: 'utf8',
  }).trim();
}

async function waitForHealth(name, url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.status < 500) return true;
    } catch {
      // still starting up
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error(`${name} did not become healthy within ${timeoutMs}ms (${url})`);
  return false;
}

function cookieHeader(setCookieHeaders) {
  return setCookieHeaders.map((c) => c.split(';')[0]).join('; ');
}

function accessTokenFromCookie(cookie) {
  const match = cookie.match(/(?:^|;\s*)medsphere_access=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function json(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function membershipIdByEmail(email, tenantId) {
  return sql(
    `SELECT tm.id FROM "TenantMembership" tm JOIN "User" u ON tm."userId" = u.id
     WHERE u.email = '${email}' AND tm."tenantId" = '${tenantId}';`,
  );
}

// ---------------------------------------------------------------------
// bootstrapUncreatableFoundationState -- audit finding 1
//
// Contains ONLY rows for which no accepted API exists. Verified directly
// against the mounted route surface (every @Post/@Put across every
// controller was enumerated) before writing this function: there is no
// POST /tenants, no POST /providers, and no endpoint that creates a
// Product row (configureInventory requires the product to already exist
// and its DTO has no name/brand/etc. fields). The SYSTEM
// TENANT_ADMINISTRATOR role and its permissions are migration-owned;
// requireMutableRole unconditionally forbids any API mutation of a
// SYSTEM role. The first membership activation and first admin role
// grant have no accepted self-service path either. Nothing else belongs
// in this function -- provider access, inventory listings, and batches
// all have real accepted APIs and are created through them further down,
// after the admin can authenticate.
// ---------------------------------------------------------------------

function bootstrapUncreatableFoundationState({
  tenantId,
  tenantSlug,
  joinCode,
  joinCodeIssuerUserId,
  joinCodeIssuerMembershipId,
  providerAId,
  providerBId,
  roleId,
  productId,
}) {
  sql(`INSERT INTO "Tenant" (id, name, slug, "organizationType", "isActive", "selfRegistrationEnabled", "createdAt", "updatedAt")
       VALUES ('${tenantId}', 'Task5 Smoke Tenant', '${tenantSlug}', 'HOSPITAL', true, true, now(), now());`);

  seedOrganizationJoinCode({
    tenantId,
    joinCode,
    issuerUserId: joinCodeIssuerUserId,
    issuerMembershipId: joinCodeIssuerMembershipId,
  });

  sql(`INSERT INTO "Role" (id, "tenantId", name, description, type, version, "createdAt", "updatedAt")
       VALUES ('${roleId}', '${tenantId}', 'TENANT_ADMINISTRATOR', 'Built-in tenant authorization administrator', 'SYSTEM', 1, now(), now());`);

  // Administrator permission-set evidence (audit finding 2):
  // packages/database/prisma/migrations/20260725120000_tenant_safe_authorization_durable_audit/migration.sql
  // grants TENANT_ADMINISTRATOR every row present in "Permission" with no
  // name filter at all:
  //   INSERT INTO "RolePermission" (...) SELECT ... FROM "Role" r
  //   CROSS JOIN "Permission" p WHERE r.name = 'TENANT_ADMINISTRATOR' AND r.type = 'SYSTEM';
  // Every migration added since (20260802120000, 20260802160000,
  // 20260802180000, 20260809160000, 20260810140000, 20260810200000,
  // 20260814120000) repeats the identical pattern, scoped to exactly the
  // one new permission each introduces, for every tenant that already
  // existed at that migration's time. The accepted, migration-authored
  // invariant is therefore that TENANT_ADMINISTRATOR always holds every
  // row in "Permission" -- not a subset, and not a testing convenience.
  // This reproduces that exact rule for a tenant that did not exist at
  // any of those migration times.
  sql(`INSERT INTO "RolePermission" (id, "tenantId", "roleId", "permissionId", "createdAt")
       SELECT gen_random_uuid(), '${tenantId}', '${roleId}', id, now() FROM "Permission";`);

  for (const [id, name] of [
    [providerAId, 'Task5 Smoke Pharmacy A'],
    [providerBId, 'Task5 Smoke Pharmacy B'],
  ]) {
    sql(`INSERT INTO "Provider" (id, "tenantId", "providerType", "businessName", "ownerName", email, phone, address, city, state, country, "postalCode", latitude, longitude, "isVerified", "isActive", "createdAt", "updatedAt")
         VALUES ('${id}', '${tenantId}', 'PHARMACY', '${name}', 'Smoke Owner', '${id}@smoke.test', '0000000000', 'Smoke Address', 'Chennai', 'Tamil Nadu', 'India', '600001', 13.0827, 80.2707, true, true, now(), now());`);
  }

  sql(`INSERT INTO "Product" (id, name, brand, category, manufacturer, "dosageForm", strength, "requiresPrescription", "isActive", "createdAt", "updatedAt")
       VALUES ('${productId}', 'Task5 Smoke Paracetamol', 'Smoke Brand', 'MEDICINE', 'Smoke Manufacturer', 'TABLET', '500 mg', false, true, now(), now());`);
}

// Activates the two self-registered memberships and grants the first
// administrator role. This is the one place a real, documented product
// gap (Batch 2 Task 2: no accepted self-service verification path exists
// to move a membership out of PENDING) is deliberately worked around for
// bootstrap purposes only. It is recorded as an explicitly predeclared
// PARTIAL, not WORKING, and is the only check in this script allowed to
// be PARTIAL without failing the run.
function bootstrapMembershipActivation({ tenantId, adminEmail, staffEmail, roleId }) {
  const adminMembershipId = sql(
    `UPDATE "TenantMembership" tm SET status = 'ACTIVE', "joinedAt" = now()
     FROM "User" u WHERE tm."userId" = u.id AND u.email = '${adminEmail}' AND tm."tenantId" = '${tenantId}'
     RETURNING tm.id;`,
  );
  sql(
    `UPDATE "TenantMembership" tm SET status = 'ACTIVE', "joinedAt" = now()
     FROM "User" u WHERE tm."userId" = u.id AND u.email = '${staffEmail}' AND tm."tenantId" = '${tenantId}'
     RETURNING tm.id;`,
  );
  sql(`UPDATE "User" SET status = 'ACTIVE', "updatedAt" = now()
       WHERE email IN ('${adminEmail}', '${staffEmail}');`);
  sql(`INSERT INTO "MembershipRole" (id, "tenantId", "membershipId", "roleId")
       VALUES (gen_random_uuid(), '${tenantId}', '${adminMembershipId}', '${roleId}');`);
}

// ---------------------------------------------------------------------
// bootstrapCrossTenantActor -- required chain step 6 (cross-tenant
// rejection).
//
// Creates a second, wholly separate tenant with its own genuine
// TENANT_ADMINISTRATOR, using the exact same accepted permission-grant
// rule cited in bootstrapUncreatableFoundationState (no accepted API
// creates a Tenant or a SYSTEM role, so this remains direct SQL). This
// tenant also gets its own provider (providerC): that provider is used
// purely as a same-tenant positive control, proving the admin's
// permission and provider-access authorization genuinely work before
// the cross-tenant negative case is trusted to mean anything.
// ---------------------------------------------------------------------
function bootstrapCrossTenantActor({ tenantId, tenantSlug, roleId, providerId }) {
  sql(`INSERT INTO "Tenant" (id, name, slug, "organizationType", "isActive", "selfRegistrationEnabled", "createdAt", "updatedAt")
       VALUES ('${tenantId}', 'Task5 Smoke Tenant B', '${tenantSlug}', 'HOSPITAL', true, true, now(), now());`);
  sql(`INSERT INTO "Role" (id, "tenantId", name, description, type, version, "createdAt", "updatedAt")
       VALUES ('${roleId}', '${tenantId}', 'TENANT_ADMINISTRATOR', 'Built-in tenant authorization administrator', 'SYSTEM', 1, now(), now());`);
  sql(`INSERT INTO "RolePermission" (id, "tenantId", "roleId", "permissionId", "createdAt")
       SELECT gen_random_uuid(), '${tenantId}', '${roleId}', id, now() FROM "Permission";`);
  sql(`INSERT INTO "Provider" (id, "tenantId", "providerType", "businessName", "ownerName", email, phone, address, city, state, country, "postalCode", latitude, longitude, "isVerified", "isActive", "createdAt", "updatedAt")
       VALUES ('${providerId}', '${tenantId}', 'PHARMACY', 'Task5 Smoke Pharmacy C', 'Smoke Owner', '${providerId}@smoke.test', '0000000000', 'Smoke Address', 'Chennai', 'Tamil Nadu', 'India', '600001', 13.0827, 80.2707, true, true, now(), now());`);
}

function seedOrganizationJoinCode({ tenantId, joinCode, issuerUserId, issuerMembershipId }) {
  const codeHash = createHmac('sha256', orgJoinCodePepper)
    .update(joinCode.replace(/-(?=[^-]*$)/, ''), 'utf8')
    .digest('hex');
  sql(`INSERT INTO "User" (id, email, "firstName", "lastName", status, "createdAt", "updatedAt")
       VALUES ('${issuerUserId}', '${issuerUserId}@smoke.test', 'Smoke', 'Code Issuer', 'ACTIVE', now(), now());`);
  sql(`INSERT INTO "TenantMembership" (id, "tenantId", "userId", status, "isDefault", "joinedAt", "createdAt", "updatedAt")
       VALUES ('${issuerMembershipId}', '${tenantId}', '${issuerUserId}', 'ACTIVE', true, now(), now(), now());`);
  sql(`INSERT INTO "OrganizationJoinCode" (id, "tenantId", "codeHash", status, "createdByMembershipId", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), '${tenantId}', '${codeHash}', 'ACTIVE', '${issuerMembershipId}', now(), now());`);
}

// Activates exactly one membership in tenant B and grants it the
// TENANT_ADMINISTRATOR role. This is the same documented bootstrap-only
// workaround as bootstrapMembershipActivation above (no accepted
// self-service verification path exists yet) -- it is not a second,
// separate gap, so it deliberately does not add a second PARTIAL
// result; that gap is already recorded once, and this reuses it.
function activateCrossTenantAdmin({ tenantId, adminEmail, roleId }) {
  const membershipId = sql(
    `UPDATE "TenantMembership" tm SET status = 'ACTIVE', "joinedAt" = now()
     FROM "User" u WHERE tm."userId" = u.id AND u.email = '${adminEmail}' AND tm."tenantId" = '${tenantId}'
     RETURNING tm.id;`,
  );
  sql(`UPDATE "User" SET status = 'ACTIVE', "updatedAt" = now() WHERE email = '${adminEmail}';`);
  sql(`INSERT INTO "MembershipRole" (id, "tenantId", "membershipId", "roleId")
       VALUES (gen_random_uuid(), '${tenantId}', '${membershipId}', '${roleId}');`);
}

async function main() {
  console.log('== Waiting for backend + frontend health ==');
  const backendUp = await waitForHealth('backend', `${BACKEND}/health/live`);
  const frontendUp = await waitForHealth('frontend', `${FRONTEND}/`);
  if (!backendUp || !frontendUp) {
    record('service startup', 'BROKEN', 'backend or frontend never became healthy', {
      phase: 'dashboard',
    });
    return;
  }
  record('service startup', 'WORKING', 'both backend and frontend responded', {
    phase: 'dashboard',
  });
  assertProcessesAlive('foundation seed');

  const tenantId = randomUUID();
  const tenantSlug = `task5-smoke-${Date.now()}`;
  const organizationCode = 'MED-X7P42-Q9K3R';
  const joinCodeIssuerUserId = randomUUID();
  const joinCodeIssuerMembershipId = randomUUID();
  const providerAId = randomUUID();
  const providerBId = randomUUID();
  const roleId = randomUUID();
  const productId = randomUUID();
  const adminEmail = `task5-admin-${Date.now()}@smoke.test`;
  const staffEmail = `task5-staff-${Date.now()}@smoke.test`;
  const password = 'Task5Smoke!Passw0rd';

  bootstrapUncreatableFoundationState({
    tenantId,
    tenantSlug,
    joinCode: organizationCode,
    joinCodeIssuerUserId,
    joinCodeIssuerMembershipId,
    providerAId,
    providerBId,
    roleId,
    productId,
  });
  record('foundation seed (tenant, providers, product, admin role/permissions)', 'WORKING');

  async function register(email, code = organizationCode) {
    const phoneDigits = randomUUID().replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
    const phone = `+91${phoneDigits[0] === '0' ? '9' : phoneDigits[0]}${phoneDigits.slice(1)}`;

    return fetch(`${FRONTEND}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: FRONTEND },
      body: JSON.stringify({
        organizationType: 'HOSPITAL',
        organizationCode: code,
        email,
        password,
        firstName: 'Task5',
        lastName: 'Smoke',
        phone,
      }),
    });
  }
  const adminRegister = await register(adminEmail);
  const staffRegister = await register(staffEmail);
  record(
    'registration (accepted API)',
    adminRegister.status === 202 && staffRegister.status === 202 ? 'WORKING' : 'BROKEN',
    `admin=${adminRegister.status} staff=${staffRegister.status}`,
    { phase: 'dashboard' },
  );

  bootstrapMembershipActivation({ tenantId, adminEmail, staffEmail, roleId });
  record(
    'membership activation + first admin role grant (documented gap, test-only bootstrap)',
    'PARTIAL',
    'no accepted self-service verification path exists yet (Batch 2 Task 2 finding); this is bootstrap only, not a working product flow',
    { allowedPartial: true },
  );

  async function login(email, slug = tenantSlug) {
    const res = await fetch(`${FRONTEND}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: FRONTEND },
      body: JSON.stringify({ tenantSlug: slug, email, password }),
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const cookie = cookieHeader(setCookie);
    return { res, cookie, accessToken: accessTokenFromCookie(cookie) };
  }
  const adminLogin = await login(adminEmail);
  const staffLogin = await login(staffEmail);
  if (adminLogin.res.status !== 200 || staffLogin.res.status !== 200 || !adminLogin.accessToken) {
    record(
      'authentication + authenticated session',
      'BROKEN',
      `admin=${adminLogin.res.status} staff=${staffLogin.res.status}`,
      { phase: 'dashboard' },
    );
    return;
  }
  record(
    'authentication + authenticated session (real login, real cookies)',
    'WORKING',
    undefined,
    {
      phase: 'dashboard',
    },
  );
  assertProcessesAlive('authorization + provider bootstrap');

  // Provider-access grant: real accepted backend API, not SQL (audit
  // finding 1). No frontend BFF route exposes this endpoint yet, so this
  // calls the backend directly with the admin's own real access token
  // extracted from the cookie captured above -- still the accepted,
  // permission-checked API, not a database write.
  const adminMembershipId = membershipIdByEmail(adminEmail, tenantId);
  let providerAccessOk = true;
  for (const providerId of [providerAId, providerBId]) {
    const grant = await fetch(
      `${BACKEND}/authorization/memberships/${adminMembershipId}/provider-access/${providerId}`,
      { method: 'PUT', headers: { authorization: `Bearer ${adminLogin.accessToken}` } },
    );
    if (!grant.ok) providerAccessOk = false;
  }
  record(
    'provider-access grant (accepted backend API)',
    providerAccessOk ? 'WORKING' : 'BROKEN',
    providerAccessOk ? '' : 'one or more provider-access grants failed',
  );

  const adminCatalogue = await fetch(`${FRONTEND}/api/authorization/catalogue`, {
    headers: { cookie: adminLogin.cookie },
  });
  const catalogueBody = await json(adminCatalogue);
  const catalogueList = catalogueBody?.permissions ?? catalogueBody;
  const catalogueHasPermissions = Array.isArray(catalogueList) && catalogueList.length > 0;
  record(
    'RBAC allow (admin reads authorization catalogue)',
    adminCatalogue.status === 200 && catalogueHasPermissions ? 'WORKING' : 'BROKEN',
    `status ${adminCatalogue.status}, permissions present: ${Boolean(catalogueHasPermissions)}`,
    { phase: 'dashboard' },
  );

  const staffStockAttempt = await fetch(
    `${FRONTEND}/api/inventory/stock?providerId=${providerAId}&limit=1&offset=0`,
    { headers: { cookie: staffLogin.cookie } },
  );
  record(
    'RBAC deny (no-role staff account denied inventory read)',
    staffStockAttempt.status === 403 ? 'WORKING' : 'BROKEN',
    `expected 403, got ${staffStockAttempt.status}`,
    { phase: 'dashboard' },
  );

  // Required chain step 6: cross-tenant access is rejected. A genuinely
  // separate tenant, with its own real TENANT_ADMINISTRATOR, attempts a
  // real authenticated HTTP request against tenant A's provider stock.
  //
  // Confirmed directly against inventory.service.ts's listStock(): the
  // ONLY gate in front of the query is
  // `if (!(await this.repository.hasProviderAccess(identity, providerId)))
  //   throw new NotFoundException('Provider stock not found')`, and
  // hasProviderAccess() (inventory.repository.ts) looks up
  // membershipProviderAccess scoped by `tenantId: identity.tenantId`.
  // No row can exist linking a tenant-B identity to tenant A's provider,
  // so this is not a "some server error occurred, could be 403 or 404"
  // situation -- it is a single, deterministic, always-404 code path.
  // The @RequirePermissions(inventoryStockRead) guard is a separate,
  // earlier check; a 403 could only ever come from THAT layer, meaning
  // "no permission", not "wrong tenant". Accepting 403 as a pass would
  // let a broken/missing RBAC grant on tenant B masquerade as proof of
  // tenant isolation. The assertion below therefore requires exactly
  // 404 with the exact NotFoundException message, and only after first
  // proving tenant B's admin genuinely holds the required permission
  // and a genuine, granted, same-tenant provider-access record (the
  // positive control) -- so a 403 on the real cross-tenant call cannot
  // be explained away as "well, RBAC probably would have blocked it
  // anyway".
  const tenantBId = randomUUID();
  const tenantBSlug = `task5-smoke-b-${Date.now()}`;
  const tenantBOrganizationCode = 'MED-R8V6C-W4N2H';
  const tenantBJoinCodeIssuerUserId = randomUUID();
  const tenantBJoinCodeIssuerMembershipId = randomUUID();
  const roleBId = randomUUID();
  const providerCId = randomUUID();
  const adminBEmail = `task5-admin-b-${Date.now()}@smoke.test`;
  const crossTenantCheckName =
    'cross-tenant access is rejected (tenant B admin denied reading tenant A provider stock)';
  const crossTenantPositiveControlName =
    'cross-tenant positive control (tenant B admin genuinely has inventory-read permission and access to its own provider)';

  bootstrapCrossTenantActor({
    tenantId: tenantBId,
    tenantSlug: tenantBSlug,
    roleId: roleBId,
    providerId: providerCId,
  });
  seedOrganizationJoinCode({
    tenantId: tenantBId,
    joinCode: tenantBOrganizationCode,
    issuerUserId: tenantBJoinCodeIssuerUserId,
    issuerMembershipId: tenantBJoinCodeIssuerMembershipId,
  });
  const adminBRegister = await register(adminBEmail, tenantBOrganizationCode);
  if (adminBRegister.status !== 202) {
    record(
      crossTenantCheckName,
      'BROKEN',
      `tenant B admin registration failed: status ${adminBRegister.status}`,
      {
        phase: 'dashboard',
      },
    );
  } else {
    activateCrossTenantAdmin({ tenantId: tenantBId, adminEmail: adminBEmail, roleId: roleBId });
    const adminBLogin = await login(adminBEmail, tenantBSlug);
    if (adminBLogin.res.status !== 200 || !adminBLogin.accessToken) {
      record(
        crossTenantCheckName,
        'BROKEN',
        `tenant B admin login failed: status ${adminBLogin.res.status}`,
        {
          phase: 'dashboard',
        },
      );
    } else {
      // Positive control: grant tenant B's admin real, accepted
      // provider-access to its OWN provider (providerC), through the
      // same accepted backend API used for tenant A above, then read
      // that provider's stock. This proves the permission guard and
      // the provider-access mechanism both genuinely work for this
      // exact admin and this exact route before the cross-tenant
      // negative result is allowed to mean anything.
      const adminBMembershipId = membershipIdByEmail(adminBEmail, tenantBId);
      const ownProviderGrant = await fetch(
        `${BACKEND}/authorization/memberships/${adminBMembershipId}/provider-access/${providerCId}`,
        { method: 'PUT', headers: { authorization: `Bearer ${adminBLogin.accessToken}` } },
      );
      const ownProviderAttempt = await fetch(
        `${FRONTEND}/api/inventory/stock?providerId=${providerCId}&limit=1&offset=0`,
        { headers: { cookie: adminBLogin.cookie } },
      );
      const positiveControlOk = ownProviderGrant.ok && ownProviderAttempt.status === 200;
      record(
        crossTenantPositiveControlName,
        positiveControlOk ? 'WORKING' : 'BROKEN',
        `provider-access grant: ${ownProviderGrant.status}, own-provider stock read: ${ownProviderAttempt.status} (expected 200)`,
        { phase: 'dashboard' },
      );

      if (!positiveControlOk) {
        record(
          crossTenantCheckName,
          'BROKEN',
          'skipped: positive control failed, so a denial on the cross-tenant call would not prove tenant isolation',
          { phase: 'dashboard' },
        );
      } else {
        const beforeCount = sql(
          `SELECT count(*) FROM "Inventory" WHERE "tenantId" = '${tenantId}' AND "providerId" = '${providerAId}';`,
        );
        const crossTenantAttempt = await fetch(
          `${FRONTEND}/api/inventory/stock?providerId=${providerAId}&limit=1&offset=0`,
          { headers: { cookie: adminBLogin.cookie } },
        );
        const crossTenantBody = await json(crossTenantAttempt);
        const afterCount = sql(
          `SELECT count(*) FROM "Inventory" WHERE "tenantId" = '${tenantId}' AND "providerId" = '${providerAId}';`,
        );
        const stateUnchanged = beforeCount === afterCount;
        const statusExactly404 = crossTenantAttempt.status === 404;
        const messageMatches = crossTenantBody?.message === 'Provider stock not found';
        record(
          crossTenantCheckName,
          statusExactly404 && messageMatches && stateUnchanged ? 'WORKING' : 'BROKEN',
          `expected exactly 404 with message "Provider stock not found" and unchanged tenant A inventory row count; got status ${crossTenantAttempt.status}, message "${crossTenantBody?.message}", tenant A inventory rows before/after: ${beforeCount}/${afterCount}`,
          { phase: 'dashboard' },
        );
      }
    }
  }

  // The dashboard route ((platform)/layout.tsx + dashboard/page.tsx)
  // renders DashboardWorkspace, a 'use client' component. Its actual
  // operational content ("Stock records"/"Reservation records" and the
  // real seeded rows within them) sits inside a `{providerId ? ... : ...}`
  // conditional -- confirmed directly against dashboard-workspace.tsx:
  // providerId starts as useState(''), only ever resolves to a real
  // value via a client-side useEffect after the assigned-providers list
  // is fetched, and cannot be non-empty on the server's first render
  // pass for ANY authenticated user, correctly, by design. Checking for
  // that text was therefore checking for something that structurally
  // cannot exist in the true first response regardless of whether the
  // dashboard is healthy -- a smoke-harness defect, not a product one.
  // What genuinely is present in that first render pass, confirmed
  // directly: the page header ("Assigned-provider operations" /
  // "Operations overview"), rendered unconditionally inside <header>,
  // structurally before and outside the providerId gate. This check is
  // deliberately scoped to prove only that: the authenticated dashboard
  // shell is genuinely served for a real admin session. It does not and
  // cannot prove the post-hydration client-side stock/reservation data
  // load succeeded -- that is proven separately, more precisely, and
  // with exact seeded values, by the real stock-read/reservation checks
  // elsewhere in this script.
  const unauthenticatedDashboard = await fetch(`${FRONTEND}/dashboard`, {
    redirect: 'manual',
  });
  const unauthenticatedLocation = unauthenticatedDashboard.headers.get('location');
  // Resolve the Location header against FRONTEND so both a relative
  // ("/login?reason=session") and an absolute
  // ("http://host/login?reason=session") redirect target are handled
  // identically and exactly -- accepting a bare 302/307 status alone
  // would also pass for a redirect to "/", an error page, or any other
  // unrelated route, none of which prove the real auth gate actually
  // fired. Verified directly against
  // apps/web/src/app/(platform)/layout.tsx's real
  // redirect('/login?reason=session') call: pathname must be exactly
  // "/login" and the "reason" query parameter must be exactly
  // "session".
  let unauthenticatedRedirectOk = false;
  if (unauthenticatedLocation) {
    try {
      const resolved = new URL(unauthenticatedLocation, FRONTEND);
      unauthenticatedRedirectOk =
        resolved.pathname === '/login' && resolved.searchParams.get('reason') === 'session';
    } catch {
      unauthenticatedRedirectOk = false;
    }
  }
  record(
    'dashboard unauthenticated protection (real server-side redirect to the exact login route)',
    (unauthenticatedDashboard.status === 307 || unauthenticatedDashboard.status === 302) &&
      unauthenticatedRedirectOk
      ? 'WORKING'
      : 'BROKEN',
    `status ${unauthenticatedDashboard.status}, location: ${unauthenticatedLocation}, resolved to exact /login?reason=session: ${unauthenticatedRedirectOk}`,
    { phase: 'dashboard' },
  );

  const dashboardPage = await fetch(`${FRONTEND}/dashboard`, {
    headers: { cookie: adminLogin.cookie },
    redirect: 'manual',
  });
  const dashboardHtml = dashboardPage.status === 200 ? await dashboardPage.text() : '';
  const dashboardShellPresent =
    dashboardHtml.includes('Assigned-provider operations') &&
    dashboardHtml.includes('Operations overview');
  record(
    'dashboard shell served for authenticated admin (server-rendered shell only, not post-hydration data -- see the separate browser runtime certification for that)',
    dashboardPage.status === 200 && dashboardShellPresent ? 'WORKING' : 'BROKEN',
    `status ${dashboardPage.status}, stable shell markers present: ${dashboardShellPresent}`,
    { phase: 'dashboard' },
  );

  // ---- Dashboard browser runtime certification (Part C/D) ----
  // The HTTP-level checks above prove only that the server returns the
  // unconditional shell -- confirmed directly, and deliberately, that
  // they cannot prove provider discovery/selection, stock/reservation
  // API completion, client hydration, or browser JavaScript execution
  // (dashboard-workspace.tsx's actual operational content is entirely
  // client-driven, populated by useEffect after mount). This step
  // exercises the real chain -- browser -> frontend -> frontend API
  // routes -> backend -> PostgreSQL/Redis -- via a real login through
  // the real /login form (apps/web/e2e/dashboard.spec.ts), not an
  // injected cookie. Playwright was added because the repository had no
  // existing browser-testing framework at all (confirmed by searching
  // package.json/pnpm-workspace.yaml/apps/web/package.json for
  // playwright/puppeteer/cypress before adding it -- zero matches).
  //
  // A Dashboard containing only the static shell cannot pass this step:
  // the spec explicitly waits for the assigned-provider <select> to
  // resolve to a real, non-empty value, and for the provider-dependent
  // sections (only rendered once providerId is truthy) to appear.
  // Successful-but-empty stock/reservation reads are accepted as
  // WORKING (no synthetic batch data is guaranteed seeded before this
  // step); only a failed request (surfaced as one of the three real
  // error-title strings dashboard-workspace.tsx can render) is BROKEN.
  assertProcessesAlive('dashboard browser runtime certification');
  const browserCert = spawnSync(
    'pnpm',
    ['--filter', '@medsphere/web', 'exec', 'playwright', 'test', 'e2e/dashboard.spec.ts'],
    {
      env: {
        ...process.env,
        FRONTEND,
        DASHBOARD_CERT_TENANT_SLUG: tenantSlug,
        DASHBOARD_CERT_ADMIN_EMAIL: adminEmail,
        DASHBOARD_CERT_ADMIN_PASSWORD: password,
      },
      stdio: 'inherit',
    },
  );
  record(
    'dashboard browser runtime certification (real login, real hydration, real provider-dependent read path)',
    browserCert.status === 0 ? 'WORKING' : 'BROKEN',
    `playwright exit code: ${browserCert.status}${browserCert.error ? `, spawn error: ${browserCert.error.message}` : ''}`,
    { phase: 'dashboard' },
  );

  // Inventory listing + batch receipt: real accepted APIs (audit finding
  // 1) -- but, verified directly against the mounted frontend routes,
  // there is no frontend BFF route for either configureInventory or
  // receiveBatch (only .../batches/:batchId/quarantine,
  // .../damage, .../reservations, and .../transfers are proxied). These
  // therefore call the backend directly with the admin's bearer token,
  // the same pattern already used for the provider-access grant above --
  // still the real, accepted, permission-checked API, not a database
  // write.
  assertProcessesAlive('inventory listing + batch receipt');

  const configureInventory = await fetch(
    `${BACKEND}/inventory/providers/${providerAId}/products/${productId}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminLogin.accessToken}`,
      },
      body: JSON.stringify({
        sellingPrice: '20.00',
        mrp: '25.00',
        discountPercentage: '0.00',
        taxPercentage: '0.00',
        // ConfigureInventoryDto (inventory-command.dto.ts) requires both
        // of these -- confirmed directly against the DTO's own
        // decorators (@IsInt/@Min(0) and @IsBoolean, neither
        // @IsOptional()). Omitting them was the proven root cause of
        // the real 400 this harness previously produced; the backend
        // route and DTO themselves are correct and unchanged.
        minimumStockLevel: 0,
        isVisible: true,
        idempotencyKey: `task5-smoke-listing-${randomUUID()}`,
      }),
    },
  );
  const configureInventoryBody = await json(configureInventory);
  const configureInventoryOk =
    typeof configureInventoryBody?.inventoryId === 'string' &&
    configureInventoryBody?.version === 1 &&
    configureInventoryBody?.replayed === false;
  record(
    'inventory listing creation (accepted configureInventory API, real response semantics)',
    configureInventory.status === 200 && configureInventoryOk ? 'WORKING' : 'BROKEN',
    `status ${configureInventory.status}, semantics ok: ${Boolean(configureInventoryOk)}`,
    { phase: 'inventory' },
  );

  const expiryDate = new Date(Date.now() + 30 * 86_400_000).toISOString();
  async function receiveBatch(batchNumber, quantity) {
    return fetch(`${BACKEND}/inventory/providers/${providerAId}/products/${productId}/batches`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminLogin.accessToken}`,
      },
      body: JSON.stringify({
        batchNumber,
        expiryDate,
        quantity,
        purchasePrice: '15.00',
        sellingPrice: '20.00',
        idempotencyKey: `task5-smoke-receive-${randomUUID()}`,
      }),
    });
  }
  const receiveBatch1 = await receiveBatch(`TASK5-SMOKE-${randomUUID().slice(0, 8)}`, 20);
  const batch1Body = await json(receiveBatch1);
  const batchId = batch1Body?.batchId;
  const receiveBatch2 = await receiveBatch(`TASK5-SMOKE2-${randomUUID().slice(0, 8)}`, 10);
  const batch2Body = await json(receiveBatch2);
  const batch2Id = batch2Body?.batchId;
  record(
    'batch receipt (accepted receiveBatch API)',
    receiveBatch1.status === 200 && receiveBatch2.status === 200 && batchId && batch2Id
      ? 'WORKING'
      : 'BROKEN',
    `status ${receiveBatch1.status}/${receiveBatch2.status}`,
    { phase: 'inventory' },
  );
  if (!batchId || !batch2Id) return;

  const stockRead = await fetch(
    `${FRONTEND}/api/inventory/stock?providerId=${providerAId}&limit=10&offset=0`,
    { headers: { cookie: adminLogin.cookie } },
  );
  const stockBody = await json(stockRead);
  const stockMatches = stockBody?.data?.some(
    (item) =>
      item.name === 'Task5 Smoke Paracetamol' &&
      item.batches?.some((b) => b.id === batchId && b.onHandQuantity === 20),
  );
  record(
    'inventory read (real product/batch/quantities present)',
    stockRead.status === 200 && stockMatches ? 'WORKING' : 'BROKEN',
    `status ${stockRead.status}, matched seeded batch: ${Boolean(stockMatches)}`,
    { phase: 'inventory' },
  );

  const quarantineRequestId = `task5-smoke-quarantine-${randomUUID()}`;
  const quarantine = await fetch(
    `${FRONTEND}/api/inventory/providers/${providerAId}/batches/${batchId}/quarantine`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: FRONTEND,
        cookie: adminLogin.cookie,
        'x-request-id': quarantineRequestId,
      },
      body: JSON.stringify({
        expectedVersion: 1,
        idempotencyKey: `task5-smoke-quarantine-key-${randomUUID()}`,
        reasonCode: 'QUALITY_SUSPECT',
      }),
    },
  );
  const quarantineBody = await json(quarantine);
  const quarantineStateOk =
    quarantineBody?.status === 'QUARANTINED' && quarantineBody?.batchId === batchId;
  record(
    'inventory mutation (quarantine actually mutated batch state)',
    quarantine.status === 200 && quarantineStateOk ? 'WORKING' : 'BROKEN',
    `status ${quarantine.status}, reported status: ${quarantineBody?.status}`,
    { phase: 'inventory' },
  );

  // AuditEventQueryDto's real backend service enforces a genuine,
  // correct business rule (audit.service.ts's listTenantEvents,
  // confirmed directly): resourceType and resourceId must be supplied
  // together, or not at all -- supplying resourceId alone throws
  // BadRequestException('Resource type and identifier must be supplied
  // together'). Reproduced this exact rejection directly against the
  // real DTO decorators via class-validator/class-transformer before
  // this fix: resourceId alone passes DTO-level validation with zero
  // errors, confirming the 400 originates from this service-level
  // check, not from any DTO defect -- the backend contract itself is
  // correct and unchanged. The smoke query below was simply missing
  // resourceType, which this check already independently asserts on
  // the returned event (auditEvent.resourceType === 'Batch').
  const auditRead = await fetch(
    `${FRONTEND}/api/audit/events?resourceType=Batch&resourceId=${batchId}&limit=5`,
    {
      headers: { cookie: adminLogin.cookie },
    },
  );
  const auditBody = await json(auditRead);
  const auditEvent = auditBody?.data?.find((e) => e.eventType === 'inventory.batch.quarantined');
  const auditMatches =
    auditEvent &&
    auditEvent.outcome === 'SUCCEEDED' &&
    auditEvent.resourceId === batchId &&
    auditEvent.resourceType === 'Batch' &&
    typeof auditEvent.actorMembershipId === 'string' &&
    auditEvent.requestId === quarantineRequestId;
  record(
    'audit evidence (tenant/actor/resource/action/correlation all match)',
    auditRead.status === 200 && auditMatches ? 'WORKING' : 'BROKEN',
    `status ${auditRead.status}, event found: ${Boolean(auditEvent)}, correlation matched: ${auditEvent?.requestId === quarantineRequestId}`,
    { phase: 'inventory' },
  );

  assertProcessesAlive('reservation + transfer + public search');

  const publicSearch = await fetch(
    `${FRONTEND}/api/public/providers/${providerAId}/medicine-search?q=Paracetamol&limit=10&offset=0`,
  );
  const publicSearchBody = await json(publicSearch);
  const publicResult = publicSearchBody?.data?.find((r) => r.productId === productId);
  const publicSearchSemanticsOk =
    publicResult &&
    publicResult.name === 'Task5 Smoke Paracetamol' &&
    publicResult.providerId === providerAId &&
    publicResult.availability === 'IN_STOCK' &&
    !('inventoryId' in publicResult) &&
    !('purchasePrice' in publicResult) &&
    !('sellingPrice' in publicResult) &&
    !('ownerName' in publicResult) &&
    !('email' in publicResult);
  record(
    'public medicine search (correct data, no forbidden/private fields)',
    publicSearch.status === 200 && publicSearchSemanticsOk ? 'WORKING' : 'BROKEN',
    `status ${publicSearch.status}, result found and field-minimized: ${Boolean(publicSearchSemanticsOk)}`,
  );

  const staffUserId = sql(`SELECT id FROM "User" WHERE email = '${staffEmail}';`);
  const reservationCreate = await fetch(
    `${FRONTEND}/api/inventory/providers/${providerAId}/reservations`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: FRONTEND, cookie: adminLogin.cookie },
      body: JSON.stringify({
        subjectUserId: staffUserId,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        items: [{ productId, quantity: 2 }],
        idempotencyKey: `task5-smoke-reservation-${randomUUID()}`,
      }),
    },
  );
  const reservationBody = await json(reservationCreate);
  const reservationId = reservationBody?.reservationId;
  const reservationCreateOk =
    reservationBody?.status === 'PENDING' &&
    reservationBody?.totalQuantity === 2 &&
    reservationBody?.itemCount === 1;
  record(
    'staff-assisted reservation creation (correct provider/product/quantity/status)',
    reservationCreate.status === 200 && reservationCreateOk ? 'WORKING' : 'BROKEN',
    `status ${reservationCreate.status}, semantics ok: ${Boolean(reservationCreateOk)}`,
  );
  if (!reservationId) return;

  const confirm = await fetch(
    `${FRONTEND}/api/inventory/providers/${providerAId}/reservations/${reservationId}/transitions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: FRONTEND, cookie: adminLogin.cookie },
      body: JSON.stringify({
        transition: 'CONFIRM',
        expectedVersion: 1,
        idempotencyKey: `task5-smoke-confirm-${randomUUID()}`,
      }),
    },
  );
  const confirmBody = await json(confirm);
  const ready = await fetch(
    `${FRONTEND}/api/inventory/providers/${providerAId}/reservations/${reservationId}/transitions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: FRONTEND, cookie: adminLogin.cookie },
      body: JSON.stringify({
        transition: 'READY',
        expectedVersion: 2,
        idempotencyKey: `task5-smoke-ready-${randomUUID()}`,
      }),
    },
  );
  const readyBody = await json(ready);
  const lifecycleOk =
    confirm.status === 200 &&
    confirmBody?.status === 'CONFIRMED' &&
    ready.status === 200 &&
    readyBody?.status === 'READY';
  record(
    'reservation lifecycle (CONFIRM -> READY, correct resulting status each step)',
    lifecycleOk ? 'WORKING' : 'BROKEN',
    `confirm status ${confirm.status}/${confirmBody?.status}, ready status ${ready.status}/${readyBody?.status}`,
  );

  // Stock transfer isolation fix (PR #111 CI evidence): confirmed
  // directly against inventory-transfer.service.ts (line 85-86,
  // "Source batch version conflict") and reservation-creation.service.ts
  // (line 189, batch version increment on allocation) that this was a
  // harness sequencing/data-isolation defect, not a production defect.
  // Once batch1 is quarantined above, it is no longer 'ACTIVE'
  // (reservation-creation.service.ts only allocates against ACTIVE
  // batches), so the reservation created below is forced to allocate
  // against batch2 -- incrementing batch2's version past 1 before this
  // step runs. A hard-coded expectedSourceVersion: 1 against batch2 is
  // therefore stale by construction and is correctly rejected by the
  // transfer service's own optimistic-concurrency check -- proven by
  // the standalone stock-transfer-runtime-cert.yml workflow, which
  // works around this same defect at CI time by patching in a
  // dynamically-read version instead of a hard-coded one. Rather than
  // coupling the transfer scenario to exactly how many prior operations
  // touched batch2's version, this gives the transfer its own
  // independent, freshly received batch that no quarantine or
  // reservation allocation has touched, so expectedSourceVersion: 1 is
  // always correct by construction and full quarantine + reservation
  // interaction coverage against batch1/batch2 remains completely
  // unchanged above.
  const receiveTransferBatch = await receiveBatch(`TASK5-SMOKE3-${randomUUID().slice(0, 8)}`, 10);
  const transferBatchBody = await json(receiveTransferBatch);
  const transferBatchId = transferBatchBody?.batchId;
  record(
    'stock transfer source batch precondition (dedicated, freshly received batch, accepted receiveBatch API)',
    receiveTransferBatch.status === 200 && transferBatchId ? 'WORKING' : 'BROKEN',
    `status ${receiveTransferBatch.status}, batchId present: ${Boolean(transferBatchId)}`,
  );
  if (!transferBatchId) return;

  // Combined-harness 404 fix (PR #111 Debug Task 2 CI evidence): traced
  // directly against inventory-transfer.service.ts's lookup sequence
  // before changing anything. Two NotFoundException sources exist in
  // recordCompleted(): 'Assigned provider batch not found' (source
  // lookup) and 'Destination inventory listing not found' (line ~103,
  // destinationInventory = tx.inventory.findFirst({ providerId:
  // command.destinationProviderId, productId: source.productId, ... })).
  // The freshly received transferBatchId above proves the source lookup
  // succeeds (confirmed WORKING immediately above), so by elimination
  // the 404 was the destination listing: providerB has never had
  // configureInventory called for this product in this harness (only
  // providerA's listing was created earlier). Confirmed further by the
  // standalone stock-transfer-runtime-cert.yml workflow's own
  // already-proven precondition, which does exactly this same
  // configureInventory call for providerB before transfer. Fixed here
  // via the same accepted API already used for providerA's own listing
  // above -- not hidden DB state.
  const configureDestinationInventory = await fetch(
    `${BACKEND}/inventory/providers/${providerBId}/products/${productId}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminLogin.accessToken}`,
      },
      body: JSON.stringify({
        sellingPrice: '20.00',
        mrp: '25.00',
        discountPercentage: '0.00',
        taxPercentage: '0.00',
        minimumStockLevel: 0,
        isVisible: true,
        idempotencyKey: `task5-smoke-destination-listing-${randomUUID()}`,
      }),
    },
  );
  const configureDestinationBody = await json(configureDestinationInventory);
  const destinationListingOk =
    configureDestinationInventory.status === 200 &&
    typeof configureDestinationBody?.inventoryId === 'string';
  record(
    'stock transfer destination listing precondition (accepted configureInventory API)',
    destinationListingOk ? 'WORKING' : 'BROKEN',
    `status ${configureDestinationInventory.status}, listing present: ${Boolean(destinationListingOk)}`,
  );
  if (!destinationListingOk) return;

  const transfer = await fetch(`${FRONTEND}/api/inventory/providers/${providerAId}/transfers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: FRONTEND, cookie: adminLogin.cookie },
    body: JSON.stringify({
      destinationProviderId: providerBId,
      sourceBatchId: transferBatchId,
      expectedSourceVersion: 1,
      quantity: 3,
      idempotencyKey: `task5-smoke-transfer-${randomUUID()}`,
    }),
  });
  const transferBody = await json(transfer);
  const transferOk =
    transferBody?.sourceOnHandAfter === 7 &&
    transferBody?.destinationOnHandAfter === 3 &&
    transferBody?.sourceProviderId === providerAId &&
    transferBody?.destinationProviderId === providerBId;
  record(
    'stock transfer (correct source/target quantities)',
    transfer.status === 200 && transferOk ? 'WORKING' : 'BROKEN',
    `status ${transfer.status}, source after: ${transferBody?.sourceOnHandAfter}, destination after: ${transferBody?.destinationOnHandAfter}`,
  );

  // Notification path: disabled-safe configuration only (audit finding 5).
  // A database/query/connectivity failure here is a real infrastructure
  // defect and must be BROKEN, not silently downgraded -- no catch block
  // swallows this into PARTIAL.
  assertProcessesAlive('notification path verification');
  const providerConfigured =
    typeof process.env.NOTIFICATION_EMAIL_PROVIDER_ENABLED !== 'undefined' ||
    typeof process.env.NOTIFICATION_EMAIL_PROVIDER_KEY !== 'undefined';
  if (providerConfigured) {
    record(
      'notification path (disabled-safe configuration)',
      'BROKEN',
      'NOTIFICATION_EMAIL_PROVIDER_* is set in this run; this workflow must never configure a real provider',
    );
  } else {
    const deliveryRows = sql(
      `SELECT status FROM "NotificationDelivery" WHERE "tenantId" = '${tenantId}';`,
    );
    const rows = deliveryRows ? deliveryRows.split('\n').filter(Boolean) : [];
    const anySucceeded = rows.some((status) => status === 'SUCCEEDED' || status === 'DELIVERED');
    record(
      'notification path (proven fail-closed, no provider configured, no external delivery)',
      anySucceeded ? 'BROKEN' : 'WORKING',
      anySucceeded
        ? 'a delivery row reports success with no provider configured -- impossible unless something bypassed the deny-by-default contract'
        : `${rows.length} delivery row(s) recorded for this tenant, none report a successful send; NOTIFICATION_EMAIL_PROVIDER_* was never set in this run`,
    );
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  if (!(error instanceof ProcessDiedError)) {
    console.error('\nUnexpected exception during smoke test:', error);
    record('unexpected exception', 'BROKEN', String(error?.message ?? error).slice(0, 400));
  }
  exitCode = 1;
} finally {
  console.log('\n== Batch 2 Task 5 live smoke-test matrix ==');
  for (const r of results) {
    const requiredLabel = r.required ? 'required' : 'informational';
    const allowedLabel = r.allowedPartial ? ', predeclared-allowed' : '';
    console.log(`${r.status.padEnd(14)} [${requiredLabel}${allowedLabel}] ${r.name}`);
  }
  const failing = results.filter(fails);
  if (failing.length > 0) {
    console.error(`\n${failing.length} required check(s) did not pass:`);
    for (const f of failing) console.error(`  - ${f.name}: ${f.status}`);
    exitCode = 1;
  } else if (exitCode === 0) {
    console.log('\nEvery required check passed (or was a predeclared, documented gap).');
  }

  // Part E: the Dashboard certification must remain isolated from later
  // capabilities (Inventory, Reservations, Notifications) that run
  // later in this same script. Later failures are NOT hidden -- they
  // remain fully visible in the matrix above and still affect the
  // overall exitCode above, unchanged -- but this separate verdict line
  // is computed only from checks explicitly tagged phase: 'dashboard',
  // so a CI step reading only this line can determine the Dashboard
  // result without being contaminated by, for example, "inventory
  // listing creation: 400" or "batch receipt: 404" occurring afterward.
  const dashboardChecks = results.filter((r) => r.phase === 'dashboard');
  const dashboardFailing = dashboardChecks.filter(fails);
  console.log('\n== DASHBOARD CERTIFICATION VERDICT (isolated from later capabilities) ==');
  for (const r of dashboardChecks) {
    console.log(`${r.status.padEnd(14)} ${r.name}`);
  }
  console.log(
    dashboardFailing.length === 0
      ? 'DASHBOARD CERTIFICATION: PASS'
      : `DASHBOARD CERTIFICATION: FAIL (${dashboardFailing.length} check(s): ${dashboardFailing.map((f) => f.name).join(', ')})`,
  );

  // Inventory certification verdict, isolated the same way as Dashboard
  // (phase: 'inventory'), covering exactly the five inventory-
  // authoritative checks: listing creation, batch receipt, stock read,
  // quarantine mutation, and matching audit evidence. Deliberately does
  // not include Reservations, Transfers, Notifications, or Public
  // Search -- those remain visible in the full matrix above (and still
  // affect the overall exitCode, unchanged) but must not contaminate
  // this isolated verdict. If any prerequisite (service startup,
  // authentication, RBAC, foundation seed) failed earlier, main()
  // already returned before reaching any inventory-tagged check, so
  // inventoryChecks will simply be empty and this verdict correctly
  // reports FAIL rather than a false PASS.
  const inventoryChecks = results.filter((r) => r.phase === 'inventory');
  const inventoryFailing = inventoryChecks.filter(fails);
  console.log('\n== INVENTORY CERTIFICATION VERDICT (isolated from later capabilities) ==');
  for (const r of inventoryChecks) {
    console.log(`${r.status.padEnd(14)} ${r.name}`);
  }
  console.log(
    inventoryChecks.length > 0 && inventoryFailing.length === 0
      ? 'INVENTORY CERTIFICATION: PASS'
      : `INVENTORY CERTIFICATION: FAIL (${inventoryChecks.length === 0 ? 'no inventory checks were reached -- a prerequisite failed earlier' : `${inventoryFailing.length} check(s): ${inventoryFailing.map((f) => f.name).join(', ')}`})`,
  );

  process.exitCode = exitCode;
}
