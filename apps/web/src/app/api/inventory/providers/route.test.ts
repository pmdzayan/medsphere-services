// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sealSessionProfile } from '@/lib/session-profile';
import { validProviders } from '@/test/inventory-fixtures';
import { GET } from './route';

const refreshToken = 'refresh-secret';
const profile = sealSessionProfile(
  {
    expiresIn: 900,
    user: {
      id: 'user-id',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
      preferredLanguage: 'en',
    },
    context: {
      membershipId: validProviders[0].membershipId,
      tenantId: 'tenant-id',
      tenantName: 'Central Pharmacy',
      organizationType: 'PHARMACY',
    },
  },
  refreshToken,
);

afterEach(() => vi.unstubAllGlobals());

describe('assigned providers BFF boundary', () => {
  it('derives membership from the sealed profile and returns only active exact records', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json([
        ...validProviders,
        {
          ...validProviders[0],
          providerId: '8b4d574f-48c6-4231-8851-e65edc9f9d42',
          isActive: false,
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(validProviders);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/memberships/${validProviders[0].membershipId}/provider-access`);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');
  });

  it('rejects missing or tampered profile identity and browser-supplied identity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await GET(new NextRequest('http://localhost/api/inventory/providers'))).status).toBe(
      401,
    );
    expect((await GET(request('?membershipId=attacker'))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed successful data and bounds upstream failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(Response.json([{ ...validProviders[0], tenantId: 'leak' }])),
    );
    expect((await GET(request())).status).toBe(502);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(Response.json({ message: 'Denied' }, { status: 403 })),
    );
    const denied = await GET(request());
    expect(denied.status).toBe(403);
    expect(denied.headers.get('cache-control')).toBe('private, no-store');
  });
});

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/inventory/providers${query}`, {
    headers: {
      cookie: `medsphere_access=access-secret; medsphere_refresh=${refreshToken}; medsphere_profile=${profile}`,
    },
  });
}
