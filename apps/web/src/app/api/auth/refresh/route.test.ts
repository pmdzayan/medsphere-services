// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sealSessionProfile, type SessionProfile } from '@/lib/session-profile';
import { POST } from './route';

const profile: SessionProfile = {
  tenantSlug: 'central-pharmacy',
  expiresIn: 900,
  user: {
    id: 'user-id',
    email: 'admin@example.com',
    firstName: 'Aisha',
    lastName: 'Zahra',
  },
  context: { membershipId: 'membership-id', tenantId: 'tenant-id' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refresh rotation boundary', () => {
  it('rejects cross-origin refresh attempts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ origin: 'https://attacker.example' }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rotates both credentials and reseals the display-only session profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 1200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const cookies = response.headers.getSetCookie().join(';');
    expect(cookies).toContain('medsphere_access=new-access');
    expect(cookies).toContain('medsphere_refresh=new-refresh');
    expect(cookies).toContain('medsphere_profile=');
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ refreshToken: 'old-refresh' }));
  });

  it('clears local credentials when the single-use refresh credential is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 })),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().join(';')).toContain('Max-Age=0');
  });
});

function createRequest(headers: Record<string, string> = {}): NextRequest {
  const sealedProfile = sealSessionProfile(profile, 'old-refresh');
  return new NextRequest('http://localhost/api/auth/refresh', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      cookie: `medsphere_access=old-access; medsphere_refresh=old-refresh; medsphere_profile=${sealedProfile}`,
      ...headers,
    },
  });
}
