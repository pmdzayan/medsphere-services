'use client';

import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';

export function PlatformBrand() {
  const { t } = useLanguage();
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-3"
      aria-label={t('common.brandHome')}
    >
      <span className="grid size-10 place-items-center rounded-[.9rem] border border-emerald-300/20 bg-emerald-300/10 font-[var(--font-display)] text-sm font-black text-emerald-300 shadow-inner">
        M
      </span>
      <span>
        <span className="block font-[var(--font-display)] text-[15px] font-extrabold tracking-[-.025em] text-white">
          MedSphere
        </span>
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[.2em] text-white/35">
          {t('common.healthcareOs')}
        </span>
      </span>
    </Link>
  );
}
