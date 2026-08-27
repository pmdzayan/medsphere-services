#!/usr/bin/env node
// MedSphere V1 -- Performance & Reliability Certification.
//
// Proves the accepted runtime (Frontend BFF -> auth-service -> PostgreSQL
// -> Redis) stays stable under controlled, genuinely concurrent synthetic
// traffic: a bounded-worker-pool read phase, a bounded-worker-pool
// mutation phase (real reservation creation, exercising the accepted
// concurrency/idempotency and tenant-scoped persistence invariants), fail-closed
// latency/error-rate thresholds, and post-load reliability + data
// integrity verification -- not merely "the process exited zero".
//
// This is CI/launch-readiness verification infrastructure, not a product
// feature. It follows the same conventions already accepted for
// scripts/task5-smoke-test.mjs and scripts/backup-restore-certification.mjs:
// no shell string interpolation for external commands (execFileSync with
// an argument array), PGPASSWORD via environment rather than argv, no
// logging of a full connection string or password, and synthetic data
// only -- no real healthcare data, no real phone numbers, no production
// credentials.
//
// It deliberately reuses, rather than reimplements, the exact accepted
// HTTP contracts already proven by scripts/task5-smoke-test.mjs
// (registration, login, dashboard shell, RBAC catalogue read, inventory
// stock read, public medicine search, reservation creation) and the exact
// accepted direct-SQL synthetic-fixture bootstrap pattern used there and
// in scripts/backup-restore-certification.mjs (Tenant / SYSTEM role +
// full permission grant / Provider / Product -- rows no accepted API can
// create). This is a second, narrowly-scoped tool (concurrency + timing +
// percentiles), not a second competing functional-correctness harness.
//
// Usage:
//   DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public \
//   FRONTEND_URL=http://localhost:3001 BACKEND_URL=http://localhost:3000 \
//   node scripts/v1-performance-certification.mjs

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------
// Configuration -- exported so the negative-test suite can exercise
// evaluateCertification()/percentile()/runWorkerPool() against synthetic
// inputs without needing a live server.
// ---------------------------------------------------------------------

export const PROFILE = Object.freeze({
  warmupWorkers: 5,
  warmupOperations: 20,
  certificationWorkers: 20,
  readOperations: 160,
  mutationOperations: 40,
});

// Rationale for this profile (see docs/operations/v1-performance-reliability-certification.md
// for the full writeup): 20 concurrent workers is the suggested V1 CI-safe
// profile from the task spec, matched exactly rather than adjusted, since
// nothing in repository inspection demonstrated a need for a different
// bound. readOperations:mutationOperations is 4:1 -- reads dominate real
// traffic, and every mutation is a real reservation creation consuming
// finite (synthetically large) batch stock, so the ratio also bounds how
// much synthetic stock the seed step must provision. Total is exactly 200,
// the suggested floor.

export const THRESHOLDS = Object.freeze({
  maxErrorRate: 0.01,
  maxP95Ms: 1500,
  maxP99Ms: 3000,
});

const FRONTEND = process.env.FRONTEND_URL ?? 'http://localhost:3001';
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:3000';
const DATABASE_URL = process.env.DATABASE_URL;
const HTTP_REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------
// Pure, dependency-free logic -- unit-tested directly in
// scripts/v1-performance-certification.spec.mjs.
// ---------------------------------------------------------------------

/**
 * Nearest-rank percentile over an already-sorted-ascending array of
 * numbers. Returns 0 for an empty array (a certification run with zero
 * operations should never be mistaken for a fast one -- callers must
 * treat count === 0 as its own failure, not rely on this returning
 * something misleadingly small).
 */
export function percentile(sortedAscending, p) {
  if (sortedAscending.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAscending.length);
  const index = Math.min(Math.max(rank - 1, 0), sortedAscending.length - 1);
  return sortedAscending[index];
}

export function computeStats(latenciesMs) {
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count,
    averageMs: count === 0 ? 0 : sum / count,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    maxMs: count === 0 ? 0 : sorted[sorted.length - 1],
  };
}

