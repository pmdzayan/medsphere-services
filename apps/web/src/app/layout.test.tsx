// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import RootLayout from './layout';
import { LOCALE_COOKIE } from '@/lib/i18n';
import {
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  sealSessionProfile,
  type SessionProfile,
} from '@/lib/session-profile';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

const profile: SessionProfile = {
  expiresIn: 900,
  user: {
    id: 'user-1',
    email: 'user@example.com',
    firstName: 'Mira',
    lastName: 'Patel',
    preferredLanguage: 'ur',
  },
  context: {
    membershipId: 'membership-1',
    tenantId: 'tenant-1',
    tenantName: 'Central Hospital',
    organizationType: 'HOSPITAL',
  },
};

describe('RootLayout server locale', () => {
  it('server-renders the signed-out reopening locale from the bounded locale cookie', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get(name: string) {
        if (name === LOCALE_COOKIE) return { name, value: 'ur' };
        return undefined;
      },
    } as never);

    const element = await RootLayout({ children: <main>child</main> });
    expect(element.props.lang).toBe('ur');
    expect(element.props.dir).toBe('rtl');
    expect(element.props.children.props.children.props.initialLocale).toBe('ur');
  });

  it('server-renders authenticated Urdu with lang=ur and dir=rtl', async () => {
    const refresh = 'refresh-secret';
    const sealed = sealSessionProfile(profile, refresh);
    vi.mocked(cookies).mockResolvedValue({
      get(name: string) {
        if (name === REFRESH_COOKIE) return { name, value: refresh };
        if (name === PROFILE_COOKIE) return { name, value: sealed };
        return undefined;
      },
    } as never);

    const element = await RootLayout({ children: <main>child</main> });
    expect(element.props.lang).toBe('ur');
    expect(element.props.dir).toBe('rtl');
    expect(element.props.children.props.children.props.initialLocale).toBe('ur');
  });

  it('fails closed to English/LTR when the sealed profile is invalid', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get(name: string) {
        if (name === REFRESH_COOKIE) return { name, value: 'refresh-secret' };
        if (name === PROFILE_COOKIE) return { name, value: 'forged' };
        return undefined;
      },
    } as never);

    const element = await RootLayout({ children: <main>child</main> });
    expect(element.props.lang).toBe('en');
    expect(element.props.dir).toBe('ltr');
    expect(element.props.children.props.children.props.initialLocale).toBeNull();
  });

  it('keeps a legacy incomplete authenticated preference on the safe English fallback', async () => {
    const refresh = 'refresh-secret';
    const sealed = sealSessionProfile(
      { ...profile, user: { ...profile.user, preferredLanguage: 'hi' } },
      refresh,
    );
    vi.mocked(cookies).mockResolvedValue({
      get(name: string) {
        if (name === REFRESH_COOKIE) return { name, value: refresh };
        if (name === PROFILE_COOKIE) return { name, value: sealed };
        return undefined;
      },
    } as never);

    const element = await RootLayout({ children: <main>child</main> });
    expect(element.props.lang).toBe('en');
    expect(element.props.dir).toBe('ltr');
    expect(element.props.children.props.children.props.initialLocale).toBe('en');
  });
});
