// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE } from './route';

const providerId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ providerId, membershipId }) };

afterEach(() => vi.unstubAllGlobals());

describe('pharmacy staff revocation boundary', () => {
  it('rejects cross-origin requests before using credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await DELETE(request('https://attacker.example'), context);

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed path identifiers before calling upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await DELETE(request(), {
      params: Promise.resolve({ providerId, membershipId: 'not-a-uuid' }),
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the existing provider-access deletion and returns a bounded receipt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await DELETE(request(), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revoked: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/authorization/memberships/${membershipId}/provider-access/${providerId}`,
      expect.objectContaining({ method: 'DELETE', cache: 'no-store' }),
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
});

function request(origin = 'http://localhost'): NextRequest {
  return new NextRequest(
    `http://localhost/api/pharmacy/providers/${providerId}/staff/members/${membershipId}`,
    {
      method: 'DELETE',
      headers: { origin, cookie: 'medsphere_access=access-secret' },
    },
  );
}
