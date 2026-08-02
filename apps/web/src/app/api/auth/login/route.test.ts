// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const validRequest = {
  tenantSlug: 'central-pharmacy',
  email: 'user@example.com',
  password: 'a-secure-password',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('login session boundary', () => {
  it('rejects cross-origin requests before forwarding credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest(validRequest, 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid input before calling the authentication service', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ ...validRequest, password: 'short' }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects client-controlled tenant identity fields before forwarding credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest({ ...validRequest, tenantId: 'client-controlled-tenant' }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not expose credentials in the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          expiresIn: 900,
          user: {
            id: 'user-id',
            email: validRequest.email,
            firstName: 'Test',
            lastName: 'User',
          },
          context: { membershipId: 'membership-id', tenantId: 'tenant-id' },
        }),
      ),
    );

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
    await expect(response.json()).resolves.toEqual({
      message: 'Authentication service returned an invalid response.',
    });
  });

  it('rejects over-broad successful responses without setting credentials', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          accessToken: 'access-secret',
          refreshToken: 'refresh-secret',
          expiresIn: 900,
          user: {
            id: 'user-id',
            email: validRequest.email,
            firstName: 'Test',
            lastName: 'User',
            permissions: ['unsafe-upstream-field'],
          },
          context: { membershipId: 'membership-id', tenantId: 'tenant-id' },
        }),
      ),
    );

    const response = await POST(createRequest(validRequest));

    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

function createRequest(body: unknown, origin = 'http://localhost'): NextRequest {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}
