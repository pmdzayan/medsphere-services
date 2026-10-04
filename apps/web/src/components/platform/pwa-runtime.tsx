'use client';

import { useEffect, useRef, useState } from 'react';

import { useLanguage } from '@/components/language-provider';
import { WEB_UPDATE_CHECK_INTERVAL_MS, shouldCheckForWebUpdate } from '@/lib/pwa-update-policy';

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
 *
 * UM14.3 update behavior is deliberately user-controlled: discovery may happen
 * automatically, but activation/reload occurs only after "Update now".
 */
export function PwaRuntime() {
  const { t } = useLanguage();
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<AimBeforeInstallPromptEvent | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastUpdateCheckAt = useRef(0);
  const reloadingForUpdate = useRef(false);
  const updateRecoveryTimer = useRef<number | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);

    let cancelled = false;
    let registered: ServiceWorkerRegistration | null = null;
    let updateFoundHandler: (() => void) | null = null;

    const checkForUpdate = (force = false) => {
      const current = registrationRef.current;
      if (!current) return;
      const now = Date.now();
      if (
        !force &&
        !shouldCheckForWebUpdate({
          online: navigator.onLine,
          visibilityState: document.visibilityState === 'visible' ? 'visible' : 'hidden',
          lastCheckedAt: lastUpdateCheckAt.current,
          now,
        })
      ) {
        return;
      }

      lastUpdateCheckAt.current = now;
      void current
        .update()
        .then(() => {
          if (!cancelled && current.waiting) setUpdateReady(true);
        })
        .catch(() => {
          // Update discovery is an enhancement; existing healthcare work stays available.
        });
    };

    const handleOnline = () => {
      setOnline(true);
      checkForUpdate();
    };
    const handleOffline = () => setOnline(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    const handleFocus = () => checkForUpdate();
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
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    navigator.serviceWorker?.addEventListener('controllerchange', handleControllerChange);

    const interval = window.setInterval(() => checkForUpdate(), WEB_UPDATE_CHECK_INTERVAL_MS);

    if (!('serviceWorker' in navigator) || !canRegisterAimServiceWorker(window.location)) {
      return () => {
        window.clearInterval(interval);
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
        window.removeEventListener('appinstalled', handleInstalled);
      };
    }

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
        if (worker.state === 'installed' || worker.state === 'redundant') {
          worker.removeEventListener('statechange', handleStateChange);
        }
      };
      worker.addEventListener('statechange', handleStateChange);
      handleStateChange();
    };

    void navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((nextRegistration) => {
        if (cancelled) return;
        registered = nextRegistration;
        registrationRef.current = nextRegistration;
        setRegistration(nextRegistration);
        setUpdateReady(Boolean(nextRegistration.waiting));

        updateFoundHandler = () => observeInstallingWorker(nextRegistration.installing);
        nextRegistration.addEventListener('updatefound', updateFoundHandler);
        observeInstallingWorker(nextRegistration.installing);

        checkForUpdate(true);
      })
      .catch(() => {
        // PWA enhancement must never block rendering, auth, or healthcare work.
      });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (registered && updateFoundHandler) {
        registered.removeEventListener('updatefound', updateFoundHandler);
      }
      registrationRef.current = null;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleControllerChange);
      if (updateRecoveryTimer.current !== null) {
        window.clearTimeout(updateRecoveryTimer.current);
      }
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
    const currentRegistration = registration ?? registrationRef.current;
    const waiting = currentRegistration?.waiting;
    if (!waiting) {
      await currentRegistration?.update().catch(() => undefined);
      setUpdateReady(Boolean(currentRegistration?.waiting));
      return;
    }

    setApplyingUpdate(true);
    reloadingForUpdate.current = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });

    updateRecoveryTimer.current = window.setTimeout(() => {
      reloadingForUpdate.current = false;
      setApplyingUpdate(false);
      setUpdateReady(Boolean(registrationRef.current?.waiting));
    }, 10_000);
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
        className="workstation-surface fixed inset-x-4 bottom-24 z-[80] mx-auto max-w-xl rounded-2xl border px-4 py-3 shadow-lg lg:bottom-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-sm">
            <p className="text-sm font-semibold">{t('workstation.pwa.updateReady')}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {t('workstation.pwa.updateDescription')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={applyingUpdate}
              onClick={() => setUpdateReady(false)}
              className="organization-theme-focus min-h-11 touch-manipulation rounded-xl border border-[var(--org-border)] px-4 text-sm font-bold disabled:opacity-50"
            >
              {t('workstation.pwa.later')}
            </button>
            <button
              type="button"
              disabled={applyingUpdate}
              onClick={() => void applyUpdate()}
              className="organization-theme-focus min-h-11 touch-manipulation rounded-xl bg-[var(--org-primary)] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-70"
            >
              {applyingUpdate ? t('workstation.pwa.updating') : t('workstation.pwa.updateNow')}
            </button>
          </div>
        </div>
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
