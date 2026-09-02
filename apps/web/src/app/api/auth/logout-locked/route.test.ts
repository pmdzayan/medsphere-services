// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('locked workstation logout boundary', () => {
  it('rejects cross-origin logout attempts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ origin: 'https://attacker.example' }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('revokes the locked family before clearing local credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        message: 'Logged out successfully',
        revokedCount: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;

    expect(headers.get('x-locked-session-refresh')).toBe('locked-refresh');
    expect(response.headers.getSetCookie().join(';')).toContain('Max-Age=0');
  });

  it('keeps local credentials when server-side revocation cannot be attempted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('clears local credentials when the server says the locked credential is already invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 })),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join(';')).toContain('Max-Age=0');
  });
});

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/auth/logout-locked', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: 'medsphere_refresh=locked-refresh',
      ...headers,
    },
  });
}
