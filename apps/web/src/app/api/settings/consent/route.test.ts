// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const consentStatus = [
  { category: 'LOCATION_USE', status: null, updatedAt: null },
  { category: 'NOTIFICATIONS_RESERVATIONS', status: null, updatedAt: null },
  { category: 'NOTIFICATIONS_OPERATIONAL', status: null, updatedAt: null },
];

afterEach(() => vi.unstubAllGlobals());

describe('consent settings BFF boundary', () => {
  it('requires an authenticated access cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await GET(request())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads and validates the bounded consent status list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: consentStatus }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(undefined, { cookie: 'medsphere_access=access-secret' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: consentStatus });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('rejects malformed successful consent data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [{ category: 'FOREIGN', status: null }] })),
    );

    const response = await GET(request(undefined, { cookie: 'medsphere_access=access-secret' }));

    expect(response.status).toBe(502);
  });

  it('rejects cross-origin and over-broad mutations before forwarding credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const crossOrigin = await POST(
      request(
        { category: 'LOCATION_USE', status: 'GRANTED', source: 'settings_privacy_page' },
        { origin: 'https://attacker.example' },
      ),
    );
    const overBroad = await POST(
      request(
        {
          category: 'LOCATION_USE',
          status: 'GRANTED',
          source: 'settings_privacy_page',
          userId: 'foreign',
        },
        { cookie: 'medsphere_access=access-secret' },
      ),
    );

    expect(crossOrigin.status).toBe(403);
    expect(overBroad.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the accepted consent mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        category: 'LOCATION_USE',
        status: 'GRANTED',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      request(
        { category: 'LOCATION_USE', status: 'GRANTED', source: 'settings_privacy_page' },
        { cookie: 'medsphere_access=access-secret' },
      ),
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me/consent');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(
      JSON.stringify({
        category: 'LOCATION_USE',
        status: 'GRANTED',
        source: 'settings_privacy_page',
      }),
    );
  });
});

function request(body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/settings/consent', {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined
        ? {}
        : { 'content-type': 'application/json', origin: 'http://localhost' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
