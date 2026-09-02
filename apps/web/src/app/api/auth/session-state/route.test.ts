// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workstation session-state boundary', () => {
  it('rejects cross-origin requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ origin: 'https://attacker.example' }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the HTTP-only refresh credential only as the dedicated upstream header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        locked: true,
        lockedAt: '2026-09-02T09:00:00.000Z',
        securityVersion: 2,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');

    const body = await response.json();
    expect(body).toEqual({
      locked: true,
      lockedAt: '2026-09-02T09:00:00.000Z',
      securityVersion: 2,
    });
    expect(body).not.toHaveProperty('refreshToken');
    expect(body).not.toHaveProperty('accessToken');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;

    expect(headers.get('x-locked-session-refresh')).toBe('locked-refresh');
    expect(init.body).toBeUndefined();
  });

  it('clears local credentials when the session credential is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 })),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().join(';')).toContain('Max-Age=0');
  });

  it('fails closed on an invalid upstream session-state shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          locked: false,
          securityVersion: 2,
          unexpected: true,
        }),
      ),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(502);
  });
});

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/auth/session-state', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: 'medsphere_access=stale-access; medsphere_refresh=locked-refresh',
      ...headers,
    },
  });
}
