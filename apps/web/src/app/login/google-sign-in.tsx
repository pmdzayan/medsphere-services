'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { GoogleCredentialButton } from '@/components/auth/google-credential-button';
import { useLanguage } from '@/components/language-provider';
import { googleLogin } from '@/lib/api-client';
import { normalizeTenantSlug } from '@/lib/auth-contract';

interface GoogleSignInProps {
  tenantSlug: string;
  onError: (message: string) => void;
}

export function GoogleSignIn({ tenantSlug, onError }: GoogleSignInProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);

  async function handleCredential(credential?: string): Promise<void> {
    const normalizedTenantSlug = normalizeTenantSlug(tenantSlug);

    if (!normalizedTenantSlug) {
      onError(t('auth.googleMissingOrganization'));
      return;
    }

    if (!credential) {
      onError(t('auth.googleCredentialInvalid'));
      return;
    }

    setPending(true);
    onError('');

    try {
      await googleLogin({
        tenantSlug: normalizedTenantSlug,
        idToken: credential,
      });

      router.replace('/dashboard');
      router.refresh();
    } catch {
      onError(t('auth.googleFailed'));
    } finally {
      setPending(false);
    }
  }

  return <GoogleCredentialButton pending={pending} onCredential={handleCredential} />;
}
