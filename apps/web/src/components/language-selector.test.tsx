import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { LanguageSelector } from '@/components/language-selector';
import { localeOptions } from '@/lib/i18n';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});

afterEach(() => cleanup());

describe('LanguageSelector', () => {
  it('lists English plus all 22 Eighth Schedule languages', () => {
    render(
      <LanguageProvider>
        <LanguageSelector />
      </LanguageProvider>,
    );

    expect(screen.getAllByRole('option')).toHaveLength(23);
    expect(localeOptions).toHaveLength(23);
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

  it('applies right-to-left direction for Urdu', () => {
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
