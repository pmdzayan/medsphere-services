'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { register, requestPhoneOtp, verifyPhoneOtp } from '@/lib/api-client';
import {
  normalizeRegistrationRequest,
  type RegistrationRequest,
  validateRegistrationRequest,
} from '@/lib/auth-contract';
import { HEALTHCARE_ORGANIZATION_TYPES, type OrganizationType } from '@/lib/organization-types';
import type { TranslationKey } from '@/lib/i18n';
import { GoogleRegister } from './google-register';

type RegistrationField = keyof RegistrationRequest;
type FormErrors = Partial<Record<RegistrationField | 'confirmPassword' | 'form', string>>;

const validationMessageKeys: Record<string, TranslationKey> = {
  'Choose an organization type.': 'registration.errorOrganizationType',
  'Enter the organization code provided by your administrator.':
    'registration.errorOrganizationCode',
  'Enter a valid email address.': 'registration.errorEmail',
  'Enter a valid phone number including country code.': 'registration.errorPhone',
  'Password must be between 15 and 128 characters.': 'registration.errorPassword',
  'Enter a first name between 1 and 100 characters.': 'registration.errorFirstName',
  'Enter a last name between 1 and 100 characters.': 'registration.errorLastName',
};

const organizationTypeLabelKeys: Record<OrganizationType, TranslationKey> = {
  PHARMACY: 'registration.orgType.pharmacy',
  HOSPITAL: 'registration.orgType.hospital',
  LABORATORY: 'registration.orgType.laboratory',
  CLINIC: 'registration.orgType.clinic',
  BLOOD_BANK: 'registration.orgType.bloodBank',
  SUPPLIER: 'registration.orgType.supplier',
  NONE: 'registration.orgType.none',
};

