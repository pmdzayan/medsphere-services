// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { cookies } from 'next/headers';
import RootLayout, { generateMetadata } from './layout';
import { BRAND } from '@medsphere/brand';
import { LOCALE_COOKIE } from '@/lib/i18n';
import {
  PROFILE_COOKIE,
  REFRESH_COOKIE,
  sealSessionProfile,
  type SessionProfile,
} from '@/lib/session-profile';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

function bodyChildren(element: Awaited<ReturnType<typeof RootLayout>>): React.ReactElement[] {
  const body = element.props.children as React.ReactElement;
  const children = body.props.children;
  return (Array.isArray(children) ? children : [children]).filter(Boolean) as React.ReactElement[];
}

function initialLocaleFromLayout(element: Awaited<ReturnType<typeof RootLayout>>): unknown {
  const provider = bodyChildren(element).find(
    (child) => child?.props && Object.prototype.hasOwnProperty.call(child.props, 'initialLocale'),
  );
  return provider?.props.initialLocale;
}

function releaseBootstrapFromLayout(
  element: Awaited<ReturnType<typeof RootLayout>>,
): React.ReactElement | undefined {
  return bodyChildren(element).find(
    (child) =>
      child?.props?.src === '/sw-release.js' && child?.props?.strategy === 'beforeInteractive',
  );
}

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
  it('publishes the approved application and Open Graph identity', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    const metadata = await generateMetadata();
    expect(metadata.applicationName).toBe(BRAND.fullName);
    expect(metadata.title).toEqual({
      default: BRAND.applicationTitle,
      template: `%s | ${BRAND.shortName}`,
    });
    expect(metadata.manifest).toBe('/manifest.webmanifest');
    expect(metadata.openGraph).toEqual(
      expect.objectContaining({ siteName: BRAND.fullName, title: BRAND.applicationTitle }),
    );
    expect(metadata.appleWebApp).toEqual(expect.objectContaining({ title: BRAND.shortName }));
  });

  it('bootstraps the bounded web release marker before interactive application work', async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    const element = await RootLayout({ children: <main>child</main> });
    expect(releaseBootstrapFromLayout(element)).toBeDefined();
  });

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
    expect(initialLocaleFromLayout(element)).toBe('ur');
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
    expect(initialLocaleFromLayout(element)).toBe('ur');
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
    expect(initialLocaleFromLayout(element)).toBeNull();
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
    expect(initialLocaleFromLayout(element)).toBe('en');
  });
});