/**
 * Bounded-concurrency worker pool: exactly `concurrency` workers pull from
 * a shared queue until it is empty, each running `worker(task)` and
 * pushing its settled outcome (never throwing past this function -- a
 * failed task is data, not a crash) into the returned results array, in
 * completion order. This is what makes the load genuinely overlapping
 * rather than a sequential loop: all `concurrency` workers are started
 * together via Promise.all and each proceeds independently as soon as its
 * previous task settles.
 */
export async function runWorkerPool(tasks, concurrency, worker) {
  const queue = tasks.map((task, index) => ({ task, index }));
  const results = new Array(tasks.length);
  async function runWorker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      try {
        results[item.index] = { ok: true, value: await worker(item.task) };
      } catch (error) {
        results[item.index] = { ok: false, error };
      }
    }
  }
  const workerCount = Math.min(concurrency, tasks.length) || 0;
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

/**
 * Evaluates a completed run's evidence against fail-closed thresholds.
 * Pure function: every input is a plain value, nothing is read from the
 * environment or the network, so this is exhaustively unit-testable.
 */
export function evaluateCertification({
  totalOperations,
  successfulOperations,
  failedOperations,
  stats,
  postLoadReadinessPassed,
  integrityPassed,
  thresholds = THRESHOLDS,
}) {
  const reasons = [];

  if (totalOperations <= 0) {
    reasons.push('no operations were recorded');
  }
  if (successfulOperations + failedOperations !== totalOperations) {
    reasons.push('successful + failed operation counts do not reconcile with total');
  }

  const errorRate = totalOperations === 0 ? 1 : failedOperations / totalOperations;
  if (errorRate > thresholds.maxErrorRate) {
    reasons.push(
      `error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold ${(thresholds.maxErrorRate * 100).toFixed(2)}%`,
    );
  }
  if (stats.p95Ms > thresholds.maxP95Ms) {
    reasons.push(`p95 latency ${stats.p95Ms}ms exceeds threshold ${thresholds.maxP95Ms}ms`);
  }
  if (stats.p99Ms > thresholds.maxP99Ms) {
    reasons.push(`p99 latency ${stats.p99Ms}ms exceeds threshold ${thresholds.maxP99Ms}ms`);
  }
  if (!postLoadReadinessPassed) {
    reasons.push('post-load readiness check did not pass');
  }
  if (!integrityPassed) {
    reasons.push('post-load data integrity verification did not pass');
  }

  return { passed: reasons.length === 0, reasons, errorRate };
}

// ---------------------------------------------------------------------
// The remainder of this file is the live-execution path: HTTP calls,
// SQL bootstrap, and orchestration. Nothing below this point is imported
// by the negative-test suite.
// ---------------------------------------------------------------------

function fail(message) {
  console.error(`\n[FAIL] ${message}`);
  console.log('\nV1 PERFORMANCE RELIABILITY CERTIFICATION: FAIL');
  process.exitCode = 1;
}

function connectionParts(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.delete('schema'); // Prisma-only param; psql rejects it.
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

function makeSqlRunner(parts) {
  const env = { ...process.env, PGPASSWORD: parts.password };
  return function sql(query) {
    return execFileSync(
      'psql',
      [
        '-h',
        parts.host,
        '-p',
        parts.port,
        '-U',
        parts.user,
        '-d',
        parts.database,
        '-v',
        'ON_ERROR_STOP=1',
        '-t',
        '-A',
        '-q',
        '-c',
        query,
      ],
      { env, encoding: 'utf8' },
    ).trim();
  };
}

async function fetchWithTimeout(input, init = {}) {
  if (init.signal) {
    return fetch(input, init);
  }

  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MS),
  });
}

async function waitForHealth(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      lastStatus = res.status;
      if (res.status === 200) return true;
    } catch {
      lastStatus = 'unreachable';
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error(`Timed out waiting for ${url} (last status: ${lastStatus})`);
  return false;
}

function cookieHeader(setCookieHeaders) {
  return setCookieHeaders.map((entry) => entry.split(';')[0]).join('; ');
}

