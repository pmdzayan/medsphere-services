// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validExpiryWorklistPage, validProviders } from '@/test/inventory-fixtures';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('expiry worklist BFF boundary', () => {
  it('forwards only bounded filters and preserves private no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validExpiryWorklistPage));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      request(`providerId=${validProviders[0].providerId}&horizonDays=30&limit=25&offset=0`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      `/providers/${validProviders[0].providerId}/expiry-worklist?horizonDays=30&limit=25&offset=0`,
    );
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it.each([
    'providerId=not-a-uuid',
    `providerId=${validProviders[0].providerId}&tenantId=attacker`,
    `providerId=${validProviders[0].providerId}&horizonDays=0`,
    `providerId=${validProviders[0].providerId}&horizonDays=366`,
    `providerId=${validProviders[0].providerId}&limit=1&limit=2`,
  ])('rejects invalid or over-broad query %s', async (query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(request(query))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed upstream data and preserves concealed not-found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        Response.json({
          ...validExpiryWorklistPage,
          horizonEndsAt: validExpiryWorklistPage.asOf,
        }),
      ),
    );
    expect((await GET(request(`providerId=${validProviders[0].providerId}`))).status).toBe(502);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(Response.json({ message: 'Not found' }, { status: 404 })),
    );
    expect((await GET(request(`providerId=${validProviders[0].providerId}`))).status).toBe(404);
  });
});

function request(query: string) {
  return new NextRequest(`http://localhost/api/inventory/expiry-worklist?${query}`, {
    headers: { cookie: 'medsphere_access=access-secret' },
  });
}
