'use client';

import { LanguageSelector } from '@/components/language-selector';
import { useLanguage } from '@/components/language-provider';

export function PlatformLanguageDock() {
  const { t } = useLanguage();
  return (
    <div
      className="fixed bottom-24 right-4 z-40 lg:bottom-6 lg:right-6"
      aria-label={t('common.applicationLanguage')}
    >
      <LanguageSelector />
    </div>
  );
}
