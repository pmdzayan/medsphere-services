// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';

afterEach(() => vi.unstubAllGlobals());

const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111';

const validNotification = {
  id: NOTIFICATION_ID,
  category: 'ACCOUNT',
  title: 'Title',
  message: 'Message',
  destinationType: 'NONE',
  destinationId: null,
  readAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

describe('patient notifications mark-one-read BFF boundary (candidate Task 0036)', () => {
  it('rejects a cross-origin request without contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      request(undefined, { origin: 'https://attacker.example' }),
      context(NOTIFICATION_ID),
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid notification id before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(request(), context('not-a-uuid'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated request without contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(
      new NextRequest(`http://localhost/api/patient/notifications/${NOTIFICATION_ID}/read`, {
        method: 'PATCH',
        headers: { origin: 'http://localhost' },
      }),
      context(NOTIFICATION_ID),
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts an empty/no body and succeeds with a valid UUID', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validNotification));
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(request(), context(NOTIFICATION_ID));
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty-object body "{}" -- this operation has no body contract at all', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(request('{}'), context(NOTIFICATION_ID));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only body before contacting upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await PATCH(request('   '), context(NOTIFICATION_ID));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a large body without needing to parse/consume it (presence-only check)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const largeBody = 'x'.repeat(5_000_000);
    const response = await PATCH(request(largeBody), context(NOTIFICATION_ID));
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
    const response = await PATCH(request(body), context(NOTIFICATION_ID));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never forwards a body upstream even when one somehow reaches this point', async () => {
    // Even though a non-empty body is rejected above, this asserts the
    // upstream fetch call for a valid (no-body) request carries no body.
    const fetchMock = vi.fn().mockResolvedValue(Response.json(validNotification));
    vi.stubGlobal('fetch', fetchMock);
    await PATCH(request(), context(NOTIFICATION_ID));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it('rejects a malformed upstream notification response with 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ ...validNotification, extra: 'leak' })),
    );
    const response = await PATCH(request(), context(NOTIFICATION_ID));
    expect(response.status).toBe(502);
  });

  it('reports a genuine network failure as 503', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unreachable')));
    const response = await PATCH(request(), context(NOTIFICATION_ID));
    expect(response.status).toBe(503);
  });

  it('maps an upstream 5xx to 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));
    const response = await PATCH(request(), context(NOTIFICATION_ID));
    expect(response.status).toBe(502);
  });

  it.each([400, 401, 403, 404])(
    'preserves an upstream %i as the same bounded status',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status })));
      const response = await PATCH(request(), context(NOTIFICATION_ID));
      expect(response.status).toBe(status);
    },
  );
});

function request(body?: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/patient/notifications/${NOTIFICATION_ID}/read`, {
    method: 'PATCH',
    headers: {
      origin: 'http://localhost',
      cookie: 'medsphere_access=access-secret',
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}

function context(notificationId: string) {
  return { params: Promise.resolve({ notificationId }) };
}
