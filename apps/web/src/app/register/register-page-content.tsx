'use client';

import Link from 'next/link';
import { LanguageSelector } from '@/components/language-selector';
import { useLanguage } from '@/components/language-provider';
import { RegistrationForm } from './registration-form';

export function RegisterPageContent() {
  const { t } = useLanguage();
  const safeguards = [
    ['01', t('registration.safeguardPolicyTitle'), t('registration.safeguardPolicyDescription')],
    ['02', t('registration.safeguardPendingTitle'), t('registration.safeguardPendingDescription')],
    ['03', t('registration.safeguardPrivacyTitle'), t('registration.safeguardPrivacyDescription')],
  ] as const;

  return (
    <main className="min-h-screen bg-[#f4f6f1] p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1500px] overflow-hidden rounded-[1.75rem] border border-[#10201c]/[.07] bg-[#fffef9] shadow-[0_30px_100px_-50px_rgba(7,17,15,.5)] sm:min-h-[calc(100vh-2.5rem)] sm:rounded-[2.25rem] lg:grid-cols-[.9fr_1.1fr]">
        <aside className="fine-noise premium-grid relative hidden overflow-hidden bg-[#071713] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute -left-36 -top-32 size-[30rem] rounded-full bg-emerald-400/15 blur-[110px]" />
          <div className="pointer-events-none absolute -bottom-44 -right-32 size-[28rem] rounded-full bg-cyan-300/10 blur-[110px]" />

          <Link
            href="/"
            className="relative inline-flex items-center gap-3 font-[var(--font-display)] font-bold"
          >
            <span className="grid size-10 place-items-center rounded-[.9rem] border border-emerald-300/25 bg-emerald-300/10 text-sm text-emerald-300 shadow-inner">
              M
            </span>
            <span>MedSphere</span>
          </Link>

          <div className="relative max-w-xl">
            <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-[#d7b56d]/25 bg-[#d7b56d]/[.07] px-4 py-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#e8cc91]">
              <span className="h-px w-5 bg-[#d7b56d]" /> {t('registration.trustedOnboarding')}
            </div>
            <h1 className="font-[var(--font-display)] text-5xl font-semibold leading-[1.02] tracking-[-.055em] xl:text-6xl">
              {t('registration.heroPrefix')}
              <span className="block text-emerald-300">{t('registration.heroAccent')}</span>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-8 text-white/48">
              {t('registration.heroDescription')}
            </p>

            <div className="mt-10 space-y-3">
              {safeguards.map(([number, title, description]) => (
                <article
                  key={number}
                  className="grid grid-cols-[2.5rem_1fr] gap-4 rounded-2xl border border-white/[.08] bg-white/[.045] p-4 backdrop-blur"
                >
                  <span className="text-[10px] font-black tracking-[.15em] text-[#d7b56d]">
                    {number}
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-white/80">{title}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-white/38">
                      {description}
                    </span>
                  </span>
                </article>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-between text-[10px] text-white/28">
            <span>{t('registration.identityMembershipTenant')}</span>
            <Link href="/login" className="transition hover:text-white/70">
              {t('registration.signInInstead')}
            </Link>
          </div>
        </aside>

        <section className="relative flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
          <Link
            href="/"
            className="absolute left-6 top-6 inline-flex items-center gap-3 font-[var(--font-display)] font-bold lg:hidden"
          >
            <span className="grid size-10 place-items-center rounded-[.9rem] bg-[#0b2f28] text-sm text-emerald-300 shadow-inner">
              M
            </span>
            <span>MedSphere</span>
          </Link>

          <div className="w-full max-w-[36rem] pt-20 lg:pt-0">
            <div className="mb-6 flex justify-end">
              <LanguageSelector />
            </div>
            <div className="mb-8">
              <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-emerald-700">
                {t('registration.sectionLabel')}
              </p>
              <h2 className="mt-3 font-[var(--font-display)] text-4xl font-semibold tracking-[-.05em] text-[#10201c] sm:text-5xl">
                {t('registration.title')}
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-7 text-[#60706b]">
                {t('registration.description')}
              </p>
            </div>
            <RegistrationForm />
            <div className="mt-7 flex items-start gap-3 border-t border-[#10201c]/[.08] pt-5 text-xs leading-5 text-[#71807b]">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#d7b56d]" />
              {t('registration.testDataNotice')}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
