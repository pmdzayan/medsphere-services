'use client';

import Script from 'next/script';
import { useRef, useState } from 'react';

import { useLanguage } from '@/components/language-provider';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              type?: 'standard';
              theme?: 'outline';
              size?: 'large';
              text?: 'continue_with';
              shape?: 'rectangular';
              width?: number;
            },
          ): void;
        };
      };
    };
  }
}

interface GoogleCredentialButtonProps {
  pending?: boolean;
  onCredential: (credential?: string) => void | Promise<void>;
}

export function GoogleCredentialButton({
  pending = false,
  onCredential,
}: GoogleCredentialButtonProps) {
  const { t } = useLanguage();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.trim();

  function initializeGoogle(): void {
    if (!clientId || !window.google || !buttonRef.current) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: ({ credential }) => {
        void onCredential(credential);
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

    setReady(true);
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

      <div className="space-y-3">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-[#10201c]/10" />
          <span className="text-xs font-semibold text-[#71807b]">{t('common.or')}</span>
          <span className="h-px flex-1 bg-[#10201c]/10" />
        </div>

        <div
          ref={buttonRef}
          className={pending ? 'pointer-events-none opacity-60' : ''}
          aria-busy={pending}
        />

        {!ready ? (
          <p className="text-center text-xs text-[#71807b]">{t('auth.googleLoading')}</p>
        ) : null}
      </div>
    </>
  );
}
