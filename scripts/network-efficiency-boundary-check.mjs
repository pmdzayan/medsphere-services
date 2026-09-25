#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const POLICY_PATH = 'docs/architecture/network-efficiency-budget.json';

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function readRequired(repositoryRoot, relativePath) {
  const absolute = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Required Task 0059 file missing: ${relativePath}`);
  }
  return fs.readFileSync(absolute, 'utf8');
}

function listRouteFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRouteFiles(absolute);
    return entry.name === 'route.ts' ? [absolute] : [];
  });
}

export function loadNetworkBudget(repositoryRoot = DEFAULT_ROOT) {
  const source = readRequired(repositoryRoot, POLICY_PATH);
  const policy = JSON.parse(source);
  validateNetworkBudget(policy);
  return policy;
}

export function validateNetworkBudget(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('Task 0059 network budget must be an object');
  }
  if (policy.schemaVersion !== 1 || policy.task !== '0059') {
    throw new Error('Task 0059 network budget identity is invalid');
  }
  if (policy.principle !== 'privacy-safe-low-bandwidth-by-default') {
    throw new Error('Task 0059 privacy-safe low-bandwidth principle changed');
  }
  if (!Array.isArray(policy.publicRouteBudgets) || policy.publicRouteBudgets.length === 0) {
    throw new Error('Task 0059 must define public-route budgets');
  }
  const seen = new Set();
  for (const budget of policy.publicRouteBudgets) {
    if (
      typeof budget?.path !== 'string' ||
      !budget.path.startsWith('/') ||
      !Number.isInteger(budget.maxColdTransferBytes) ||
      budget.maxColdTransferBytes <= 0 ||
      !Number.isInteger(budget.maxRequests) ||
      budget.maxRequests <= 0 ||
      !Number.isInteger(budget.maxReadyMs) ||
      budget.maxReadyMs <= 0
    ) {
      throw new Error('Task 0059 has an invalid public-route budget');
    }
    if (seen.has(budget.path)) {
      throw new Error(`Task 0059 has a duplicate route budget: ${budget.path}`);
    }
    seen.add(budget.path);
  }
  const network = policy.slowNetworkProfile;
  if (
    !Number.isFinite(network?.latencyMs) ||
    network.latencyMs < 0 ||
    !Number.isFinite(network?.downloadKbps) ||
    network.downloadKbps <= 0 ||
    !Number.isFinite(network?.uploadKbps) ||
    network.uploadKbps <= 0
  ) {
    throw new Error('Task 0059 constrained-mobile profile is invalid');
  }
  if (!Array.isArray(policy.compressionPolicy?.acceptedEncodings)) {
    throw new Error('Task 0059 accepted compression encodings are missing');
  }
  if (policy.requestPolicy?.forbidSharedApiCaching !== true) {
    throw new Error('Task 0059 shared healthcare API caching must remain forbidden');
  }
}

function containsCacheValue(nextConfig, source, cacheValue, alias) {
  const singleDeclaration = `const ${alias} = '${cacheValue}'`;
  const doubleDeclaration = `const ${alias} = "${cacheValue}"`;
  if (!nextConfig.includes(singleDeclaration) && !nextConfig.includes(doubleDeclaration)) {
    return false;
  }

  const singleSource = `source: '${source}'`;
  const doubleSource = `source: "${source}"`;
  const singleIndex = nextConfig.indexOf(singleSource);
  const doubleIndex = nextConfig.indexOf(doubleSource);
  const sourceIndex = singleIndex >= 0 ? singleIndex : doubleIndex;
  if (sourceIndex < 0) return false;

  const block = nextConfig.slice(sourceIndex, sourceIndex + 600);
  return /Cache-Control/i.test(block) && block.includes(`value: ${alias}`);
}

export function findUnsafeApiCacheMarkers(repositoryRoot, policy) {
  const apiRoot = path.join(repositoryRoot, 'apps/web/src/app/api');
  const violations = [];
  const markers = policy.requestPolicy.forbiddenApiMarkers ?? [];

  for (const absolute of listRouteFiles(apiRoot)) {
    const relative = normalize(path.relative(repositoryRoot, absolute));
    const source = fs.readFileSync(absolute, 'utf8');
    for (const marker of markers) {
      if (source.toLowerCase().includes(String(marker).toLowerCase())) {
        violations.push({ file: relative, marker });
      }
    }
  }
  return violations;
}

export function checkNetworkEfficiencyBoundary(repositoryRoot = DEFAULT_ROOT) {
  const policy = loadNetworkBudget(repositoryRoot);
  const failures = [];

  const nextConfig = readRequired(repositoryRoot, 'apps/web/next.config.ts');
  const apiClient = readRequired(repositoryRoot, 'apps/web/src/lib/api-client.ts');
  const serviceWorker = readRequired(repositoryRoot, 'apps/web/public/sw.js');

  if (!/\bcompress\s*:\s*true\b/.test(nextConfig)) {
    failures.push('Next production compression is not explicitly enabled.');
  }

  const publicStatic = policy.cachePolicy.publicStatic;
  for (const source of ['/manifest.webmanifest', '/icon.svg']) {
    if (!containsCacheValue(nextConfig, source, publicStatic, 'PUBLIC_STATIC_CACHE')) {
      failures.push(`Public static cache policy missing for ${source}.`);
    }
  }

  if (
    !containsCacheValue(
      nextConfig,
      '/sw.js',
      policy.cachePolicy.serviceWorker,
      'SERVICE_WORKER_CACHE',
    )
  ) {
    failures.push('Service-worker update cache policy is missing or unsafe.');
  }

  if (
    !serviceWorker.includes("url.pathname.startsWith('/api/')") ||
    !serviceWorker.includes("url.pathname.startsWith('/_next/static/')") ||
    !serviceWorker.includes('PUBLIC_SHELL_ASSETS.has(url.pathname)')
  ) {
    failures.push('Service worker no longer preserves the static-only healthcare cache boundary.');
  }

  if (!/fetch\(url,\s*\{\s*\.\.\.init,\s*cache:\s*['"]no-store['"]\s*\}/s.test(apiClient)) {
    failures.push('Browser API client requestJson no longer defaults to cache: no-store.');
  }

  const unsafeApiCaching = findUnsafeApiCacheMarkers(repositoryRoot, policy);
  for (const violation of unsafeApiCaching) {
    failures.push(
      `Shared/long-lived API caching marker "${violation.marker}" found in ${violation.file}.`,
    );
  }

  return failures;
}

export function run(repositoryRoot = DEFAULT_ROOT) {
  let failures;
  try {
    failures = checkNetworkEfficiencyBoundary(repositoryRoot);
  } catch (error) {
    process.stderr.write(
      `TASK 0059 NETWORK EFFICIENCY BOUNDARY: ERROR: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    return 1;
  }

  if (failures.length === 0) {
    process.stdout.write(
      'TASK 0059 NETWORK EFFICIENCY BOUNDARY: PASS (compression + privacy-safe cache policy)\n',
    );
    return 0;
  }

  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.stderr.write(
    `TASK 0059 NETWORK EFFICIENCY BOUNDARY: FAIL (${failures.length} violation(s))\n`,
  );
  return 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
