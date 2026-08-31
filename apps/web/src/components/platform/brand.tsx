'use client';

import { BRAND } from '@medsphere/brand';
import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';
import { AimSpine } from '@/components/brand/aim-spine';

export function PlatformBrand() {
  const { t } = useLanguage();
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-3"
      aria-label={t('common.brandHome')}
    >
      <span className="grid size-10 place-items-center rounded-[.9rem] border border-emerald-300/20 bg-emerald-300/10 text-emerald-300 shadow-inner">
        <AimSpine expanded={false} tone="dark" size="sm" decorative />
      </span>
      <span>
        <span className="block font-[var(--font-display)] text-[15px] font-extrabold tracking-[-.025em] text-white">
          {BRAND.shortName}
        </span>
        <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[.2em] text-white/35">
          {BRAND.fullName}
        </span>
      </span>
    </Link>
  );
}
