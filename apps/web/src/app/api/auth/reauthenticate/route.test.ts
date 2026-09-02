// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { ACCESS_COOKIE } from '@/lib/session-profile';
import { POST } from './route';

const ORIGIN = 'https://app.example.test';

function createRequest(
  body: unknown,
  options: {
    origin?: string;
    accessToken?: string;
  } = {},
): NextRequest {
  const headers = new Headers({
    'content-type': 'application/json',
    origin: options.origin ?? ORIGIN,
  });

  if (options.accessToken) {
    headers.set('cookie', `${ACCESS_COOKIE}=${options.accessToken}`);
  }

  return new NextRequest(`${ORIGIN}/api/auth/reauthenticate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/reauthenticate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects cross-origin credential proof before contacting auth', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest(
        { password: '123456789012345' },
        {
          origin: 'https://attacker.example',
          accessToken: 'access-secret',
        },
      ),
    );

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed or ambiguous credential proof', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest(
        {
          password: '123456789012345',
          googleIdToken: 'google-token',
        },
        { accessToken: 'access-secret' },
      ),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the HTTP-only access credential', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(createRequest({ password: '123456789012345' }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards only the credential proof with the server-side bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        reauthenticated: true,
        recentAuthenticatedAt: '2026-09-02T08:30:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      createRequest({ password: '123456789012345' }, { accessToken: 'access-secret' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reauthenticated: true,
      recentAuthenticatedAt: '2026-09-02T08:30:00.000Z',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(url).toBe('http://localhost:3000/auth/reauthenticate');
    expect(headers.get('authorization')).toBe('Bearer access-secret');
    expect(headers.get('x-locked-session-refresh')).toBeNull();

    expect(JSON.parse(String(init.body))).toEqual({
      password: '123456789012345',
    });
    expect(String(init.body)).not.toContain('access-secret');

    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('preserves the valid local session when credential proof is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ message: 'Invalid re-authentication credential' }, { status: 401 }),
        ),
    );

    const response = await POST(
      createRequest({ password: 'wrong-password-123' }, { accessToken: 'access-secret' }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('fails closed on malformed successful upstream responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          reauthenticated: true,
          recentAuthenticatedAt: 'not-a-date',
        }),
      ),
    );

    const response = await POST(
      createRequest({ googleIdToken: 'google-token' }, { accessToken: 'access-secret' }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
