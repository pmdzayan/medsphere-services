'use client';

import { useEffect, useRef, useState } from 'react';

import { useLanguage } from '@/components/language-provider';

interface AimBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isLocalDevelopmentHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function canRegisterAimServiceWorker(
  location: Pick<Location, 'protocol' | 'hostname'>,
): boolean {
  return location.protocol === 'https:' || isLocalDevelopmentHost(location.hostname);
}

/**
 * Registers AIM's privacy-conservative service worker and exposes only
 * install/update/connectivity controls.
 *
 * The worker itself caches public/versioned static assets only. It never
 * intercepts API traffic or page navigations, so protected healthcare state
 * remains network/server authoritative even when the application shell is
 * installable.
 */
export function PwaRuntime() {
  const { t } = useLanguage();
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<AimBeforeInstallPromptEvent | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const reloadingForUpdate = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstallPrompt = (event: Event) => {
      const promptEvent = event as AimBeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => setInstallPrompt(null);
    const handleControllerChange = () => {
      if (reloadingForUpdate.current) window.location.reload();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

    if (!('serviceWorker' in navigator) || !canRegisterAimServiceWorker(window.location)) {
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
        window.removeEventListener('appinstalled', handleInstalled);
      };
    }

    let cancelled = false;
    let activeRegistration: ServiceWorkerRegistration | null = null;

    const observeInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const handleStateChange = () => {
        if (
          !cancelled &&
          worker.state === 'installed' &&
          Boolean(navigator.serviceWorker.controller)
        ) {
          setUpdateReady(true);
        }
      };
      worker.addEventListener('statechange', handleStateChange, { once: true });
    };

    void navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((nextRegistration) => {
        if (cancelled) return;
        activeRegistration = nextRegistration;
        setRegistration(nextRegistration);
        setUpdateReady(Boolean(nextRegistration.waiting));

        const handleUpdateFound = () => observeInstallingWorker(nextRegistration.installing);
        nextRegistration.addEventListener('updatefound', handleUpdateFound);
        observeInstallingWorker(nextRegistration.installing);

        void nextRegistration.update();
      })
      .catch(() => {
        // PWA enhancement must never block rendering, auth, or healthcare work.
      });

    return () => {
      cancelled = true;
      activeRegistration = null;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  async function installApplication() {
    if (!installPrompt) return;
    const prompt = installPrompt;
    setInstallPrompt(null);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // Installation is optional and must never interfere with the workstation.
    }
  }

  async function applyUpdate() {
    const waiting = registration?.waiting;
    if (waiting) {
      reloadingForUpdate.current = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    await registration?.update().catch(() => undefined);
  }

  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-4 bottom-24 z-[80] mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-lg lg:bottom-5"
      >
        {t('workstation.pwa.offline')}
      </div>
    );
  }

  if (updateReady) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="workstation-surface fixed inset-x-4 bottom-24 z-[80] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg lg:bottom-5"
      >
        <span className="text-sm font-semibold">{t('workstation.pwa.updateReady')}</span>
        <button
          type="button"
          onClick={() => void applyUpdate()}
          className="organization-theme-focus min-h-11 touch-manipulation rounded-xl bg-[var(--org-primary)] px-4 text-sm font-bold text-white"
        >
          {t('workstation.pwa.reload')}
        </button>
      </div>
    );
  }

  if (installPrompt) {
    return (
      <div
        role="status"
        className="workstation-surface fixed inset-x-4 bottom-24 z-[80] mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg lg:bottom-5"
      >
        <span className="max-w-sm text-sm">{t('workstation.pwa.installHint')}</span>
        <button
          type="button"
          onClick={() => void installApplication()}
          className="organization-theme-focus min-h-11 touch-manipulation rounded-xl border border-[var(--org-border)] px-4 text-sm font-bold"
        >
          {t('workstation.pwa.install')}
        </button>
      </div>
    );
  }

  return null;
}
