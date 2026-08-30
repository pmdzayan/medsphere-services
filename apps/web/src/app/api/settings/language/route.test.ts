// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  readSessionProfile,
  sealSessionProfile,
  type SessionProfile,
} from '@/lib/session-profile';
import { PATCH } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('preferred language BFF boundary', () => {
  it('rejects cross-origin mutations before using credentials', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await PATCH(request({ preferredLanguage: 'ta' }, 'https://attacker.example'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported or over-broad language requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const unsupported = await PATCH(request({ preferredLanguage: 'ar' }));
    const overBroad = await PATCH(request({ preferredLanguage: 'en', userId: 'foreign' }));

    expect(unsupported.status).toBe(400);
    expect(overBroad.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards and validates an accepted language update', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: 'Language updated' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await PATCH(
      request({ preferredLanguage: 'ur' }, 'http://localhost', sessionCookies('en')),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'Language updated' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/users/me/language');
    expect(init.body).toBe(JSON.stringify({ preferredLanguage: 'ur' }));
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer access-secret');

    const sealed = response.cookies.get(PROFILE_COOKIE)?.value;
    expect(sealed).toBeTruthy();
    expect(readSessionProfile(sealed, REFRESH_SECRET)?.user.preferredLanguage).toBe('ur');
  });

  it('clears a stale profile cookie rather than resealing untrusted profile data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Language updated' })),
    );

    const response = await PATCH(
      request(
        { preferredLanguage: 'ta' },
        'http://localhost',
        `medsphere_access=access-secret; ${REFRESH_COOKIE}=${REFRESH_SECRET}; ${PROFILE_COOKIE}=forged`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get(PROFILE_COOKIE)?.value ?? '').toBe('');
  });

  it('maps upstream failures to a stable public code without reflecting raw server text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('database exploded: secret-row', { status: 500 })),
    );

    const response = await PATCH(
      request({ preferredLanguage: 'ta' }, 'http://localhost', sessionCookies('en')),
    );
    const payload = (await response.json()) as { code: string; message: string };

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      code: 'LANGUAGE_UPDATE_FAILED',
      message: 'Unable to update language.',
    });
    expect(JSON.stringify(payload)).not.toContain('database exploded');
  });

  it('rejects malformed successful upstream responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: '', userId: 'x' })));

    expect((await PATCH(request({ preferredLanguage: 'en' }))).status).toBe(502);
  });
});

function request(
  body: unknown,
  origin = 'http://localhost',
  cookie = 'medsphere_access=access-secret',
): NextRequest {
  return new NextRequest('http://localhost/api/settings/language', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', origin, cookie },
    body: JSON.stringify(body),
  });
}

const REFRESH_SECRET = 'refresh-secret';

const profile: SessionProfile = {
  expiresIn: 900,
  user: {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Mira',
    lastName: 'Patel',
    preferredLanguage: 'en',
  },
  context: {
    membershipId: 'membership-1',
    tenantId: 'tenant-1',
    tenantName: 'Central Hospital',
    organizationType: 'HOSPITAL',
  },
};

function sessionCookies(preferredLanguage: 'en' | 'ta' | 'ur'): string {
  const next = { ...profile, user: { ...profile.user, preferredLanguage } };
  const sealed = sealSessionProfile(next, REFRESH_SECRET);
  return `medsphere_access=access-secret; ${REFRESH_COOKIE}=${REFRESH_SECRET}; ${PROFILE_COOKIE}=${sealed}`;
}
