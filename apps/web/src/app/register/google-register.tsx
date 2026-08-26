'use client';

import Script from 'next/script';
import { useRef, useState } from 'react';

import { googleRegister } from '@/lib/api-client';
import { normalizeGoogleRegisterRequest, validateGoogleRegisterRequest } from '@/lib/auth-contract';

interface GoogleRegisterProps {
  tenantSlug: string;
  firstName: string;
  lastName: string;
  phone: string;
  onSuccess: () => void;
  onError: () => void;
}

export function GoogleRegister({
  tenantSlug,
  firstName,
  lastName,
  phone,
  onSuccess,
  onError,
}: GoogleRegisterProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();

  function initializeGoogle(): void {
    if (!clientId || !window.google || !buttonRef.current) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        const request = normalizeGoogleRegisterRequest({
          tenantSlug,
          idToken: credential,
          firstName,
          lastName,
          phone,
        });

        if (Object.keys(validateGoogleRegisterRequest(request)).length > 0) {
          onError();
          return;
        }

        setPending(true);

        try {
          await googleRegister(request);

          onSuccess();
        } catch {
          onError();
        } finally {
          setPending(false);
        }
      },
    });

    buttonRef.current.replaceChildren();

    window.google.accounts.id.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 320,
    });
  }

  if (!clientId) {
    return null;
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={initializeGoogle}
      />

      <div
        ref={buttonRef}
        className={pending ? 'pointer-events-none opacity-60' : ''}
        aria-busy={pending}
      />
    </>
  );
}
