import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '@/components/language-provider';
import { LanguageSelector } from '@/components/language-selector';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = 'en';
});

afterEach(() => cleanup());

describe('LanguageSelector', () => {
  it('switches to Tamil, persists the choice, and updates document language', async () => {
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
