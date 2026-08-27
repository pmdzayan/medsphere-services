import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  computeStats,
  evaluateCertification,
  percentile,
  runWorkerPool,
  THRESHOLDS,
} from './v1-performance-certification.mjs';

// ---------------------------------------------------------------------
// 1. Percentile calculation correctness.
// ---------------------------------------------------------------------
test('percentile: nearest-rank over a known sorted array', () => {
  const sorted = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 95), 95);
  assert.equal(percentile(sorted, 99), 99);
  assert.equal(percentile(sorted, 100), 100);
  assert.equal(percentile(sorted, 1), 1);
});

test('percentile: small array (10 elements)', () => {
  const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(sorted, 50), 50);
  assert.equal(percentile(sorted, 90), 90);
  assert.equal(percentile(sorted, 99), 100); // nearest-rank rounds up
});

test('percentile: empty array returns 0, never throws', () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([], 99), 0);
});

test('computeStats: known latency set produces correct average/percentiles/max', () => {
  const stats = computeStats([100, 200, 300, 400, 500]);
  assert.equal(stats.count, 5);
  assert.equal(stats.averageMs, 300);
  assert.equal(stats.p50Ms, 300);
  assert.equal(stats.maxMs, 500);
});

test('computeStats: unsorted input is sorted before percentile calculation', () => {
  const stats = computeStats([500, 100, 300, 200, 400]);
  assert.equal(stats.p50Ms, 300);
  assert.equal(stats.maxMs, 500);
});

test('computeStats: empty input never throws and reports zero', () => {
  const stats = computeStats([]);
  assert.equal(stats.count, 0);
  assert.equal(stats.averageMs, 0);
  assert.equal(stats.maxMs, 0);
});

// ---------------------------------------------------------------------
// 2. A threshold violation fails certification.
// ---------------------------------------------------------------------
test('evaluateCertification: passes when every metric is within threshold', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 200,
    failedOperations: 0,
    stats: { p95Ms: 500, p99Ms: 800 },
    postLoadReadinessPassed: true,
    integrityPassed: true,
  });
  assert.equal(result.passed, true);
  assert.deepEqual(result.reasons, []);
});

test('evaluateCertification: p95 above threshold fails', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 200,
    failedOperations: 0,
    stats: { p95Ms: THRESHOLDS.maxP95Ms + 1, p99Ms: 800 },
    postLoadReadinessPassed: true,
    integrityPassed: true,
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes('p95 latency')));
});

test('evaluateCertification: p99 above threshold fails', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 200,
    failedOperations: 0,
    stats: { p95Ms: 500, p99Ms: THRESHOLDS.maxP99Ms + 1 },
    postLoadReadinessPassed: true,
    integrityPassed: true,
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes('p99 latency')));
});

// ---------------------------------------------------------------------
// 3. Excessive error rate fails.
// ---------------------------------------------------------------------
test('evaluateCertification: error rate exactly at threshold passes', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 198,
    failedOperations: 2, // exactly 1%
    stats: { p95Ms: 500, p99Ms: 800 },
    postLoadReadinessPassed: true,
    integrityPassed: true,
  });
  assert.equal(result.passed, true);
});

test('evaluateCertification: error rate above threshold fails', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 190,
    failedOperations: 10, // 5%
    stats: { p95Ms: 500, p99Ms: 800 },
    postLoadReadinessPassed: true,
    integrityPassed: true,
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes('error rate')));
});

test('evaluateCertification: zero total operations is always a failure, never a false-fast-pass', () => {
  const result = evaluateCertification({
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    stats: { p95Ms: 0, p99Ms: 0 },
    postLoadReadinessPassed: true,
    integrityPassed: true,
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes('no operations')));
});

test('evaluateCertification: mismatched success+failure vs total is caught', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 150,
    failedOperations: 10, // 150 + 10 !== 200
    stats: { p95Ms: 500, p99Ms: 800 },
    postLoadReadinessPassed: true,
    integrityPassed: true,
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes('do not reconcile')));
});

// ---------------------------------------------------------------------
// 4. Post-load readiness failure fails.
// ---------------------------------------------------------------------
test('evaluateCertification: post-load readiness failure fails even with perfect metrics', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 200,
    failedOperations: 0,
    stats: { p95Ms: 10, p99Ms: 20 },
    postLoadReadinessPassed: false,
    integrityPassed: true,
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes('readiness')));
});

test('evaluateCertification: integrity failure fails even with perfect metrics', () => {
  const result = evaluateCertification({
    totalOperations: 200,
    successfulOperations: 200,
    failedOperations: 0,
    stats: { p95Ms: 10, p99Ms: 20 },
    postLoadReadinessPassed: true,
    integrityPassed: false,
  });
  assert.equal(result.passed, false);
  assert.ok(result.reasons.some((r) => r.includes('integrity')));
});

// ---------------------------------------------------------------------
// 5. Malformed/missing required configuration fails closed.
// ---------------------------------------------------------------------
test('the live script fails closed with a clear message when DATABASE_URL is missing', () => {
  const result = spawnSync(process.execPath, ['scripts/v1-performance-certification.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: '' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DATABASE_URL is required/);
  assert.match(result.stdout, /V1 PERFORMANCE RELIABILITY CERTIFICATION: FAIL/);
});

// ---------------------------------------------------------------------
// Worker pool: proves genuine bounded concurrency, not a sequential loop.
// ---------------------------------------------------------------------
test('runWorkerPool: never exceeds the requested concurrency', async () => {
  let active = 0;
  let maxActive = 0;
  const tasks = Array.from({ length: 20 }, (_, i) => i);
  await runWorkerPool(tasks, 4, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return true;
  });
  assert.ok(maxActive <= 4, `expected max 4 concurrent, saw ${maxActive}`);
  assert.ok(maxActive > 1, 'expected genuine overlap, not a sequential loop');
});

test('runWorkerPool: preserves per-task outcome including failures, in task order', async () => {
  const tasks = [1, 2, 3, 4];
  const results = await runWorkerPool(tasks, 2, async (n) => {
    if (n === 3) throw new Error('synthetic failure');
    return n * 10;
  });
  assert.equal(results.length, 4);
  assert.deepEqual(
    results.map((r) => r.ok),
    [true, true, false, true],
  );
  assert.equal(results[0].value, 10);
  assert.equal(results[2].error.message, 'synthetic failure');
});

test('runWorkerPool: handles an empty task list without hanging', async () => {
  const results = await runWorkerPool([], 5, async () => 1);
  assert.deepEqual(results, []);
});
