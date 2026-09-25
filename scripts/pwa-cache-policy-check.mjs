import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceWorkerPath = path.join(root, 'apps/web/public/sw.js');

export function checkPwaCachePolicy(source = fs.readFileSync(serviceWorkerPath, 'utf8')) {
  const failures = [];

  const requiredSnippets = [
    "url.pathname.startsWith('/api/')",
    "url.pathname.startsWith('/_next/static/')",
    'PUBLIC_SHELL_ASSETS.has(url.pathname)',
    "request.method !== 'GET'",
    "event.data?.type === 'SKIP_WAITING'",
    "event.data?.type === 'PURGE_PUBLIC_CACHE'",
  ];

  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) {
      failures.push(`Missing fail-safe service-worker policy: ${snippet}`);
    }
  }

  const forbiddenPatterns = [
    /caches\.match\([^)]*navigate/i,
    /pathname\.startsWith\(['"]\/(?:dashboard|patient|inventory|reservations|audit)/i,
    /PUBLIC_SHELL_ASSETS[^;]*(?:dashboard|patient|inventory|reservation|api)/i,
    /indexedDB/i,
    /localStorage/i,
    /sessionStorage/i,
    /backgroundSync/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      failures.push(
        `Service worker appears to cache protected/dynamic healthcare content: ${pattern}`,
      );
    }
  }

  return failures;
}

export function run() {
  const failures = checkPwaCachePolicy();
  if (failures.length > 0) {
    for (const failure of failures) process.stderr.write(`${failure}\n`);
    return 1;
  }
  process.stdout.write('PWA cache policy: PASS (public/versioned static assets only)\n');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