export function RegistrationForm() {
  const { t } = useLanguage();
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [organizationType, setOrganizationType] = useState<OrganizationType | ''>('');
  const [organizationCode, setOrganizationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  const requiresOrganizationCode = organizationType !== '' && organizationType !== 'NONE';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedType = (String(form.get('organizationType') ?? '') || 'NONE') as OrganizationType;
    const request = normalizeRegistrationRequest({
      organizationType: selectedType,
      organizationCode:
        selectedType === 'NONE' ? undefined : String(form.get('organizationCode') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      phone: String(form.get('phone') ?? ''),
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
      setVerificationEmail(request.email);
      setConfirmation(true);
      setVerificationPending(true);
      try {
        await requestPhoneOtp({ email: request.email });
      } catch {
        setVerificationError(t('registration.verificationSendError'));
      } finally {
        setVerificationPending(false);
      }
    } catch {
      setErrors({ form: t('registration.errorGeneric') });
    } finally {
      setPending(false);
    }
  }

  async function handleVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(verificationCode)) {
      setVerificationError(t('registration.verificationCodeError'));
      return;
    }
    setVerificationPending(true);
    setVerificationError('');
    try {
      await verifyPhoneOtp({ email: verificationEmail, code: verificationCode });
      setVerificationComplete(true);
    } catch {
      setVerificationError(t('registration.verificationCodeError'));
    } finally {
      setVerificationPending(false);
    }
  }

  async function resendVerificationCode() {
    setVerificationPending(true);
    setVerificationError('');
    try {
      await requestPhoneOtp({ email: verificationEmail });
    } catch {
      setVerificationError(t('registration.verificationSendError'));
    } finally {
      setVerificationPending(false);
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
        {organizationType !== 'NONE' ? (
          <div className="mt-4 rounded-2xl border border-emerald-900/[.08] bg-white/70 p-4 text-xs leading-6 text-[#60736d]">
            {t('registration.pendingMembershipExplanation')}
          </div>
        ) : null}
        {verificationComplete ? (
          <div className="mt-4 rounded-2xl border border-emerald-700/20 bg-white p-4 text-sm font-semibold text-emerald-800">
            {t('registration.verificationComplete')}
          </div>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={handleVerification} noValidate>
            <label
              htmlFor="registration-verification-code"
              className="block text-xs font-bold text-[#43524e]"
            >
              {t('registration.verificationCode')}
            </label>
            <input
              id="registration-verification-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl border border-[#10201c]/[.11] bg-white px-4 py-3.5 text-center text-lg tracking-[.35em] text-[#10201c]"
              aria-invalid={Boolean(verificationError)}
            />
            {verificationError ? (
              <p className="text-xs text-red-700" role="alert">
                {verificationError}
              </p>
            ) : (
              <p className="text-xs text-[#60736d]">{t('registration.verificationSent')}</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                disabled={verificationPending}
                className="min-h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white disabled:opacity-60"
              >
                {t('registration.verifyCode')}
              </button>
              <button
                type="button"
                disabled={verificationPending}
                onClick={resendVerificationCode}
                className="min-h-11 rounded-xl border border-emerald-900/10 bg-white px-5 text-sm font-bold text-[#264b40] disabled:opacity-60"
              >
                {t('registration.resendCode')}
              </button>
            </div>
          </form>
        )}
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
              setVerificationCode('');
              setVerificationComplete(false);
              setVerificationError('');
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
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          error={errors.firstName}
        />
        <Field
          name="lastName"
          label={t('registration.lastName')}
          autoComplete="family-name"
          maxLength={100}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          error={errors.lastName}
        />
      </div>
      <div className="block">
        <label
          htmlFor="registration-organizationType"
          className="mb-2 block text-xs font-bold text-[#43524e]"
        >
          {t('registration.organizationType')}
        </label>
        <select
          id="registration-organizationType"
          name="organizationType"
          required
          value={organizationType}
          onChange={(event) => setOrganizationType(event.target.value as OrganizationType)}
          aria-invalid={Boolean(errors.organizationType)}
          className="w-full rounded-xl border border-[#10201c]/[.11] bg-[#fbfaf5] px-4 py-3.5 text-sm text-[#10201c] shadow-[0_1px_0_rgba(255,255,255,.8)_inset] transition hover:border-[#10201c]/25 focus:border-emerald-600 focus:bg-white"
        >
          <option value="" disabled>
            {t('registration.organizationType')}
          </option>
          {HEALTHCARE_ORGANIZATION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(organizationTypeLabelKeys[type])}
            </option>
          ))}
          <option value="NONE">{t(organizationTypeLabelKeys.NONE)}</option>
        </select>
        {errors.organizationType ? (
          <span className="mt-2 block text-xs text-red-700" role="alert">
            {errors.organizationType}
          </span>
        ) : null}
      </div>
      {requiresOrganizationCode ? (
        <Field
          name="organizationCode"
          label={t('registration.organizationCode')}
          description={t('registration.organizationCodeDescription')}
          placeholder="MED-X7P42-Q9K3R"
          autoComplete="off"
          maxLength={40}
          value={organizationCode}
          onChange={(event) => setOrganizationCode(event.target.value)}
          error={errors.organizationCode}
        />
      ) : null}
      <Field
        name="email"
        label={t('registration.workEmail')}
        placeholder="you@organization.com"
        type="email"
        autoComplete="email"
        maxLength={254}
        error={errors.email}
      />
      <Field
        name="phone"
        label={t('registration.phone')}
        description={t('registration.phoneDescription')}
        placeholder="+91 98765 43210"
        type="tel"
        autoComplete="tel"
        maxLength={20}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        error={errors.phone}
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
      <div className="space-y-4">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-[#10201c]/10" />
          <span className="text-xs font-semibold text-[#71807b]">or</span>
          <span className="h-px flex-1 bg-[#10201c]/10" />
        </div>

        <div className="flex justify-center">
          <GoogleRegister
            organizationType={organizationType || 'NONE'}
            organizationCode={organizationCode}
            firstName={firstName}
            lastName={lastName}
            phone={phone}
            onSuccess={() => {
              setErrors({});
              setConfirmation(true);
            }}
            onError={() => setErrors({ form: t('registration.errorGeneric') })}
          />
        </div>
      </div>

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
