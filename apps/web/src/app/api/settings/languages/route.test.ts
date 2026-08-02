// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('supported languages BFF boundary', () => {
  it('requires an authenticated settings session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await GET(request())).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns reviewed supported language metadata', async () => {
    const languages = [
      { code: 'en', name: 'English' },
      { code: 'ta', name: 'Tamil' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(languages)));

    const response = await GET(request('medsphere_access=access-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(languages);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('fails closed on duplicate or unsupported language data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json([
          { code: 'en', name: 'English' },
          { code: 'en', name: 'Duplicate' },
        ]),
      ),
    );

    expect((await GET(request('medsphere_access=access-secret'))).status).toBe(502);
  });
});

function request(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/api/settings/languages', {
    headers: cookie ? { cookie } : {},
  });
}
