'use client';

import { LanguageSelector } from '@/components/language-selector';
import { useLanguage } from '@/components/language-provider';
import { publicSearchCopy } from './public-search-copy';

export function PublicSearchMissingProvider() {
  const { locale } = useLanguage();
  const copy = publicSearchCopy[locale];

  return (
    <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <div className="flex justify-end">
        <LanguageSelector />
      </div>
      <h1 className="mt-6 text-2xl font-extrabold text-[#173128]">{copy.missingTitle}</h1>
      <p className="mt-3 text-sm text-[#536a62]">{copy.missingDescription}</p>
    </main>
  );
}
