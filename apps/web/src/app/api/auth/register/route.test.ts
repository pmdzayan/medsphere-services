// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { REGISTRATION_CONFIRMATION_MESSAGE } from '@/lib/auth-contract';
import { POST } from './route';

const validRequest = {
  organizationType: 'HOSPITAL',
  organizationCode: 'MED-X7P42-Q9K3R',
  email: 'operator@example.com',
  password: 'a-secure-password',
  firstName: 'Mira',
  lastName: 'Patel',
  phone: '+919876543210',
};

afterEach(() => vi.unstubAllGlobals());

describe('public onboarding BFF boundary', () => {
  it('rejects cross-origin requests before forwarding personal data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request(validRequest, 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid and over-broad requests before calling authentication', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const invalid = await POST(request({ ...validRequest, password: 'short' }));
    const overBroad = await POST(request({ ...validRequest, tenantId: 'client-controlled' }));

    expect(invalid.status).toBe(400);
    expect(overBroad.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes and forwards only the accepted registration contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: REGISTRATION_CONFIRMATION_MESSAGE }, { status: 202 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      request({
        ...validRequest,
        organizationCode: ' med-x7p42-q9k3r ',
        email: ' OPERATOR@EXAMPLE.COM ',
        firstName: ' Mira ',
        lastName: ' Patel ',
        phone: ' +91 98765 43210 ',
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ message: REGISTRATION_CONFIRMATION_MESSAGE });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/register');
    expect(JSON.parse(String(init.body))).toEqual(validRequest);
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  it('preserves the generic response and never discloses tenant or account existence', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: REGISTRATION_CONFIRMATION_MESSAGE }, { status: 202 }),
        ),
    );

    const response = await POST(request(validRequest));
    const body = await response.json();

    expect(body).toEqual({ message: REGISTRATION_CONFIRMATION_MESSAGE });
    expect(body).not.toHaveProperty('tenantId');
    expect(body).not.toHaveProperty('userId');
    expect(body).not.toHaveProperty('password');
  });

  it('maps rate limiting and transport failures to bounded public errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 })));
    const limited = await POST(request(validRequest));
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({
      message: 'Too many onboarding requests. Try again later.',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('private transport detail')));
    const unavailable = await POST(request(validRequest));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      message: 'Onboarding service is unavailable.',
    });
  });

  it('rejects malformed successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          message: 'Account created',
          userId: 'leaked-id',
        }),
      ),
    );

    const response = await POST(request(validRequest));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: 'Onboarding service returned an invalid response.',
    });
  });
});

function request(body: unknown, origin = 'http://localhost'): NextRequest {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}
