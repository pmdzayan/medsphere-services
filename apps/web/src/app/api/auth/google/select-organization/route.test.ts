// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const validRequest = {
  idToken: 'google-id-token',
  membershipId: '93b31836-6a84-4db9-a935-1c55960c25da',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google organization selection session boundary', () => {
  it('rejects cross-origin requests before forwarding the Google proof', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest(validRequest, 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a bare or over-broad membership selection', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const bareResponse = await POST(createRequest({ membershipId: validRequest.membershipId }));
    const broadResponse = await POST(
      createRequest({ ...validRequest, tenantId: 'client-controlled-tenant' }),
    );

    expect(bareResponse.status).toBe(400);
    expect(broadResponse.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the re-verifiable Google proof and seals the returned session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
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
          membershipId: validRequest.membershipId,
          tenantId: 'tenant-id',
          tenantName: 'Central Pharmacy',
          organizationType: 'PHARMACY',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest(validRequest));
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/google/select-organization'),
      expect.objectContaining({ body: JSON.stringify(validRequest), method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
    expect(response.headers.getSetCookie().join(';')).toContain('HttpOnly');
  });
});

function createRequest(body: unknown, origin = 'http://localhost'): NextRequest {
  return new NextRequest('http://localhost/api/auth/google/select-organization', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}
