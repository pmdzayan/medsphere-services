// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { validProviders } from '@/test/inventory-fixtures';
import { validReservationPage } from '@/test/reservation-fixtures';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('provider reservations BFF boundary', () => {
  it('forwards only validated filters with the HTTP-only credential', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validReservationPage));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(
      request(`providerId=${validProviders[0].providerId}&status=READY&limit=25&offset=0`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      `/providers/${validProviders[0].providerId}/reservations?limit=25&offset=0&status=READY`,
    );
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it.each([
    'providerId=not-a-uuid',
    `providerId=${validProviders[0].providerId}&tenantId=attacker`,
    `providerId=${validProviders[0].providerId}&status=UNKNOWN`,
    `providerId=${validProviders[0].providerId}&status=READY&status=PENDING`,
    `providerId=${validProviders[0].providerId}&limit=0`,
  ])('rejects invalid or over-broad query %s', async (query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(request(query))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires a session and rejects malformed successful data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (
        await GET(
          new NextRequest(
            `http://localhost/api/inventory/reservations?providerId=${validProviders[0].providerId}`,
          ),
        )
      ).status,
    ).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...validReservationPage, patient: 'leak' })),
    );
    expect((await GET(request(`providerId=${validProviders[0].providerId}`))).status).toBe(502);
  });

  it('preserves concealed not-found and reports transport unavailability', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(Response.json({ message: 'Not found' }, { status: 404 })),
    );
    expect((await GET(request(`providerId=${validProviders[0].providerId}`))).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')));
    expect((await GET(request(`providerId=${validProviders[0].providerId}`))).status).toBe(503);
  });
});

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/inventory/reservations?${query}`, {
    headers: { cookie: 'medsphere_access=access-secret' },
  });
}
