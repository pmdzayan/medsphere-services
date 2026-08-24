'use client';

import { LanguageSelector } from '@/components/language-selector';

export function PlatformLanguageDock() {
  return (
    <div className="fixed bottom-24 right-4 z-40 lg:bottom-6 lg:right-6" aria-label="Application language">
      <LanguageSelector />
    </div>
  );
}
