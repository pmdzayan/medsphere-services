'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { GoogleCredentialButton } from '@/components/auth/google-credential-button';
import { useLanguage } from '@/components/language-provider';
import { googleLogin, selectGoogleOrganizationLogin } from '@/lib/api-client';
import type { OrganizationChoice } from '@/lib/auth-contract';

interface GoogleSignInProps {
  onSelectionStateChange?: (selecting: boolean) => void;
}

export function GoogleSignIn({ onSelectionStateChange }: GoogleSignInProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [credential, setCredential] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationChoice[] | null>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();

  function completeLogin(): void {
    router.replace('/dashboard');
    router.refresh();
  }

  async function handleCredential(idToken?: string): Promise<void> {
    if (!idToken) {
      setError(t('auth.googleCredentialInvalid'));
      return;
    }

    setPending(true);
    setError('');

    try {
      const result = await googleLogin({ idToken });
      if ('requiresOrganizationSelection' in result) {
        setCredential(idToken);
        setOrganizations(result.organizations);
        onSelectionStateChange?.(true);
        return;
      }
      completeLogin();
    } catch {
      setError(t('auth.googleFailed'));
    } finally {
      setPending(false);
    }
  }

  async function handleOrganizationSelection(membershipId: string): Promise<void> {
    if (!credential) {
      setError(t('auth.googleCredentialInvalid'));
      return;
    }

    setPending(true);
    setError('');
    try {
      await selectGoogleOrganizationLogin({ idToken: credential, membershipId });
      completeLogin();
    } catch {
      setError(t('auth.googleFailed'));
    } finally {
      setPending(false);
    }
  }

  function resetSelection(): void {
    setCredential(null);
    setOrganizations(null);
    setError('');
    onSelectionStateChange?.(false);
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
                onClick={() => handleOrganizationSelection(organization.membershipId)}
                className="w-full rounded-xl border border-[#10201c]/[.11] bg-[#fbfaf5] px-4 py-3.5 text-left text-sm text-[#10201c] transition hover:border-emerald-600 disabled:cursor-wait disabled:opacity-60"
              >
                {organization.organizationName}
              </button>
            </li>
          ))}
        </ul>
        {error ? (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={resetSelection}
          className="text-xs font-bold text-[#264b40] underline disabled:cursor-wait disabled:opacity-60"
        >
          {t('auth.back')}
        </button>
      </div>
    );
  }

  if (!googleClientId) {
    return null;
  }

  return (
    <div className="space-y-3">
      <GoogleCredentialButton pending={pending} onCredential={handleCredential} />
      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
