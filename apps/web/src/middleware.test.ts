import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { WEB_CLIENT_GENERATION_COOKIE } from './lib/client-version-policy';
import { enforceMinimumWebClient } from './middleware';

function request(cookie?: string, browser = true): NextRequest {
  const headers = new Headers();
  if (browser) {
    headers.set('sec-fetch-site', 'same-origin');
    headers.set('sec-fetch-mode', 'cors');
  }
  if (cookie) headers.set('cookie', `${WEB_CLIENT_GENERATION_COOKIE}=${cookie}`);
  return new NextRequest('https://aim.example/api/inventory/providers', { headers });
}

describe('UM14.5 minimum-supported-client middleware', () => {
  const environment = { AIM_WEB_MIN_CLIENT_GENERATION: '3' };

  it('returns 426 for missing, invalid or outdated browser generation', async () => {
    for (const candidate of [undefined, 'latest', '2']) {
      const response = enforceMinimumWebClient(request(candidate), environment);
      expect(response.status).toBe(426);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-aim-min-client-generation')).toBe('3');
      await expect(response.json()).resolves.toMatchObject({
        code: 'AIM_CLIENT_UPDATE_REQUIRED',
        minimumClientGeneration: 3,
      });
    }
  });

  it('allows supported browser generation', () => {
    expect(enforceMinimumWebClient(request('3'), environment).status).toBe(200);
    expect(enforceMinimumWebClient(request('4'), environment).status).toBe(200);
  });

  it('fails safely when minimum-generation configuration is malformed', async () => {
    const response = enforceMinimumWebClient(request('3'), {
      AIM_WEB_MIN_CLIENT_GENERATION: 'not-a-generation',
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AIM_CLIENT_POLICY_UNAVAILABLE',
    });
  });

  it('does not reinterpret non-browser service calls as web client compatibility', () => {
    expect(enforceMinimumWebClient(request(undefined, false), environment).status).toBe(200);
  });
});
