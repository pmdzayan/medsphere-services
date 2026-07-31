import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAuditEvents, getAuthorizationCatalogue } from './api-client';

const catalogue = { roles: [], permissions: [], total: 0, effectivePermissions: [] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authenticated API client', () => {
  it('rotates an expired access credential once and retries the original request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: 'Expired' }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ expiresIn: 900 }))
      .mockResolvedValueOnce(Response.json(catalogue));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAuthorizationCatalogue()).resolves.toEqual(catalogue);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/authorization/catalogue',
      '/api/auth/refresh',
      '/api/authorization/catalogue',
    ]);
  });

  it('returns the original bounded session error when credential rotation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ message: 'Session expired' }, { status: 401 }))
        .mockResolvedValueOnce(Response.json({ message: 'Refresh rejected' }, { status: 401 })),
    );

    await expect(getAuthorizationCatalogue()).rejects.toMatchObject({
      message: 'Session expired',
      status: 401,
    });
  });

  it('requests audit evidence with bounded query parameters', async () => {
    const page = { data: [], nextCursor: null };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(page));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAuditEvents({ outcome: 'FAILED', limit: 25 })).resolves.toEqual(page);
    expect(fetchMock).toHaveBeenCalledWith('/api/audit/events?outcome=FAILED&limit=25', {
      cache: 'no-store',
    });
  });
});
