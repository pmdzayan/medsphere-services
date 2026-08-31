'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getLocaleDirection,
  isLocale,
  isLocaleComplete,
  LOCALE_COOKIE,
  translate,
  type Locale,
  type TranslationKey,
  type TranslationValues,
} from '@/lib/i18n';
import { isSupportedLanguageCode } from '@/lib/settings-contract';

const LANGUAGE_STORAGE_KEY = 'medsphere.locale';
const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale, options?: Readonly<{ persist?: boolean }>) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = getLocaleDirection(locale);
}

function persistBrowserLocale(locale: Locale) {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function resolveCompleteLocale(value: string | null | undefined): Locale | null {
  return value && isLocale(value) && isLocaleComplete(value) ? value : null;
}

/** Best-effort match of the browser's locale against a complete, enabled application locale. */
function detectBrowserLocale(): Locale | null {
  if (typeof navigator === 'undefined') return null;
  const candidates = navigator.languages ?? [navigator.language];
  for (const candidate of candidates) {
    const code = candidate?.split('-')[0];
    const locale = resolveCompleteLocale(code);
    if (locale) return locale;
  }
  return null;
}

export interface LanguageProviderProps {
  children: React.ReactNode;
  /**
   * The authenticated user's server-persisted language preference, when
   * one is available (read from the session by a Server Component --
   * see app/layout.tsx). Precedence when this is present and valid:
   * authenticated profile preference > locally persisted preference >
   * supported browser locale > default locale. When absent (no session,
   * or a signed-out visitor), precedence falls through to local
   * storage, then browser locale, then the default.
   */
  initialLocale?: string | null;
}

export function LanguageProvider({ children, initialLocale }: Readonly<LanguageProviderProps>) {
  const resolvedInitialLocale = resolveCompleteLocale(initialLocale);
  // A valid authenticated profile locale is used on the very first render.
  // This keeps client-component copy consistent with RootLayout's server-side
  // <html lang/dir> attributes and avoids an English/LTR hydration flash.
  const [locale, setLocaleState] = useState<Locale>(() => resolvedInitialLocale ?? 'en');

  useEffect(() => {
    if (resolvedInitialLocale) {
      setLocaleState(resolvedInitialLocale);
      applyDocumentLocale(resolvedInitialLocale);
      // Keep local storage in sync so a subsequent signed-out visit (or
      // an offline reload before the profile reloads) still sees the
      // most recently known-authoritative choice.
      persistBrowserLocale(resolvedInitialLocale);
      return;
    }

    const storedLocale = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLocale(storedLocale) && isLocaleComplete(storedLocale)) {
      setLocaleState(storedLocale);
      applyDocumentLocale(storedLocale);
      persistBrowserLocale(storedLocale);
      return;
    }

    const browserLocale = detectBrowserLocale();
    if (browserLocale) {
      setLocaleState(browserLocale);
      applyDocumentLocale(browserLocale);
      persistBrowserLocale(browserLocale);
      return;
    }

    applyDocumentLocale('en');
  }, [resolvedInitialLocale]);

  function setLocale(nextLocale: Locale, options: Readonly<{ persist?: boolean }> = {}) {
    // Never permit a known-but-incomplete locale to create a mixed-language UI.
    if (!isLocaleComplete(nextLocale)) return;
    setLocaleState(nextLocale);
    persistBrowserLocale(nextLocale);
    applyDocumentLocale(nextLocale);

    // Best-effort, fire-and-forget persistence for an authenticated
    // session. The underlying route already checks for a session cookie
    // and safely no-ops (401) when signed out, so this is safe to call
    // unconditionally from any page, including public login/registration
    // screens, without this component needing its own auth-state
    // plumbing. A failure here never blocks or reverts the immediate,
    // already-applied local UI change.
    if (options.persist !== false && isSupportedLanguageCode(nextLocale)) {
      fetch('/api/settings/language', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferredLanguage: nextLocale }),
      }).catch(() => {
        // Deliberately ignored: language preference persistence must
        // never surface an error to the user or block the (already
        // applied) local language switch.
      });
    }
  }

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
    }),
    [locale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used within LanguageProvider.');
  }
  return value;
}
