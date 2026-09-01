// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH } from './route';

const privacy = {
  sharePhone: false,
  shareEmail: false,
  allowInAppChat: true,
  privatePickup: false,
  hideSensitiveNotifications: true,
  wantsReservationNotifications: false,
  wantsOperationalAlerts: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('privacy settings BFF boundary', () => {
  it('requires an authenticated access cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await GET(request())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads and validates the bounded privacy response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(privacy));
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(request(undefined, { cookie: 'medsphere_access=access-secret' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(privacy);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('rejects malformed successful privacy data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...privacy, userId: 'leak' })),
    );

    const response = await GET(request(undefined, { cookie: 'medsphere_access=access-secret' }));

    expect(response.status).toBe(502);
  });

  it('rejects cross-origin and over-broad mutations before forwarding credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const crossOrigin = await PATCH(
      request({ privatePickup: true }, { origin: 'https://attacker.example' }),
    );
    const overBroad = await PATCH(
      request(
        { privatePickup: true, userId: 'foreign' },
        { cookie: 'medsphere_access=access-secret' },
      ),
    );

    expect(crossOrigin.status).toBe(403);
    expect(overBroad.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the accepted privacy patch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ...privacy, privatePickup: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await PATCH(
      request({ privatePickup: true }, { cookie: 'medsphere_access=access-secret' }),
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me/privacy');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ privatePickup: true }));
  });
});

function request(body?: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/settings/privacy', {
    method: body === undefined ? 'GET' : 'PATCH',
    headers: {
      ...(body === undefined
        ? {}
        : { 'content-type': 'application/json', origin: 'http://localhost' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
