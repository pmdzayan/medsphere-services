import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { LOCALE_COOKIE } from '@/lib/i18n';

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});

afterEach(() => {
  cleanup();
  document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
  vi.restoreAllMocks();
});

function LocaleProbe() {
  const { locale } = useLanguage();
  return <span data-testid="locale">{locale}</span>;
}

function Setter() {
  const { setLocale } = useLanguage();
  return <button onClick={() => setLocale('ur')}>switch</button>;
}

function IncompleteLocaleSetter() {
  const { setLocale } = useLanguage();
  return <button onClick={() => setLocale('hi')}>switch-hi</button>;
}

function LocalOnlySetter() {
  const { setLocale } = useLanguage();
  return <button onClick={() => setLocale('ur', { persist: false })}>switch-local-only</button>;
}

describe('LanguageProvider precedence', () => {
  it('an authenticated profile preference takes precedence over local storage', async () => {
    window.localStorage.setItem('medsphere.locale', 'ta');

    render(
      <LanguageProvider initialLocale="ur">
        <LocaleProbe />
      </LanguageProvider>,
    );

    // The profile locale is present on the very first client render; no
    // post-hydration English fallback is observable.
    expect(screen.getByTestId('locale')).toHaveTextContent('ur');
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'));
  });

  it('falls back to local storage when no authenticated preference is present', async () => {
    window.localStorage.setItem('medsphere.locale', 'ta');

    render(
      <LanguageProvider initialLocale={null}>
        <LocaleProbe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('ta'));
  });

  it('ignores an incomplete authenticated preference and falls through to local storage', async () => {
    window.localStorage.setItem('medsphere.locale', 'ta');

    render(
      // 'bn' is a known but currently incomplete locale -- must never be
      // silently applied even if somehow persisted as a stale profile value.
      <LanguageProvider initialLocale="bn">
        <LocaleProbe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('ta'));
  });

  it('defaults to English when nothing else is available', async () => {
    render(
      <LanguageProvider initialLocale={null}>
        <LocaleProbe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('en'));
  });
});

describe('LanguageProvider persistence', () => {
  it('fires a best-effort PATCH to persist an enabled locale choice', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    render(
      <LanguageProvider initialLocale={null}>
        <Setter />
      </LanguageProvider>,
    );

    screen.getByText('switch').click();

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/settings/language',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init!.body as string)).toEqual({ preferredLanguage: 'ur' });
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=ur`);
  });

  it('synchronizes an existing complete stored locale into the reopening cookie', async () => {
    window.localStorage.setItem('medsphere.locale', 'ta');

    render(
      <LanguageProvider initialLocale={null}>
        <LocaleProbe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('ta'));
    expect(document.cookie).toContain(`${LOCALE_COOKIE}=ta`);
  });

  it('never blocks or reverts the local UI change when persistence fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    render(
      <LanguageProvider initialLocale={null}>
        <LocaleProbe />
        <Setter />
      </LanguageProvider>,
    );

    screen.getByText('switch').click();

    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('ur'));
    expect(document.documentElement.lang).toBe('ur');
  });

  it('fails closed instead of applying a known-but-incomplete locale', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    render(
      <LanguageProvider initialLocale={null}>
        <LocaleProbe />
        <IncompleteLocaleSetter />
      </LanguageProvider>,
    );

    screen.getByText('switch-hi').click();
    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('en'));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('medsphere.locale')).not.toBe('hi');
  });

  it('can apply an already-persisted Settings save without issuing a duplicate PATCH', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    render(
      <LanguageProvider initialLocale="en">
        <LocaleProbe />
        <LocalOnlySetter />
      </LanguageProvider>,
    );

    screen.getByText('switch-local-only').click();
    await waitFor(() => expect(screen.getByTestId('locale')).toHaveTextContent('ur'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
