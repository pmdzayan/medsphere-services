// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

const validListResponse = {
  items: [],
  nextCursor: null,
};

const VALID_EVENT = {
  id: '11111111-1111-4111-8111-111111111111',
  eventType: 'RESERVATION_STATUS_CHANGED',
  title: 'Reservation confirmed',
  summary: 'Your reservation was confirmed.',
  destinationType: 'NONE',
  destinationId: null,
  occurredAt: new Date('2027-01-01T00:00:00.000Z').toISOString(),
  createdAt: new Date('2027-01-01T00:05:00.000Z').toISOString(),
};

describe('patient timeline BFF boundary (candidate Task 0037)', () => {
  it('rejects a request missing the access-session cookie without contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(new NextRequest('http://localhost/api/patient/timeline'));
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards a valid request upstream and preserves no-store on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validListResponse));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request(''));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never exposes an access/refresh token in the response body or headers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(validListResponse)));
    const response = await GET(request(''));
    const bodyText = await response.text();
    expect(bodyText).not.toContain('access-secret');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('accepts a single valid cursor query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validListResponse));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('cursor=abc123'));
    expect(response.status).toBe(200);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('cursor=abc123');
  });

  it('rejects a duplicate cursor query parameter before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('cursor=abc&cursor=def'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'recipientUserId=x',
    'patientId=x',
    'userId=x',
    'tenantId=x',
    'membershipId=x',
    'foo=bar',
  ])(
    'rejects an unknown/unexpected query key (%s) before contacting upstream -- never forwarded',
    async (query) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty cursor value before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('cursor='));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an oversized cursor before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request(`cursor=${'x'.repeat(500)}`));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts no query parameters at all', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validListResponse));
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request(''));
    expect(response.status).toBe(200);
  });

  it('accepts a valid response containing a real event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ items: [VALID_EVENT], nextCursor: null })),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
  });

  it('rejects malformed upstream JSON with a 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json{{{', { status: 200 })));
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a malformed response shape with a 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ wrong: 'shape' })));
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a response with unexpected extra keys with a 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...validListResponse, extra: 'leak' })),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a response containing an invalid UUID with a 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ items: [{ ...VALID_EVENT, id: 'not-a-uuid' }], nextCursor: null }),
        ),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a response containing an invalid timestamp with a 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          items: [{ ...VALID_EVENT, occurredAt: 'not-a-date' }],
          nextCursor: null,
        }),
      ),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a response containing an invalid destination pairing with a 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          items: [{ ...VALID_EVENT, destinationType: 'NONE', destinationId: 'should-be-null' }],
          nextCursor: null,
        }),
      ),
    );
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('rejects a response with 51 items with a 502', async () => {
    const items = Array.from({ length: 51 }, (_, i) => ({
      ...VALID_EVENT,
      id: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ items, nextCursor: null })));
    const response = await GET(request(''));
    expect(response.status).toBe(502);
  });

  it('reports a genuine network/fetch failure as 503, not 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')));
    const response = await GET(request(''));
    expect(response.status).toBe(503);
  });

  it('maps an unexpected upstream 5xx to 502', async () => {
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

  it('returns a bounded generic message, never the raw upstream body text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('Internal stack trace: something.internal.leak', { status: 500 }),
        ),
    );
    const response = await GET(request(''));
    const body = await response.json();
    expect(body.message).not.toContain('stack trace');
    expect(body.message).not.toContain('internal.leak');
  });

  it('applies no-store on an error response as well as on success', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request('foo=bar'));
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/patient/timeline?${query}`, {
    headers: { cookie: 'medsphere_access=access-secret' },
  });
}
