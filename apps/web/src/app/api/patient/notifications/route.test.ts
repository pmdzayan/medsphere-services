// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

const validListResponse = {
  items: [],
  nextCursor: null,
  unreadCount: 0,
};

describe('patient notifications list BFF boundary (candidate Task 0036)', () => {
  it('rejects an unauthenticated request without contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(new NextRequest('http://localhost/api/patient/notifications'));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a valid request and preserves private no-store', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validListResponse));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('unreadOnly=true'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('unreadOnly=true');
  });

  it.each([
    'userId=attacker',
    'recipientUserId=attacker',
    'tenantId=attacker',
    'membershipId=attacker',
    'foo=bar',
  ])('rejects an unexpected query key (%s) before contacting upstream', async (query) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a duplicate query parameter before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('cursor=abc&cursor=def'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['banana', '1', '0', 'TRUE', ''])(
    'rejects a malformed unreadOnly value (%s) before contacting upstream',
    async (value) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const response = await GET(request(`unreadOnly=${value}`));
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects a malformed notification response with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [], nextCursor: null, unreadCount: -1 })),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a response with an extra top-level field with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...validListResponse, extra: 'leak' })),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a response with more than 50 items with 502', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
      category: 'ACCOUNT',
      title: 'x',
      message: 'y',
      destinationType: 'NONE',
      destinationId: null,
      readAt: null,
      createdAt: new Date().toISOString(),
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items, nextCursor: null, unreadCount: 0 })),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects an unsafe unreadCount (non-integer / negative / unsafe) with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ items: [], nextCursor: null, unreadCount: Number.MAX_SAFE_INTEGER + 1 }),
        ),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('reports a genuine network failure as 503, not 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')));
    const response = await GET(request(''));
    expect(response.status).toBe(503);
  });

  it('maps an upstream 5xx to 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it.each([400, 401, 403, 404])(
    'preserves an upstream %i as the same bounded status',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status })));
      const response = await GET(request(''));
      expect(response.status).toBe(status);
    },
  );
});

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/patient/notifications?${query}`, {
    headers: { cookie: 'medsphere_access=access-secret' },
  });
}
