// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shared-workstation switch-user boundary', () => {
  it('rejects cross-origin switch-user attempts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ origin: 'https://attacker.example' }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('revokes the current operator family before clearing local credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        message: 'Session ended. Sign in as the next operator.',
        revokedCount: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;

    expect(headers.get('x-locked-session-refresh')).toBe('locked-refresh');

    const cookies = response.headers.getSetCookie().join(';');
    expect(cookies).toContain('Max-Age=0');

    expect(await response.json()).toEqual({
      message: 'Session ended. Sign in as the next operator.',
    });
  });

  it('keeps the locked session locally when secure revocation cannot be attempted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const response = await POST(createRequest());

    expect(response.status).toBe(503);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('clears local credentials when the locked credential is already invalid', async () => {
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
  return new NextRequest('http://localhost/api/auth/switch-user', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: 'medsphere_refresh=locked-refresh',
      ...headers,
    },
  });
}
