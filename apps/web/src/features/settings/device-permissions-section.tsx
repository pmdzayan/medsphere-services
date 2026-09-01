'use client';

import { useEffect, useState } from 'react';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { PermissionExplanationDialog } from '@/components/permission-explanation-dialog';
import { useLanguage } from '@/components/language-provider';
import {
  readBrowserCapability,
  requestBrowserNotifications,
  type BrowserCapabilityState,
} from '@/lib/browser-permissions';
import { getConsentStatus, recordConsent } from '@/lib/api-client';
import type { ConsentCategory, ConsentStatus } from '@/lib/settings-contract';

const locationBadgeTone: Record<BrowserCapabilityState, 'emerald' | 'amber' | 'cyan'> = {
  granted: 'emerald',
  denied: 'amber',
  prompt: 'cyan',
  unsupported: 'amber',
  unavailable: 'amber',
  error: 'amber',
};

const notificationBadgeTone: Record<BrowserCapabilityState, 'emerald' | 'amber' | 'cyan'> = {
  granted: 'emerald',
  denied: 'amber',
  prompt: 'cyan',
  unsupported: 'amber',
  unavailable: 'amber',
  error: 'amber',
};

/**
 * Task 0013: this section only ever *displays* current browser capability
 * state (read via the Task 0012 central browser-permissions boundary, never
 * inferred) and offers a contextual way to invoke the real browser prompt
 * for notifications specifically -- it never fakes a way to "re-open" a
 * permission the browser has permanently denied (see the denied-state
 * messaging below), and it never lets an app-level preference toggle imply
 * the browser permission itself changed.
 */
export function DevicePermissionsSection() {
  const { t } = useLanguage();
  const [locationState, setLocationState] = useState<BrowserCapabilityState>('prompt');
  const [notificationState, setNotificationState] = useState<BrowserCapabilityState>('prompt');
  const [showNotificationExplanation, setShowNotificationExplanation] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [consent, setConsent] = useState<ConsentStatus[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      readBrowserCapability('location'),
      readBrowserCapability('notifications'),
    ]).then(([location, notifications]) => {
      if (cancelled) return;
      setLocationState(location);
      setNotificationState(notifications);
    });
    getConsentStatus()
      .then((status) => {
        if (!cancelled) setConsent(status);
      })
      .catch(() => {
        if (!cancelled) setConsent(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConsentChange(category: ConsentCategory, next: 'GRANTED' | 'WITHDRAWN') {
    try {
      const updated = await recordConsent({
        category,
        status: next,
        source: 'settings_privacy_page',
      });
      setConsent((prev) =>
        prev ? prev.map((entry) => (entry.category === category ? updated : entry)) : [updated],
      );
    } catch {
      // A failed consent write must never be silently assumed to have
      // succeeded; leaving the prior displayed state in place is safer
      // than optimistically flipping it.
    }
  }

  async function handleNotificationContinue() {
    setShowNotificationExplanation(false);
    setNotificationBusy(true);
    try {
      const result = await requestBrowserNotifications();
      setNotificationState(result);
      if (result === 'granted') {
        await handleConsentChange('NOTIFICATIONS_RESERVATIONS', 'GRANTED');
      }
    } finally {
      setNotificationBusy(false);
    }
  }

  const locationConsent = consent?.find((entry) => entry.category === 'LOCATION_USE');
  const reservationConsent = consent?.find(
    (entry) => entry.category === 'NOTIFICATIONS_RESERVATIONS',
  );

  const locationDenied = locationState === 'denied';
  const notificationDenied = notificationState === 'denied';
  const notificationPrompt = notificationState === 'prompt';
  const notificationGranted = notificationState === 'granted';

  return (
    <SectionCard className="p-6">
      <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
        {t('settings.device.eyebrow')}
      </p>
      <h2 className="mt-1 font-[var(--font-display)] text-xl font-bold tracking-[-.03em] text-[#173128]">
        {t('settings.device.title')}
      </h2>
      <p className="mt-1 text-xs leading-5 text-[#71807b]">{t('settings.device.description')}</p>

      <div className="mt-5 space-y-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#173128]">
              {t('settings.device.location.title')}
            </p>
            <StatusBadge tone={locationBadgeTone[locationState]}>
              {locationBadgeLabel(locationState, t)}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#71807b]">
            {t('settings.device.location.description')}
          </p>
          {locationDenied ? (
            <p className="mt-2 text-xs font-semibold text-amber-800">
              {t('settings.device.location.deniedGuidance')}
            </p>
          ) : null}
          {locationConsent?.status === 'GRANTED' ? (
            <button
              type="button"
              onClick={() => handleConsentChange('LOCATION_USE', 'WITHDRAWN')}
              className="mt-2 text-xs font-bold text-[#264b40] underline"
            >
              {t('settings.device.consent.withdrawLocation')}
            </button>
          ) : null}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#173128]">
              {t('settings.device.notifications.title')}
            </p>
            <StatusBadge tone={notificationBadgeTone[notificationState]}>
              {notificationBadgeLabel(notificationState, t)}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#71807b]">
            {t('settings.device.notifications.description')}
          </p>
          {notificationDenied ? (
            <p className="mt-2 text-xs font-semibold text-amber-800">
              {t('settings.device.notifications.deniedGuidance')}
            </p>
          ) : notificationPrompt ? (
            <button
              type="button"
              onClick={() => setShowNotificationExplanation(true)}
              className="mt-2 rounded-lg border border-[#17372e]/15 bg-white px-3 py-1.5 text-xs font-bold text-[#264b40] transition hover:border-emerald-700/30"
            >
              {t('settings.device.notifications.enable')}
            </button>
          ) : notificationGranted && reservationConsent?.status === 'GRANTED' ? (
            <button
              type="button"
              onClick={() => handleConsentChange('NOTIFICATIONS_RESERVATIONS', 'WITHDRAWN')}
              className="mt-2 text-xs font-bold text-[#264b40] underline"
            >
              {t('settings.device.consent.withdrawNotifications')}
            </button>
          ) : null}
        </div>
      </div>

      <PermissionExplanationDialog
        kind="notifications"
        open={showNotificationExplanation}
        busy={notificationBusy}
        onContinue={() => void handleNotificationContinue()}
        onAlternative={() => setShowNotificationExplanation(false)}
      />
    </SectionCard>
  );
}

function locationBadgeLabel(
  state: BrowserCapabilityState,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  switch (state) {
    case 'granted':
      return t('settings.device.location.granted');
    case 'denied':
      return t('settings.device.location.denied');
    case 'prompt':
      return t('settings.device.location.prompt');
    case 'unsupported':
      return t('settings.device.location.unsupported');
    default:
      return t('settings.device.location.unknown');
  }
}

function notificationBadgeLabel(
  state: BrowserCapabilityState,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  switch (state) {
    case 'granted':
      return t('settings.device.notifications.granted');
    case 'denied':
      return t('settings.device.notifications.denied');
    case 'prompt':
      return t('settings.device.notifications.default');
    default:
      return t('settings.device.notifications.unsupported');
  }
}