function accessTokenFromCookie(cookie) {
  const match = cookie.match(/(?:^|;\\s*)medsphere_access=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function json(res) {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

async function timed(fn) {
  const start = performance.now();
  try {
    const value = await fn();
    return { latencyMs: performance.now() - start, ok: true, value };
  } catch (error) {
    return { latencyMs: performance.now() - start, ok: false, error };
  }
}

async function main() {
  if (!DATABASE_URL) {
    fail('DATABASE_URL is required (synthetic database only).');
    return;
  }

  const dbParts = connectionParts(DATABASE_URL);
  const sql = makeSqlRunner(dbParts);

  // ---- A. Baseline health ----
  console.log('== A. Baseline health ==');
  const liveBefore = await waitForHealth(`${BACKEND}/health/live`, 60_000);
  const readyBefore = await waitForHealth(`${BACKEND}/health/ready`, 60_000);
  if (!liveBefore || !readyBefore) {
    fail('Baseline liveness/readiness did not pass before load; aborting.');
    return;
  }
  try {
    sql('SELECT 1;');
  } catch (error) {
    fail(`PostgreSQL is not reachable: ${error.message}`);
    return;
  }
  console.log(
    '[ok  ] backend live, backend ready (Postgres + Redis, via AuthReadinessService), Postgres directly reachable',
  );

  // ---- Seed deterministic synthetic fixtures ----
  // Exact accepted pattern from scripts/task5-smoke-test.mjs
  // (bootstrapUncreatableFoundationState): direct SQL only for rows no
  // accepted API can create.
  console.log('\n== Seeding deterministic synthetic fixtures ==');
  const runId = randomUUID();
  const ids = {
    tenant: randomUUID(),
    role: randomUUID(),
    provider: randomUUID(),
    product: randomUUID(),
    inventory: randomUUID(),
    batch: randomUUID(),
  };
  const tenantSlug = `perf-cert-${runId.slice(0, 8)}`;
  const adminEmail = `perf-cert-admin-${runId}@example.test`;
  const password = 'Perf-Cert-Synthetic-Password-1!';

  // Large synthetic stock: mutationOperations reservations of 1 unit each
  // must never fail on availability, or a threshold violation would be
  // misattributed to a performance regression rather than a fixture bug.
  const seededStock = PROFILE.mutationOperations * 10;

  sql(
    `INSERT INTO "Tenant" (id, name, slug, "isActive", "selfRegistrationEnabled", "createdAt", "updatedAt")
     VALUES ('${ids.tenant}', 'Perf Cert Tenant', '${tenantSlug}', true, true, now(), now());`,
  );
  sql(
    `INSERT INTO "Role" (id, "tenantId", name, description, type, version, "createdAt", "updatedAt")
     VALUES ('${ids.role}', '${ids.tenant}', 'TENANT_ADMINISTRATOR', 'Built-in tenant authorization administrator', 'SYSTEM', 1, now(), now());`,
  );
  // Same accepted invariant cited in task5-smoke-test.mjs and
  // backup-restore-certification.mjs: TENANT_ADMINISTRATOR always holds
  // every row in "Permission" (migration-authored, not a testing
  // convenience).
  sql(
    `INSERT INTO "RolePermission" (id, "tenantId", "roleId", "permissionId", "createdAt")
     SELECT gen_random_uuid(), '${ids.tenant}', '${ids.role}', id, now() FROM "Permission";`,
  );
  sql(
    `INSERT INTO "Provider" (id, "tenantId", "providerType", "businessName", "ownerName", email, phone, address, city, state, country, "postalCode", latitude, longitude, "isVerified", "isActive", "createdAt", "updatedAt")
     VALUES ('${ids.provider}', '${ids.tenant}', 'PHARMACY', 'Perf Cert Pharmacy', 'Perf Cert Owner', 'perf-cert-provider-${runId}@example.test', '0000000000', 'Synthetic Address', 'Chennai', 'Tamil Nadu', 'India', '600001', 13.0827, 80.2707, true, true, now(), now());`,
  );
  sql(
    `INSERT INTO "Product" (id, name, brand, category, manufacturer, "dosageForm", strength, "requiresPrescription", "isActive", "createdAt", "updatedAt")
     VALUES ('${ids.product}', 'Perf Cert Paracetamol', 'Synthetic Brand', 'MEDICINE', 'Synthetic Manufacturer', 'TABLET', '500 mg', false, true, now(), now());`,
  );
  sql(
    `INSERT INTO "Inventory" (id, "tenantId", "providerId", "productId", sku, "sellingPrice", mrp, "discountPercentage", "taxPercentage", "minimumStockLevel", "isVisible", version, "createdAt", "updatedAt")
     VALUES ('${ids.inventory}', '${ids.tenant}', '${ids.provider}', '${ids.product}', 'PERF-CERT-SKU', 25.00, 30.00, 0.00, 5.00, 10, true, 1, now(), now());`,
  );
  sql(
    `INSERT INTO "Batch" (id, "tenantId", "inventoryId", "providerId", "productId", "batchNumber", "manufacturingDate", "expiryDate", "receivedQuantity", "onHandQuantity", "heldQuantity", "purchasePrice", "sellingPrice", status, version, "createdAt", "updatedAt")
     VALUES ('${ids.batch}', '${ids.tenant}', '${ids.inventory}', '${ids.provider}', '${ids.product}', 'PERF-CERT-BATCH', '2026-01-01', '2028-01-01', ${seededStock}, ${seededStock}, 0, 20.00, 25.00, 'ACTIVE', 1, now(), now());`,
  );
  console.log(`[ok  ] tenant ${tenantSlug}, seeded stock ${seededStock} units`);

  // Register through the real accepted API (proven contract, see
  // scripts/task5-smoke-test.mjs), then activate via the same documented
  // bootstrap-only workaround already recorded there: no accepted
  // self-service verification path exists yet (Batch 2 Task 2 finding).
  const phoneDigits = randomUUID().replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
  const phone = `+91${phoneDigits[0] === '0' ? '9' : phoneDigits[0]}${phoneDigits.slice(1)}`;
  const registerRes = await fetchWithTimeout(`${FRONTEND}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: FRONTEND },
    body: JSON.stringify({
      tenantSlug,
      email: adminEmail,
      password,
      firstName: 'Perf',
      lastName: 'Cert',
      phone,
    }),
  });
  if (registerRes.status !== 202) {
    fail(`Synthetic admin registration failed: status ${registerRes.status}`);
    return;
  }
  const adminUserId = sql(`SELECT id FROM "User" WHERE email = '${adminEmail}';`);
  const membershipId = sql(
    `UPDATE "TenantMembership" tm SET status = 'ACTIVE', "joinedAt" = now()
     FROM "User" u WHERE tm."userId" = u.id AND u.email = '${adminEmail}' AND tm."tenantId" = '${ids.tenant}'
     RETURNING tm.id;`,
  );
  sql(`UPDATE "User" SET status = 'ACTIVE', "updatedAt" = now() WHERE email = '${adminEmail}';`);
  sql(
    `INSERT INTO "MembershipRole" (id, "tenantId", "membershipId", "roleId")
     VALUES (gen_random_uuid(), '${ids.tenant}', '${membershipId}', '${ids.role}');`,
  );

  const loginRes = await fetchWithTimeout(`${FRONTEND}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: FRONTEND },
    body: JSON.stringify({ tenantSlug, email: adminEmail, password }),
  });
  if (loginRes.status !== 200) {
    fail(`Synthetic admin login failed: status ${loginRes.status}`);
    return;
  }
  const cookie = cookieHeader(loginRes.headers.getSetCookie?.() ?? []);
  const accessToken = accessTokenFromCookie(cookie);
  if (!accessToken) {
    fail('Synthetic admin login did not provide an access token cookie.');
    return;
  }

  const providerAccessRes = await fetchWithTimeout(
    `${BACKEND}/authorization/memberships/${membershipId}/provider-access/${ids.provider}`,
    {
      method: 'PUT',
      headers: { authorization: `Bearer ${accessToken}` },
    },
  );
  if (!providerAccessRes.ok) {
    fail(`Synthetic provider-access grant failed: status ${providerAccessRes.status}`);
    return;
  }

  console.log(
    '[ok  ] synthetic admin registered, activated, logged in, and granted provider access via accepted APIs',
  );

  // ---- Read-operation pool (category B) ----
  const readOperations = [
    () => fetchWithTimeout(`${FRONTEND}/dashboard`, { headers: { cookie }, redirect: 'manual' }),
    () => fetchWithTimeout(`${FRONTEND}/api/authorization/catalogue`, { headers: { cookie } }),
    () =>
      fetchWithTimeout(
        `${FRONTEND}/api/inventory/stock?providerId=${ids.provider}&limit=10&offset=0`,
        {
          headers: { cookie },
        },
      ),
    () =>
      fetchWithTimeout(
        `${FRONTEND}/api/public/providers/${ids.provider}/medicine-search?q=Paracetamol&limit=10&offset=0`,
      ),
  ];

  async function runReadOperation(index) {
    const operation = readOperations[index % readOperations.length];
    const timing = await timed(async () => {
      const res = await operation();
      // Dashboard responds 200 (authenticated shell); every other read
      // responds 200. A non-2xx response is a failed operation, not a
      // thrown exception, so it is counted, not silently swallowed.
      return res.status;
    });
    const success = timing.ok && timing.value >= 200 && timing.value < 300;
    return {
      latencyMs: timing.latencyMs,
      success,
      detail: timing.ok ? timing.value : String(timing.error),
    };
  }

  async function runMutationOperation(index) {
    const timing = await timed(async () => {
      const res = await fetchWithTimeout(
        `${FRONTEND}/api/inventory/providers/${ids.provider}/reservations`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: FRONTEND, cookie },
          body: JSON.stringify({
            subjectUserId: adminUserId,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            items: [{ productId: ids.product, quantity: 1 }],
            idempotencyKey: `perf-cert-${runId}-${index}`,
          }),
        },
      );
      const body = await json(res);
      return { status: res.status, body };
    });
    const success =
      timing.ok && timing.value.status === 200 && timing.value.body?.status === 'PENDING';
    return {
      latencyMs: timing.latencyMs,
      success,
      detail: timing.ok ? timing.value.status : String(timing.error),
    };
  }

  // ---- Warm-up (discarded from certified measurements) ----
  console.log('\n== Warm-up (not part of certified measurements) ==');
  await runWorkerPool(
    Array.from({ length: PROFILE.warmupOperations }, (_, i) => i),
    PROFILE.warmupWorkers,
    runReadOperation,
  );
  console.log(`[ok  ] ${PROFILE.warmupOperations} warm-up read operations completed`);

  // ---- B. Controlled concurrent authenticated read traffic ----
  console.log(
    `\n== B. Read traffic: ${PROFILE.readOperations} operations, ${PROFILE.certificationWorkers} concurrent workers ==`,
  );
  const certificationStart = performance.now();
  const readResults = await runWorkerPool(
    Array.from({ length: PROFILE.readOperations }, (_, i) => i),
    PROFILE.certificationWorkers,
    runReadOperation,
  );

  // ---- C. Controlled concurrent mutation traffic ----
  console.log(
    `\n== C. Mutation traffic (reservation creation): ${PROFILE.mutationOperations} operations, ${PROFILE.certificationWorkers} concurrent workers ==`,
  );
  const mutationResults = await runWorkerPool(
    Array.from({ length: PROFILE.mutationOperations }, (_, i) => i),
    PROFILE.certificationWorkers,
    runMutationOperation,
  );
  const certificationElapsedMs = performance.now() - certificationStart;

  // ---- E. Measurements ----
  const allOutcomes = [...readResults, ...mutationResults].map((r) =>
    r.ok ? r.value : { latencyMs: 0, success: false, detail: String(r.error) },
  );
  const totalOperations = allOutcomes.length;
  const successfulOperations = allOutcomes.filter((o) => o.success).length;
  const failedOperations = totalOperations - successfulOperations;
  const latencies = allOutcomes.map((o) => o.latencyMs);
  const stats = computeStats(latencies);
  const throughputOpsPerSecond =
    certificationElapsedMs === 0 ? 0 : (totalOperations / certificationElapsedMs) * 1000;

  console.log('\n== E. Measurements ==');
  console.log(`totalOperations=${totalOperations}`);
  console.log(`successfulOperations=${successfulOperations}`);
  console.log(`failedOperations=${failedOperations}`);
  console.log(`totalDurationMs=${certificationElapsedMs.toFixed(1)}`);
  if (failedOperations > 0) {
    const sample = allOutcomes.filter((o) => !o.success).slice(0, 5);
    console.log(`sample failure detail: ${JSON.stringify(sample.map((s) => s.detail))}`);
  }

  // ---- G. Post-load reliability ----
  console.log('\n== G. Post-load reliability ==');
  const liveAfter = await waitForHealth(`${BACKEND}/health/live`, 30_000);
  const readyAfter = await waitForHealth(`${BACKEND}/health/ready`, 30_000);
  const postLoadReadinessPassed = liveAfter && readyAfter;
  console.log(
    `[${postLoadReadinessPassed ? 'ok  ' : 'FAIL'}] post-load liveness=${liveAfter}, readiness (Postgres+Redis)=${readyAfter}`,
  );

  let postgresReachableAfter = false;
  try {
    sql('SELECT 1;');
    postgresReachableAfter = true;
  } catch {
    postgresReachableAfter = false;
  }
  console.log(
    `[${postgresReachableAfter ? 'ok  ' : 'FAIL'}] PostgreSQL directly reachable after load`,
  );

  // ---- Data integrity ----
  const createdReservationCount = Number(
    sql(`SELECT count(*) FROM "MedicineReservation" WHERE "tenantId" = '${ids.tenant}';`),
  );
  const duplicateIdempotencyKeys = Number(
    sql(
      `SELECT count(*) FROM (
         SELECT "idempotencyKey" FROM "MedicineReservation"
         WHERE "tenantId" = '${ids.tenant}'
         GROUP BY "idempotencyKey" HAVING count(*) > 1
       ) dup;`,
    ),
  );
  const crossTenantLeak = Number(
    sql(
      `SELECT count(*) FROM "MedicineReservation"
       WHERE "idempotencyKey" LIKE 'perf-cert-${runId}-%' AND "tenantId" != '${ids.tenant}';`,
    ),
  );
  const nonPendingCount = Number(
    sql(
      `SELECT count(*) FROM "MedicineReservation"
       WHERE "tenantId" = '${ids.tenant}' AND status != 'PENDING';`,
    ),
  );
  const successfulMutations = mutationResults.filter((r) => r.ok && r.value.success).length;
  const reservationCountMatches = createdReservationCount === successfulMutations;

  const integrityChecks = [
    {
      name: 'created reservation count matches successful mutation count',
      ok: reservationCountMatches,
      detail: `expected ${successfulMutations}, found ${createdReservationCount}`,
    },
    {
      name: 'no duplicate idempotency keys (retry/concurrency safety)',
      ok: duplicateIdempotencyKeys === 0,
      detail: `${duplicateIdempotencyKeys} duplicate groups`,
    },
    {
      name: 'no cross-tenant reservation persistence',
      ok: crossTenantLeak === 0,
      detail: `${crossTenantLeak} rows`,
    },
    {
      name: 'no stuck/unexpected-status reservations',
      ok: nonPendingCount === 0,
      detail: `${nonPendingCount} non-PENDING rows`,
    },
  ];
  console.log('\n== Data integrity ==');
  for (const check of integrityChecks) {
    console.log(`[${check.ok ? 'ok  ' : 'FAIL'}] ${check.name} -- ${check.detail}`);
  }
  let integrityPassed = integrityChecks.every((c) => c.ok);

  // ---- Cleanup / evidence-safe tombstoning ----
  let cleanupPassed = true;
  try {
    // Mutable workload data can be removed. AuditEvent and OutboxEvent are
    // intentionally retained as immutable evidence and keep their actor
    // membership/tenant lineage.
    sql(`DELETE FROM "MedicineReservationAllocation" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "MedicineReservationItem" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "MedicineReservationCommand" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "MedicineReservation" WHERE "tenantId" = '${ids.tenant}';`);

    sql(`DELETE FROM "MembershipProviderAccess" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "UserSession" WHERE "tenantId" = '${ids.tenant}';`);

    sql(`DELETE FROM "Batch" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "Inventory" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "Product" WHERE id = '${ids.product}';`);

    sql(`DELETE FROM "MembershipRole" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "RolePermission" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "Role" WHERE "tenantId" = '${ids.tenant}';`);
    sql(`DELETE FROM "Provider" WHERE "tenantId" = '${ids.tenant}';`);

    // Immutable evidence references the actor membership and tenant, so retain
    // only the minimum lineage in a permanently inactive state.
    sql(`UPDATE "TenantMembership"
         SET status = 'REVOKED', "endedAt" = now(), "updatedAt" = now()
         WHERE "tenantId" = '${ids.tenant}';`);

    sql(`UPDATE "User"
         SET status = 'INACTIVE', "passwordHash" = NULL, phone = NULL, "updatedAt" = now()
         WHERE email = '${adminEmail}';`);

    sql(`UPDATE "Tenant"
         SET "isActive" = false, "selfRegistrationEnabled" = false, "updatedAt" = now()
         WHERE id = '${ids.tenant}';`);

    const mutableResiduals = Number(
      sql(`SELECT
        (SELECT count(*) FROM "MedicineReservation" WHERE "tenantId" = '${ids.tenant}') +
        (SELECT count(*) FROM "MedicineReservationItem" WHERE "tenantId" = '${ids.tenant}') +
        (SELECT count(*) FROM "MedicineReservationAllocation" WHERE "tenantId" = '${ids.tenant}') +
        (SELECT count(*) FROM "MembershipProviderAccess" WHERE "tenantId" = '${ids.tenant}') +
        (SELECT count(*) FROM "Batch" WHERE "tenantId" = '${ids.tenant}') +
        (SELECT count(*) FROM "Inventory" WHERE "tenantId" = '${ids.tenant}') +
        (SELECT count(*) FROM "Provider" WHERE "tenantId" = '${ids.tenant}');`),
    );

    if (mutableResiduals !== 0) {
      throw new Error(`mutable synthetic rows remain after cleanup: ${mutableResiduals}`);
    }

    console.log(
      '\n[ok  ] mutable synthetic workload cleaned; immutable audit/outbox lineage safely retained and deactivated',
    );
  } catch (error) {
    cleanupPassed = false;
    console.log(`\n[FAIL] cleanup encountered an error: ${error.message}`);
  }

  integrityPassed = integrityPassed && cleanupPassed;

  // ---- F. Thresholds + final verdict ----
  const certification = evaluateCertification({
    totalOperations,
    successfulOperations,
    failedOperations,
    stats,
    postLoadReadinessPassed: postLoadReadinessPassed && postgresReachableAfter,
    integrityPassed,
  });

  console.log('\nPERFORMANCE CERTIFICATION');
  console.log(`totalOperations=${totalOperations}`);
  console.log(`successfulOperations=${successfulOperations}`);
  console.log(`failedOperations=${failedOperations}`);
  console.log(`errorRate=${(certification.errorRate * 100).toFixed(2)}%`);
  console.log(`totalDurationMs=${certificationElapsedMs.toFixed(1)}`);
  console.log(`throughputOpsPerSecond=${throughputOpsPerSecond.toFixed(2)}`);
  console.log(`averageLatencyMs=${stats.averageMs.toFixed(1)}`);
  console.log(`p50LatencyMs=${stats.p50Ms.toFixed(1)}`);
  console.log(`p95LatencyMs=${stats.p95Ms.toFixed(1)}`);
  console.log(`p99LatencyMs=${stats.p99Ms.toFixed(1)}`);
  console.log(`maxLatencyMs=${stats.maxMs.toFixed(1)}`);
  console.log(
    `postLoadReadiness=${postLoadReadinessPassed && postgresReachableAfter ? 'PASS' : 'FAIL'}`,
  );
  console.log(`integrity=${integrityPassed ? 'PASS' : 'FAIL'}`);

  if (certification.passed) {
    console.log('\nV1 PERFORMANCE RELIABILITY CERTIFICATION: PASS');
    process.exitCode = 0;
  } else {
    for (const reason of certification.reasons) {
      console.error(`[FAIL] ${reason}`);
    }
    console.log('\nV1 PERFORMANCE RELIABILITY CERTIFICATION: FAIL');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    fail(`Unexpected error: ${error.stack ?? error.message}`);
  });
}
