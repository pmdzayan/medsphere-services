import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  checkNetworkEfficiencyBoundary,
  findUnsafeApiCacheMarkers,
  validateNetworkBudget,
} from './network-efficiency-boundary-check.mjs';

const temporaryDirectories = [];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-0059-'));
  temporaryDirectories.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return root;
}

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    task: '0059',
    principle: 'privacy-safe-low-bandwidth-by-default',
    baseline: {
      sourceRun: 1,
      observedFirstLoadJsBytes: { '/': 190000 },
      note: 'fixture',
    },
    slowNetworkProfile: {
      name: 'constrained-mobile',
      latencyMs: 150,
      downloadKbps: 1600,
      uploadKbps: 750,
    },
    publicRouteBudgets: [
      { path: '/', maxColdTransferBytes: 450000, maxRequests: 28, maxReadyMs: 10000 },
    ],
    cachePolicy: {
      publicStatic: 'public, max-age=86400, stale-while-revalidate=604800',
      serviceWorker: 'no-cache, no-store, must-revalidate',
      healthcareApi: 'private, no-store',
      rules: [],
    },
    compressionPolicy: {
      requireNextCompression: true,
      acceptedEncodings: ['gzip', 'br', 'zstd'],
      routes: ['/'],
    },
    requestPolicy: {
      browserApiDefault: 'no-store',
      forbidSharedApiCaching: true,
      forbiddenApiMarkers: [
        "cache: 'force-cache'",
        's-maxage',
        "Cache-Control', 'public",
        'revalidate:',
      ],
    },
    ...overrides,
  };
}

function validRepository() {
  const p = policy();
  return fixture({
    'docs/architecture/network-efficiency-budget.json': JSON.stringify(p),
    'apps/web/next.config.ts': `
      const PUBLIC_STATIC_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';
      const SERVICE_WORKER_CACHE = 'no-cache, no-store, must-revalidate';
      export default {
        compress: true,
        async headers() {
          return [
            { source: '/manifest.webmanifest', headers: [{ key: 'Cache-Control', value: PUBLIC_STATIC_CACHE }] },
            { source: '/icon.svg', headers: [{ key: 'Cache-Control', value: PUBLIC_STATIC_CACHE }] },
            { source: '/sw.js', headers: [{ key: 'Cache-Control', value: SERVICE_WORKER_CACHE }] },
          ];
        },
      };
    `,
    'apps/web/src/lib/api-client.ts': `
      async function requestJson(url, init) {
        return fetch(url, { ...init, cache: 'no-store' });
      }
    `,
    'apps/web/public/sw.js': `
      if (url.pathname.startsWith('/api/')) return;
      const isVersionedStaticAsset = url.pathname.startsWith('/_next/static/');
      const isPublicShellAsset = PUBLIC_SHELL_ASSETS.has(url.pathname);
    `,
    'apps/web/src/app/api/example/route.ts': `
      export async function GET() {
        return new Response('{}', { headers: { 'cache-control': 'private, no-store' } });
      }
    `,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Task 0059 network efficiency boundary', () => {
  it('validates the committed policy shape and numeric budgets', () => {
    assert.doesNotThrow(() => validateNetworkBudget(policy()));
    assert.throws(
      () =>
        validateNetworkBudget(
          policy({
            publicRouteBudgets: [
              { path: '/', maxColdTransferBytes: 0, maxRequests: 28, maxReadyMs: 10000 },
            ],
          }),
        ),
      /invalid public-route budget/,
    );
  });

  it('accepts explicit compression, bounded public-static caching, and no-store APIs', () => {
    assert.deepEqual(checkNetworkEfficiencyBoundary(validRepository()), []);
  });

  it('fails when production compression is disabled', () => {
    const root = validRepository();
    const configPath = path.join(root, 'apps/web/next.config.ts');
    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, 'utf8').replace('compress: true', 'compress: false'),
    );
    assert.ok(
      checkNetworkEfficiencyBoundary(root).some((failure) =>
        failure.includes('compression is not explicitly enabled'),
      ),
    );
  });

  it('fails when service-worker code becomes long-lived cached', () => {
    const root = validRepository();
    const configPath = path.join(root, 'apps/web/next.config.ts');
    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, 'utf8').replace(
        'no-cache, no-store, must-revalidate',
        'public, max-age=604800',
      ),
    );
    assert.ok(
      checkNetworkEfficiencyBoundary(root).some((failure) =>
        failure.includes('Service-worker update cache policy'),
      ),
    );
  });

  it('fails when a BFF API route opts into shared/long-lived caching', () => {
    const root = validRepository();
    const routePath = path.join(root, 'apps/web/src/app/api/example/route.ts');
    fs.writeFileSync(
      routePath,
      `
        export async function GET() {
          return fetch('http://upstream', { cache: 'force-cache' });
        }
      `,
    );
    const violations = findUnsafeApiCacheMarkers(root, policy());
    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, 'apps/web/src/app/api/example/route.ts');
  });

  it('fails when the service worker can no longer prove API exclusion', () => {
    const root = validRepository();
    fs.writeFileSync(
      path.join(root, 'apps/web/public/sw.js'),
      `
        const isVersionedStaticAsset = url.pathname.startsWith('/_next/static/');
        const isPublicShellAsset = PUBLIC_SHELL_ASSETS.has(url.pathname);
      `,
    );
    assert.ok(
      checkNetworkEfficiencyBoundary(root).some((failure) =>
        failure.includes('static-only healthcare cache boundary'),
      ),
    );
  });
});
