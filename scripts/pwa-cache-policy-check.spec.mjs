import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkPwaCachePolicy } from './pwa-cache-policy-check.mjs';

describe('AIM PWA cache policy', () => {
  it('accepts the committed static-only service-worker policy', () => {
    assert.deepEqual(checkPwaCachePolicy(), []);
  });

  it('fails when the API exclusion is removed', () => {
    const unsafe = `
      if (request.method !== 'GET') return;
      const isVersionedStaticAsset = url.pathname.startsWith('/_next/static/');
      const isPublicShellAsset = PUBLIC_SHELL_ASSETS.has(url.pathname);
    `;
    assert.ok(checkPwaCachePolicy(unsafe).some((failure) => failure.includes('/api/')));
  });

  it('fails when protected route names enter the public shell cache', () => {
    const unsafe = `
      const PUBLIC_SHELL_ASSETS = new Set(['/dashboard']);
      if (request.method !== 'GET') return;
      if (url.pathname.startsWith('/api/')) return;
      const isVersionedStaticAsset = url.pathname.startsWith('/_next/static/');
      const isPublicShellAsset = PUBLIC_SHELL_ASSETS.has(url.pathname);
    `;
    assert.ok(
      checkPwaCachePolicy(unsafe).some((failure) =>
        failure.includes('protected/dynamic healthcare content'),
      ),
    );
  });
});
