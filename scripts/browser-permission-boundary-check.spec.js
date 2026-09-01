const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const checker = path.resolve(__dirname, 'browser-permission-boundary-check.mjs');

test('accepts the reviewed central boundary and rejects direct or prohibited permission APIs', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'medsphere-permissions-'));
  const sourceRoot = path.join(fixture, 'apps/web/src/lib');
  fs.mkdirSync(sourceRoot, { recursive: true });

  fs.writeFileSync(
    path.join(sourceRoot, 'browser-permissions.ts'),
    'navigator.geolocation; navigator.mediaDevices; navigator.permissions;',
  );
  let result = spawnSync(process.execPath, [checker, fixture], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  fs.writeFileSync(path.join(sourceRoot, 'bypass.ts'), 'navigator.geolocation.getCurrentPosition');
  result = spawnSync(process.execPath, [checker, fixture], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /direct permission API/);

  fs.writeFileSync(path.join(sourceRoot, 'bypass.ts'), 'navigator.contacts.request();');
  result = spawnSync(process.execPath, [checker, fixture], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prohibited V1 API/);

  fs.rmSync(fixture, { recursive: true, force: true });
});
