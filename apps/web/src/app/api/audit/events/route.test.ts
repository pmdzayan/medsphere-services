// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

const event = {
  id: 'f63f50dd-49b0-4a77-bc04-f7d00db58dd5',
  eventType: 'authorization.permission.denied',
  outcome: 'DENIED',
  actorMembershipId: 'fcb65cb7-9071-40eb-ab52-878978d9031c',
  resourceType: null,
  resourceId: null,
  requestId: 'request-1',
  metadata: { requiredPermissions: 'audit.events.read' },
  occurredAt: '2026-07-31T18:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('audit events BFF boundary', () => {
  it('requires an authenticated access cookie', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new NextRequest('http://localhost/api/audit/events'));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only accepted filters and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [event],
        nextCursor: '73a97ec4-84f8-4a85-a493-b8d6feb84a27',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/audit/events?outcome=DENIED&limit=25&tenantId=attacker-tenant',
        { headers: { cookie: 'medsphere_access=access-secret' } },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: [event] });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/audit/events?outcome=DENIED&limit=25');
    expect(url).not.toContain('tenantId');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('preserves permission denial without leaking credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Permission denied' }, { status: 403 })),
    );

    const response = await GET(
      new NextRequest('http://localhost/api/audit/events', {
        headers: { cookie: 'medsphere_access=access-secret' },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Permission denied' });
  });

  it('rejects malformed successful upstream data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: [{ ...event, outcome: 'UNKNOWN' }] })),
    );

    const response = await GET(
      new NextRequest('http://localhost/api/audit/events', {
        headers: { cookie: 'medsphere_access=access-secret' },
      }),
    );

    expect(response.status).toBe(502);
  });

  it('reports transport failure as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    const response = await GET(
      new NextRequest('http://localhost/api/audit/events', {
        headers: { cookie: 'medsphere_access=access-secret' },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Audit service is unavailable.' });
  });
});
