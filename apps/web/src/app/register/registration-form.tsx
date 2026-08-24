'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { register } from '@/lib/api-client';
import {
  normalizeRegistrationRequest,
  type RegistrationRequest,
  validateRegistrationRequest,
} from '@/lib/auth-contract';
import type { TranslationKey } from '@/lib/i18n';

type RegistrationField = keyof RegistrationRequest;
type FormErrors = Partial<Record<RegistrationField | 'confirmPassword' | 'form', string>>;

const validationMessageKeys: Record<string, TranslationKey> = {
  'Use the organization slug provided by your administrator.': 'registration.errorTenant',
  'Enter a valid email address.': 'registration.errorEmail',
  'Password must be between 15 and 128 characters.': 'registration.errorPassword',
  'Enter a first name between 1 and 100 characters.': 'registration.errorFirstName',
  'Enter a last name between 1 and 100 characters.': 'registration.errorLastName',
};

export function RegistrationForm() {
  const { t } = useLanguage();
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const request = normalizeRegistrationRequest({
      tenantSlug: String(form.get('tenantSlug') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
    });
    const contractErrors = validateRegistrationRequest(request);
    const nextErrors: FormErrors = {};
    for (const [field, message] of Object.entries(contractErrors)) {
      const key = validationMessageKeys[message];
      nextErrors[field as RegistrationField] = key ? t(key) : message;
    }
    if (String(form.get('confirmPassword') ?? '') !== request.password) {
      nextErrors.confirmPassword = t('registration.errorConfirmPassword');
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setPending(true);
    setErrors({});
    try {
      await register(request);
      setConfirmation(true);
    } catch {
      setErrors({ form: t('registration.errorGeneric') });
    } finally {
      setPending(false);
    }
  }

  if (confirmation) {
    return (
      <section
        className="rounded-[1.5rem] border border-emerald-900/10 bg-emerald-50/70 p-6 shadow-[0_18px_55px_-38px_rgba(7,95,73,.5)] sm:p-8"
        aria-live="polite"
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-[#0b342b] text-xl text-emerald-200">
          ✓
        </span>
        <p className="mt-6 text-[10px] font-extrabold uppercase tracking-[.2em] text-emerald-700">
          {t('registration.requestReceived')}
        </p>
        <h2 className="mt-2 font-[var(--font-display)] text-2xl font-bold tracking-[-.035em] text-[#15372d]">
          {t('registration.queuedTitle')}
        </h2>
        <p className="mt-4 text-sm leading-7 text-[#526b63]">
          {t('registration.confirmationMessage')}
        </p>
        <div className="mt-6 rounded-2xl border border-emerald-900/[.08] bg-white/70 p-4 text-xs leading-6 text-[#60736d]">
          {t('registration.privacyConfirmation')}
        </div>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0b342b] px-5 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            {t('registration.returnSignIn')}
          </Link>
          <button
            type="button"
            onClick={() => {
              setConfirmation(false);
              setErrors({});
              setShowPassword(false);
            }}
            className="min-h-12 rounded-xl border border-[#17372e]/10 bg-white px-5 text-sm font-bold text-[#264b40] transition hover:border-emerald-700/25"
          >
            {t('registration.submitAnother')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="firstName"
          label={t('registration.firstName')}
          autoComplete="given-name"
          maxLength={100}
          error={errors.firstName}
        />
        <Field
          name="lastName"
          label={t('registration.lastName')}
          autoComplete="family-name"
          maxLength={100}
          error={errors.lastName}
        />
      </div>
      <Field
        name="tenantSlug"
        label={t('registration.organizationSlug')}
        description={t('registration.organizationSlugDescription')}
        placeholder="central-pharmacy"
        autoComplete="organization"
        maxLength={100}
        error={errors.tenantSlug}
      />
      <Field
        name="email"
        label={t('registration.workEmail')}
        placeholder="you@organization.com"
        type="email"
        autoComplete="email"
        maxLength={254}
        error={errors.email}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="password"
          label={t('registration.createPassword')}
          description={t('registration.passwordDescription')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          error={errors.password}
        />
        <Field
          name="confirmPassword"
          label={t('registration.confirmPassword')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          error={errors.confirmPassword}
        />
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-3 text-xs font-semibold text-[#536861]">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(event) => setShowPassword(event.target.checked)}
          className="size-4 rounded border-[#17372e]/20 text-emerald-700"
        />
        {t('registration.showPassword')}
      </label>
      {errors.form ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {errors.form}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="group flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#0b2f28] px-5 text-sm font-bold text-white shadow-[0_18px_35px_-20px_rgba(11,47,40,.8)] transition hover:-translate-y-0.5 hover:bg-[#075f49] disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {pending ? t('registration.submitting') : t('registration.requestAccess')}
        {!pending ? (
          <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">
            →
          </span>
        ) : null}
      </button>
      <p className="text-center text-xs leading-5 text-[#71807b]">
        {t('registration.alreadyMember')}{' '}
        <Link href="/login" className="font-bold text-emerald-800 hover:text-emerald-600">
          {t('registration.signIn')}
        </Link>
      </p>
    </form>
  );
}

function Field({
  label,
  description,
  error,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  description?: string;
  error?: string;
}) {
  const id = `registration-${input.name}`;
  const describedBy = [description ? `${id}-description` : '', error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="block">
      <label htmlFor={id} className="mb-2 block text-xs font-bold text-[#43524e]">
        {label}
      </label>
      <input
        {...input}
        id={id}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className="w-full rounded-xl border border-[#10201c]/[.11] bg-[#fbfaf5] px-4 py-3.5 text-sm text-[#10201c] shadow-[0_1px_0_rgba(255,255,255,.8)_inset] transition placeholder:text-[#9aa49f] hover:border-[#10201c]/25 focus:border-emerald-600 focus:bg-white"
      />
      {description ? (
        <span id={`${id}-description`} className="mt-2 block text-[11px] leading-5 text-[#788781]">
          {description}
        </span>
      ) : null}
      {error ? (
        <span id={`${id}-error`} className="mt-2 block text-xs text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
