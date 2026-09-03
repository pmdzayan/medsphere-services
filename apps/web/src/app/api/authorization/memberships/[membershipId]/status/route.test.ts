// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Web BFF membership status update route', () => {
  it('rejects cross-origin requests with 403', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = createRequest({
      origin: 'https://evil.example.com',
    });

    const response = await PATCH(request, { params: Promise.resolve({ membershipId: 'mem-123' }) });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const request = new NextRequest(
      'http://localhost/api/authorization/memberships/mem-123/status',
      {
        method: 'PATCH',
        headers: {
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ status: 'SUSPENDED' }),
      },
    );

    const response = await PATCH(request, { params: Promise.resolve({ membershipId: 'mem-123' }) });
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid target status with 400', async () => {
    const request = createRequest({}, { status: 'INVALID' });

    const response = await PATCH(request, { params: Promise.resolve({ membershipId: 'mem-123' }) });
    expect(response.status).toBe(400);
  });

  it('forwards Bearer token and status payload upstream safely', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: 'mem-123', status: 'SUSPENDED' }, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request = createRequest(
      {},
      { status: 'SUSPENDED', untrustedExtraField: 'must-not-be-forwarded' },
    );
    const response = await PATCH(request, { params: Promise.resolve({ membershipId: 'mem-123' }) });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/authorization/memberships/mem-123/status');
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer test-access-token');
    expect(init.body).toBe(JSON.stringify({ status: 'SUSPENDED' }));

    const bodyText = await response.text();
    expect(bodyText).not.toContain('test-access-token');
  });

  it.each([400, 403, 404, 409])(
    'preserves allowed upstream membership-status error %i',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(Response.json({ message: `membership-status-${status}` }, { status })),
      );

      const request = createRequest({}, { status: 'SUSPENDED' });
      const response = await PATCH(request, {
        params: Promise.resolve({ membershipId: 'mem-123' }),
      });

      expect(response.status).toBe(status);
      const body = (await response.json()) as { message: string };
      expect(body.message).toBe(`membership-status-${status}`);
    },
  );
});

function createRequest(
  headers: Record<string, string> = {},
  body: unknown = { status: 'SUSPENDED' },
): NextRequest {
  return new NextRequest('http://localhost/api/authorization/memberships/mem-123/status', {
    method: 'PATCH',
    headers: {
      origin: 'http://localhost',
      cookie: 'medsphere_access=test-access-token',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
