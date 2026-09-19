// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('patient notifications mark-all-read BFF boundary (candidate Task 0036)', () => {
  it('rejects a cross-origin request without contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request(undefined, { origin: 'https://attacker.example' }));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request without contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(
      new NextRequest('http://localhost/api/patient/notifications/read-all', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
      }),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts an empty/no body and succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ updatedCount: 3 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedCount: 3 });
  });

  it('rejects an empty-object body "{}" -- this operation has no body contract at all', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request('{}'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only body before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request('   '));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a large body without needing to parse/consume it (presence-only check)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const largeBody = 'x'.repeat(5_000_000);
    const response = await POST(request(largeBody));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    JSON.stringify({ arbitrary: 'json' }),
    JSON.stringify({ userId: 'attacker' }),
    JSON.stringify({ recipientUserId: 'attacker' }),
    JSON.stringify({ tenantId: 'attacker' }),
  ])('rejects an arbitrary body (%s) before contacting upstream', async (body) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never forwards a body upstream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ updatedCount: 0 }));
    vi.stubGlobal('fetch', fetchMock);
    await POST(request());
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it('rejects an unsafe updatedCount with 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ updatedCount: -1 })));
    const response = await POST(request());
    expect(response.status).toBe(502);
  });

  it('rejects an updatedCount exceeding safe-integer bounds with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ updatedCount: Number.MAX_SAFE_INTEGER + 1 })),
    );
    const response = await POST(request());
    expect(response.status).toBe(502);
  });

  it('rejects a response with an extra field with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ updatedCount: 1, extra: 'leak' })),
    );
    const response = await POST(request());
    expect(response.status).toBe(502);
  });

  it('reports a genuine network failure as 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')));
    const response = await POST(request());
    expect(response.status).toBe(503);
  });

  it.each([400, 401, 403])(
    'preserves an upstream %i as the same bounded status',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status })));
      const response = await POST(request());
      expect(response.status).toBe(status);
    },
  );

  it('maps an upstream 5xx to 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const response = await POST(request());
    expect(response.status).toBe(502);
  });
});

function request(body?: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/patient/notifications/read-all', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: 'medsphere_access=access-secret',
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}
