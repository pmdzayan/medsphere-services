import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { LanguageSelector } from '@/components/language-selector';
import { enabledLocaleOptions, localeOptions } from '@/lib/i18n';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});

afterEach(() => cleanup());

describe('LanguageSelector', () => {
  it('lists only translation-complete locales, not every known locale code', () => {
    render(
      <LanguageProvider>
        <LanguageSelector />
      </LanguageProvider>,
    );

    // The Eighth Schedule locale catalog currently has 23 known codes,
    // but only translation-complete ones may appear in a production
    // selector -- see lib/i18n.ts's isLocaleComplete/enabledLocaleOptions.
    expect(localeOptions.length).toBeGreaterThan(enabledLocaleOptions.length);
    expect(screen.getAllByRole('option')).toHaveLength(enabledLocaleOptions.length);
  });

  it('never renders an option for a known-incomplete locale', () => {
    render(
      <LanguageProvider>
        <LanguageSelector />
      </LanguageProvider>,
    );

    const optionValues = screen
      .getAllByRole('option')
      .map((option) => option.getAttribute('value'));
    expect(optionValues).not.toContain('bn');
    expect(optionValues).not.toContain('sd');
    expect(optionValues).not.toContain('ks');
  });

  it('switches to Tamil, persists the choice, and updates document language', () => {
    render(
      <LanguageProvider>
        <LanguageSelector />
        <TranslatedProbe />
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ta' } });

    expect(screen.getByText('முதல் பெயர்')).toBeVisible();
    expect(window.localStorage.getItem('medsphere.locale')).toBe('ta');
    expect(document.documentElement.lang).toBe('ta');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('applies right-to-left direction for Urdu (a complete, enabled RTL locale)', () => {
    render(
      <LanguageProvider>
        <LanguageSelector />
      </LanguageProvider>,
    );

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ur' } });

    expect(window.localStorage.getItem('medsphere.locale')).toBe('ur');
    expect(document.documentElement.lang).toBe('ur');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('restores a persisted Tamil choice on mount', async () => {
    window.localStorage.setItem('medsphere.locale', 'ta');

    render(
      <LanguageProvider>
        <LanguageSelector />
        <TranslatedProbe />
      </LanguageProvider>,
    );

    await waitFor(() => expect(screen.getByText('முதல் பெயர்')).toBeVisible());
    expect(screen.getByRole('combobox')).toHaveValue('ta');
  });
});

function TranslatedProbe() {
  const { t } = useLanguage();
  return <span>{t('registration.firstName')}</span>;
}
