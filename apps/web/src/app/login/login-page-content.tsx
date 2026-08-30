'use client';

import { BRAND } from '@medsphere/brand';
import Link from 'next/link';
import { AimSpine } from '@/components/brand/aim-spine';
import { LanguageSelector } from '@/components/language-selector';
import { useLanguage } from '@/components/language-provider';
import { LoginForm } from './login-form';
import { loginCopy } from './login-copy';

export function LoginPageContent() {
  const { locale } = useLanguage();
  const copy = loginCopy[locale];
  const safeguards = [
    ['01', copy.verifiedIdentity],
    ['02', copy.activeMembership],
    ['03', copy.tenantContext],
    ['04', copy.attributableAudit],
  ] as const;

  return (
    <main className="min-h-screen bg-[#f7f6f0] p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1500px] overflow-hidden rounded-[1.75rem] border border-[#10201c]/[.07] bg-[#fffef9] shadow-[0_30px_100px_-50px_rgba(7,17,15,.5)] sm:min-h-[calc(100vh-2.5rem)] sm:rounded-[2.25rem] lg:grid-cols-[.88fr_1.12fr]">
        <section className="relative flex items-center justify-center px-6 py-10 sm:px-12 lg:px-16">
          <Link
            href="/"
            className="absolute left-6 top-6 inline-flex items-center gap-3 font-[var(--font-display)] font-bold sm:left-10 sm:top-9"
            aria-label={BRAND.accessibleName}
          >
            <span className="grid min-h-12 min-w-20 place-items-center rounded-[.9rem] bg-[#0b2f28] px-3 py-2 text-emerald-300 shadow-inner">
              <AimSpine expanded tone="dark" size="sm" decorative />
            </span>
          </Link>
          <div className="absolute right-6 top-6 sm:right-10 sm:top-9">
            <LanguageSelector />
          </div>

          <div className="w-full max-w-[27rem] pt-24 lg:pt-10">
            <div className="mb-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#34d399]" />
              {copy.secureAccess}
            </div>
            <h1 className="font-[var(--font-display)] text-4xl font-semibold tracking-[-.05em] text-[#10201c] sm:text-5xl">
              {copy.welcome}
            </h1>
            <p className="mb-9 mt-4 max-w-sm text-sm leading-7 text-[#60706b]">{copy.intro}</p>
            <LoginForm />
            <p className="mt-5 text-center text-xs leading-5 text-[#71807b]">
              {copy.needMembership}{' '}
              <Link href="/register" className="font-bold text-emerald-800 hover:text-emerald-600">
                {copy.requestOnboarding}
              </Link>
            </p>
            <div className="mt-7 flex items-start gap-3 border-t border-[#10201c]/[.08] pt-5 text-xs leading-5 text-[#71807b]">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#d7b56d]" />
              {copy.testDataNotice}
            </div>
          </div>
        </section>

        <aside className="fine-noise premium-grid relative hidden overflow-hidden bg-[#07110f] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-emerald-400/15 blur-[100px]" />
          <div className="relative flex items-center justify-between text-[10px] font-bold uppercase tracking-[.18em] text-white/40">
            <span>{copy.identityBoundary}</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-emerald-300">
              {copy.protected}
            </span>
          </div>

          <div className="relative max-w-2xl">
            <div className="mb-8 flex gap-2">
              {[0, 1, 2].map((item) => (
                <span
                  key={item}
                  className={`h-1 rounded-full ${item === 0 ? 'w-12 bg-emerald-300' : 'w-5 bg-white/15'}`}
                />
              ))}
            </div>
            <p className="font-[var(--font-display)] text-5xl font-semibold leading-[1.02] tracking-[-.055em] xl:text-6xl">
              {copy.contextBefore}
              <span className="block text-white/38">{copy.trustBefore}</span>
            </p>
            <p className="mt-7 max-w-lg text-base leading-8 text-white/48">
              {copy.sessionDescription}
            </p>

            <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
              {safeguards.map(([number, label]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-white/[.09] bg-white/[.045] p-4 backdrop-blur"
                >
                  <span className="text-[9px] font-bold text-[#d7b56d]">{number}</span>
                  <p className="mt-5 text-xs font-semibold text-white/75">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-between text-[10px] text-white/28">
            <span>{copy.identityMembershipTenant}</span>
            <Link href="/" className="transition hover:text-white/70">
              {copy.returnHome}
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
