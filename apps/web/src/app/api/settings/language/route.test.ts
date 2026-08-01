// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('preferred language BFF boundary', () => {
  it('rejects cross-origin mutations before using credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await PATCH(request({ preferredLanguage: 'ta' }, 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported or over-broad language requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const unsupported = await PATCH(request({ preferredLanguage: 'ar' }));
    const overBroad = await PATCH(request({ preferredLanguage: 'en', userId: 'foreign' }));

    expect(unsupported.status).toBe(400);
    expect(overBroad.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards and validates an accepted language update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: 'Language updated' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await PATCH(request({ preferredLanguage: 'kn' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'Language updated' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me/language');
    expect(init.body).toBe(JSON.stringify({ preferredLanguage: 'kn' }));
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('rejects malformed successful upstream responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: '', userId: 'x' })));

    expect((await PATCH(request({ preferredLanguage: 'en' }))).status).toBe(502);
  });
});

function request(
  body: unknown,
  origin = 'http://localhost',
  cookie = 'medsphere_access=access-secret',
): NextRequest {
  return new NextRequest('http://localhost/api/settings/language', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify(body),
  });
}
