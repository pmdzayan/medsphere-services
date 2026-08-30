'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/language-provider';
import { identifyLogin, selectOrganizationLogin } from '@/lib/api-client';
import {
  normalizeIdentifyLoginRequest,
  validateIdentifyLoginRequest,
  type OrganizationChoice,
} from '@/lib/auth-contract';
import { loginCopy } from './login-copy';

type Fields = 'email' | 'password';

/**
 * Task 0010: slug-free sign in. A normal user never enters, sees, or
 * needs to understand a tenant slug/ID here -- identity (email +
 * password) is verified first; if that resolves to more than one active
 * organization membership, a second step lets the person choose using
 * only the organization display information their own verified identity
 * is authorized to see (never a general organization search).
 */
export function LoginForm() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const copy = loginCopy[locale];
  const [errors, setErrors] = useState<Partial<Record<Fields | 'form', string>>>({});
  const [pending, setPending] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationChoice[] | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  async function handleIdentify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const request = normalizeIdentifyLoginRequest({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });
    const validation = validateIdentifyLoginRequest(request);
    if (Object.keys(validation).length > 0) {
      setErrors({
        email: validation.email ? copy.errorEmail : undefined,
        password: validation.password ? copy.errorPassword : undefined,
      });
      return;
    }

    setPending(true);
    setErrors({});
    try {
      const result = await identifyLogin(request);
      if ('requiresOrganizationSelection' in result) {
        setOrganizations(result.organizations);
        setCredentials(request);
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setErrors({ form: copy.errorGeneric });
    } finally {
      setPending(false);
    }
  }

  async function handleSelectOrganization(membershipId: string) {
    if (!credentials) return;
    setPending(true);
    setErrors({});
    try {
      await selectOrganizationLogin({ ...credentials, membershipId });
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setErrors({ form: copy.errorGeneric });
    } finally {
      setPending(false);
    }
  }

  if (organizations) {
    return (
      <div className="space-y-4">
        <p className="text-sm font-bold text-[#43524e]">{t('auth.chooseOrganization')}</p>
        <ul className="space-y-2">
          {organizations.map((organization) => (
            <li key={organization.membershipId}>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleSelectOrganization(organization.membershipId)}
                className="w-full rounded-xl border border-[#10201c]/[.11] bg-[#fbfaf5] px-4 py-3.5 text-left text-sm text-[#10201c] transition hover:border-emerald-600 disabled:cursor-wait disabled:opacity-60"
              >
                {organization.organizationName}
              </button>
            </li>
          ))}
        </ul>
        {errors.form ? (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {errors.form}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setOrganizations(null);
            setCredentials(null);
            setErrors({});
          }}
          className="text-xs font-bold text-[#264b40] underline"
        >
          {t('auth.back')}
        </button>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleIdentify} noValidate>
      <Field
        name="email"
        label={copy.workEmail}
        placeholder="you@organization.com"
        type="email"
        autoComplete="username"
        error={errors.email}
      />
      <Field
        name="password"
        label={copy.password}
        type="password"
        autoComplete="current-password"
        error={errors.password}
      />
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
        className="group mt-2 flex w-full items-center justify-center gap-3 rounded-xl bg-[#0b2f28] px-5 py-4 text-sm font-bold text-white shadow-[0_18px_35px_-20px_rgba(11,47,40,.8)] transition hover:-translate-y-0.5 hover:bg-[#075f49] disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {pending ? copy.signingIn : copy.signInSecurely}
        {!pending ? (
          <span className="transition-transform group-hover:translate-x-1" aria-hidden="true">
            →
          </span>
        ) : null}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = `field-${input.name}`;
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-2 block text-xs font-bold text-[#43524e]">{label}</span>
      <input
        {...input}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-xl border border-[#10201c]/[.11] bg-[#fbfaf5] px-4 py-3.5 text-sm text-[#10201c] shadow-[0_1px_0_rgba(255,255,255,.8)_inset] transition placeholder:text-[#9aa49f] hover:border-[#10201c]/25 focus:border-emerald-600 focus:bg-white"
      />
      {error ? (
        <span id={`${id}-error`} className="mt-2 block text-xs text-red-700" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
