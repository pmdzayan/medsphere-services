'use client';

import { FormEvent, useState } from 'react';
import { login } from '@/lib/api-client';
import { normalizeTenantSlug, validateLoginRequest } from '@/lib/auth-contract';

type Fields = 'tenantSlug' | 'email' | 'password';

export function LoginForm() {
  const [errors, setErrors] = useState<Partial<Record<Fields | 'form', string>>>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const request = {
      tenantSlug: normalizeTenantSlug(String(form.get('tenantSlug') ?? '')),
      email: String(form.get('email') ?? '')
        .trim()
        .toLowerCase(),
      password: String(form.get('password') ?? ''),
    };
    const validation = validateLoginRequest(request);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setPending(true);
    setErrors({});
    try {
      await login(request);
      setErrors({ form: 'Signed in securely. Your workspace is being prepared.' });
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'Sign-in failed.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Field
        name="tenantSlug"
        label="Organization slug"
        placeholder="central-pharmacy"
        autoComplete="organization"
        error={errors.tenantSlug}
      />
      <Field
        name="email"
        label="Work email"
        placeholder="you@organization.com"
        type="email"
        autoComplete="username"
        error={errors.email}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password}
      />
      {errors.form ? (
        <p
          className="rounded-xl border border-[#10201c]/[.08] bg-[#f3f1e9] px-4 py-3 text-sm text-[#50605b]"
          role="status"
        >
          {errors.form}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="group mt-2 flex w-full items-center justify-center gap-3 rounded-xl bg-[#0b2f28] px-5 py-4 text-sm font-bold text-white shadow-[0_18px_35px_-20px_rgba(11,47,40,.8)] transition hover:-translate-y-0.5 hover:bg-[#075f49] disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {pending ? 'Signing in…' : 'Sign in securely'}
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
        <span id={`${id}-error`} className="mt-2 block text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}
