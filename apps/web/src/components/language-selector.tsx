'use client';

import { useLanguage } from '@/components/language-provider';
import { enabledLocaleOptions, type Locale } from '@/lib/i18n';

export function LanguageSelector() {
  const { locale, setLocale, t } = useLanguage();

  return (
    <label className="inline-flex items-center gap-3 rounded-xl border border-[#10201c]/[.09] bg-white/80 px-3 py-2 text-xs font-bold text-[#43524e] shadow-sm">
      <span>{t('language.label')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('language.label')}
        className="max-w-44 rounded-lg border border-[#10201c]/[.1] bg-[#fbfaf5] px-2.5 py-1.5 text-xs font-bold text-[#10201c] outline-none focus:border-emerald-600"
      >
        {enabledLocaleOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
