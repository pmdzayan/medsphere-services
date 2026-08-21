#!/usr/bin/env node
// Simple local smoke check: confirms the backend health endpoint and the
// frontend root both respond. Uses only Node's built-in http module -- no
// new dependency, same convention as scripts/healthcheck.js.

const http = require('node:http');

const BACKEND_URL = process.env.MEDSPHERE_DEV_BACKEND_URL ?? 'http://localhost:3000/health/live';
const FRONTEND_URL = process.env.MEDSPHERE_DEV_FRONTEND_URL ?? 'http://localhost:3001/';
const TIMEOUT_MS = 4000;

function check(name, url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: TIMEOUT_MS }, (res) => {
      res.resume();
      const ok = res.statusCode !== undefined && res.statusCode < 500;
      resolve({ name, url, ok, statusCode: res.statusCode });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ name, url, ok: false, error: 'timed out' });
    });
    req.on('error', (error) => {
      resolve({ name, url, ok: false, error: error.message });
    });
  });
}

async function main() {
  const results = await Promise.all([
    check('backend (auth-service)', BACKEND_URL),
    check('frontend (web)', FRONTEND_URL),
  ]);

  let allOk = true;
  for (const result of results) {
    if (result.ok) {
      console.log(`ok   ${result.name} -> ${result.url} (${result.statusCode})`);
    } else {
      allOk = false;
      console.log(`fail ${result.name} -> ${result.url} (${result.error ?? result.statusCode})`);
    }
  }

  if (!allOk) {
    console.log('');
    console.log('One or more services did not respond. Confirm both are running:');
    console.log('  pnpm --filter @medsphere/auth-service dev');
    console.log('  pnpm --filter @medsphere/web dev');
    process.exit(1);
  }

  console.log('');
  console.log('Local MedSphere stack is up.');
}

main();
