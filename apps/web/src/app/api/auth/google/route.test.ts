// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const validRequest = { idToken: 'google-id-token' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google login session boundary', () => {
  it('rejects cross-origin requests before forwarding credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await POST(createRequest(validRequest, 'https://attacker.example'));
    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid or legacy tenant-bound input before calling auth', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const broad = await POST(createRequest({ ...validRequest, password: 'short' }));
    const legacy = await POST(
      createRequest({
        ...validRequest,
        tenantSlug: 'central-pharmacy',
        tenantId: 'client-controlled',
      }),
    );

    expect(broad.status).toBe(400);
    expect(legacy.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns only bounded organization choices and does not set session cookies yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          requiresOrganizationSelection: true,
          organizations: [
            {
              membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
              organizationName: 'Central Pharmacy',
              organizationType: 'PHARMACY',
            },
          ],
        }),
      ),
    );

    const response = await POST(createRequest(validRequest));

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
    await expect(response.json()).resolves.toEqual({
      requiresOrganizationSelection: true,
      organizations: [
        {
          membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
          organizationName: 'Central Pharmacy',
          organizationType: 'PHARMACY',
        },
      ],
    });
  });

  it('rejects over-broad or malformed organization choices from upstream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          requiresOrganizationSelection: true,
          organizations: [
            {
              membershipId: 'not-a-uuid',
              organizationName: 'Central Pharmacy',
              organizationType: 'PHARMACY',
              tenantId: 'must-not-cross-the-bff',
            },
          ],
        }),
      ),
    );

    const response = await POST(createRequest(validRequest));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('does not expose credentials in the completed-session response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(validSession())));

    const response = await POST(createRequest(validRequest));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
    expect(response.headers.getSetCookie().join(';')).toContain('HttpOnly');
    expect(response.headers.getSetCookie().join(';')).toContain('medsphere_profile=');
  });

  it('returns a bounded error when authentication is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection detail')));
    const response = await POST(createRequest(validRequest));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      message: 'Authentication service is unavailable.',
    });
  });

  it('rejects a malformed successful response without setting credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ status: 'ok' })));
    const response = await POST(createRequest(validRequest));
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

function validSession() {
  return {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    expiresIn: 900,
    user: {
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      preferredLanguage: 'en',
    },
    context: {
      membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
      tenantId: 'd79a711a-239f-4756-8bb4-9397623569bd',
      tenantName: 'Central Pharmacy',
      organizationType: 'PHARMACY',
    },
  };
}

function createRequest(body: unknown, origin = 'http://localhost'): NextRequest {
  return new NextRequest('http://localhost/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}
