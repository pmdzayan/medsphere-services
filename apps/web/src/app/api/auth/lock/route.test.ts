// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workstation lock boundary', () => {
  it('rejects cross-origin lock attempts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest({ reason: 'manual' }, { origin: 'https://attacker.example' }),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('locks with the access credential and removes only the stale access cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ locked: true }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ reason: 'manual' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ locked: true });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;

    expect(headers.get('authorization')).toBe('Bearer old-access');
    expect(init.body).toBe(JSON.stringify({ reason: 'manual' }));

    const cookies = response.headers.getSetCookie().join(';');
    expect(cookies).toContain('medsphere_access=');
    expect(cookies).toContain('Max-Age=0');
    expect(cookies).not.toContain('medsphere_refresh=');
  });

  it('rejects unapproved lock reasons before contacting auth', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ reason: 'unsafe' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed on an invalid upstream response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ locked: false })));

    const response = await POST(createRequest({ reason: 'manual' }));

    expect(response.status).toBe(502);
  });
});

function createRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/auth/lock', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      cookie: 'medsphere_access=old-access; medsphere_refresh=locked-refresh',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
