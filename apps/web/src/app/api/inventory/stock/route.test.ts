// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validProviders, validStockPage } from '@/test/inventory-fixtures';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('provider stock BFF boundary', () => {
  it('forwards only validated stock filters and preserves no-store privacy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validStockPage));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      request(`providerId=${validProviders[0].providerId}&query=metformin&limit=25&offset=0`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      `/providers/${validProviders[0].providerId}/stock?query=metformin&limit=25&offset=0`,
    );
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it.each([
    'providerId=not-a-uuid',
    `providerId=${validProviders[0].providerId}&tenantId=attacker`,
    `providerId=${validProviders[0].providerId}&limit=1&limit=2`,
    `providerId=${validProviders[0].providerId}&limit=1.5`,
    `providerId=${validProviders[0].providerId}&offset=10001`,
  ])('rejects invalid or over-broad query %s before forwarding', async (query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(request(query))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the HTTP-only access credential', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      new NextRequest(
        `http://localhost/api/inventory/stock?providerId=${validProviders[0].providerId}`,
      ),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed upstream data and preserves permission denial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(Response.json({ ...validStockPage, total: -1 })),
    );
    expect((await GET(request(`providerId=${validProviders[0].providerId}`))).status).toBe(502);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ message: 'Provider stock not found' }, { status: 404 }),
        ),
    );
    expect((await GET(request(`providerId=${validProviders[0].providerId}`))).status).toBe(404);
  });
});

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/inventory/stock?${query}`, {
    headers: { cookie: 'medsphere_access=access-secret' },
  });
}
