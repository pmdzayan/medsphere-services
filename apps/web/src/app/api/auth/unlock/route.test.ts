// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workstation unlock boundary', () => {
  it('rejects cross-origin unlock attempts', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest({ password: '123456789012345' }, { origin: 'https://attacker.example' }),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds the HTTP-only refresh credential server-side and rotates cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 900,
        user: {
          id: 'user-id',
          email: 'admin@example.com',
          firstName: 'Aisha',
          lastName: 'Zahra',
          preferredLanguage: 'en',
        },
        context: {
          membershipId: 'membership-id',
          tenantId: 'tenant-id',
          tenantName: 'Central Pharmacy',
          organizationType: 'PHARMACY',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ password: '123456789012345' }));

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Headers;

    expect(headers.get('x-locked-session-refresh')).toBe('locked-refresh');
    expect(JSON.parse(String(init.body))).toEqual({
      password: '123456789012345',
      refreshToken: 'locked-refresh',
    });

    const cookies = response.headers.getSetCookie().join(';');
    expect(cookies).toContain('medsphere_access=new-access');
    expect(cookies).toContain('medsphere_refresh=new-refresh');
    expect(cookies).toContain('medsphere_profile=');
  });

  it('rejects multiple credentials before contacting auth', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest({
        password: '123456789012345',
        googleIdToken: 'google-proof',
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not destroy the locked session after a failed credential proof', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: 'Invalid unlock credential' }, { status: 401 }),
        ),
    );

    const response = await POST(createRequest({ password: '123456789012345' }));

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});

function createRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/auth/unlock', {
    method: 'POST',
    headers: {
      origin: 'http://localhost',
      'content-type': 'application/json',
      cookie: 'medsphere_refresh=locked-refresh',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
