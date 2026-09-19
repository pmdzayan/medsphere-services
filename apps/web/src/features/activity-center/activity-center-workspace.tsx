'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button, Card, EmptyState, Skeleton } from '@/components/platform/primitives';
import {
  ApiError,
  listPatientNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/api-client';
import type { PatientNotification } from '@/lib/patient-notification-contract';
import { readBrowserCapability, requestBrowserNotifications } from '@/lib/browser-permissions';
import { resolveSafeDestination } from './safe-destination';

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * In-app notifications are fully functional regardless of browser
 * notification permission state -- the permission banner is purely
 * additive UI, never a gate on this component's own functionality.
 */
export function ActivityCenterWorkspace() {
  const { t } = useLanguage();
  const [items, setItems] = useState<PatientNotification[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [pendingMarkReadIds, setPendingMarkReadIds] = useState<ReadonlySet<string>>(new Set());
  const [banner, setBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);

  function loadInitial() {
    // Generation-based ownership: each call captures a strictly
    // increasing generation number BEFORE starting its request. Any
    // callback (then/catch) that fires after a NEWER generation has
    // started is a stale/superseded response and is ignored -- this
    // is what makes the pattern StrictMode-safe. Unlike a boolean
    // in-flight flag, an older request's cleanup/rejection can never
    // block or clear a newer request's ownership: incrementing the
    // ref is the only thing that establishes "current," and only the
    // request that captured the CURRENT value at its own start time
    // is ever allowed to commit state.
    requestGenerationRef.current += 1;
    const myGeneration = requestGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    // A retry/full-reload establishes a replacement list -- any stale
    // pagination error banner from a prior generation must not survive
    // into it (C8: old pending/error state must not contaminate the
    // new list).
    setErrorBanner(null);
    listPatientNotifications(undefined, undefined, controller.signal)
      .then((result) => {
        if (requestGenerationRef.current !== myGeneration) return;
        setItems(result.items);
        setUnreadCount(result.unreadCount);
        setNextCursor(result.nextCursor);
        setStatus('success');
      })
      .catch((error) => {
        if (requestGenerationRef.current !== myGeneration) return;
        if ((error as { name?: string })?.name === 'AbortError') return;
        setStatus('error');
      });
  }

  useEffect(() => {
    loadInitial();
    return () => {
      // Cleanup must EXPLICITLY relinquish generation ownership, not
      // merely abort the transport. Aborting alone only cancels the
      // network request -- it does not stop an already-in-flight
      // promise from resolving successfully despite the abort signal
      // (this can happen with some fetch implementations/mocks). By
      // also invalidating the generation here, even a resolution that
      // slips through the abort is guaranteed to fail the
      // current-generation check in loadInitial()'s own .then()/.catch(),
      // so no callback from a cleaned-up request can ever commit state
      // again, regardless of whether its promise settles as a success
      // or a failure.
      requestGenerationRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLoadMore() {
    // Checks the synchronous ref, not only the React state -- state
    // updates are batched/async, so two rapid same-tick dispatches
    // could both read the OLD `loadingMore` value before either
    // setLoadingMore(true) call has been committed and reflected back.
    // The ref is set/read synchronously and closes that window.
    if (loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setErrorBanner(null);
    const myGeneration = requestGenerationRef.current;
    const cursorAtRequestTime = nextCursor;
    try {
      const result = await listPatientNotifications(cursorAtRequestTime, undefined);
      // Bind pagination to the same generation ownership as the
      // initial load: if a full reload/reset established a NEW
      // generation while this request was in flight, this response is
      // stale and must never append into the replacement list.
      if (requestGenerationRef.current !== myGeneration) return;
      setItems((current) => {
        // Deduplicate defensively by id -- both against rows already
        // rendered from prior pages AND against duplicate ids WITHIN
        // this same incoming page (a single response repeating an id
        // must still resolve to exactly one rendered row, preserving
        // the earliest/server-order occurrence). "seen" is updated as
        // we iterate the new page too, unlike a set built only from
        // "current", which would fail to catch a same-page repeat.
        const seen = new Set(current.map((item) => item.id));
        const deduped: PatientNotification[] = [];
        for (const item of result.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          deduped.push(item);
        }
        return [...current, ...deduped];
      });
      setNextCursor(result.nextCursor);
      setUnreadCount(result.unreadCount);
    } catch {
      if (requestGenerationRef.current !== myGeneration) return;
      setErrorBanner(t('activityCenter.loadError'));
    } finally {
      loadingMoreRef.current = false;
      if (requestGenerationRef.current === myGeneration) setLoadingMore(false);
    }
  }

  async function handleMarkOneRead(notification: PatientNotification) {
    if (notification.readAt) return;
    if (pendingMarkReadIds.has(notification.id)) return;
    setPendingMarkReadIds((current) => new Set(current).add(notification.id));
    setErrorBanner(null);
    try {
      const updated = await markNotificationRead(notification.id);
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch (thrown) {
      setErrorBanner(
        thrown instanceof ApiError && thrown.status === 401
          ? t('activityCenter.sessionExpired')
          : t('activityCenter.markReadError'),
      );
    } finally {
      setPendingMarkReadIds((current) => {
        const next = new Set(current);
        next.delete(notification.id);
        return next;
      });
    }
  }

  async function handleMarkAllRead() {
    if (markingAllRead || unreadCount === 0) return;
    setMarkingAllRead(true);
    setErrorBanner(null);
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => (item.readAt ? item : { ...item, readAt: now })));
      // The server-reported updatedCount may exceed the rows currently
      // loaded on this page (older, not-yet-loaded unread rows also
      // got marked read) -- unreadCount must resolve to zero either
      // way, since ALL of the authenticated patient's unread
      // notifications were just marked read server-side, not only the
      // ones visible here.
      setUnreadCount(0);
      setBanner(t('activityCenter.markAllReadSuccess'));
    } catch (thrown) {
      setErrorBanner(
        thrown instanceof ApiError && thrown.status === 401
          ? t('activityCenter.sessionExpired')
          : t('activityCenter.markAllReadError'),
      );
    } finally {
      setMarkingAllRead(false);
    }
  }

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const isEmpty = isSuccess && items.length === 0;
  const unreadCountLabel =
    isSuccess && unreadCount > 0
      ? t('activityCenter.unreadCount').replace('{count}', String(unreadCount))
      : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-.03em] text-[#10201c] sm:text-3xl">
            {t('activityCenter.title')}
          </h1>
          <p className="mt-1 text-sm text-[#60706b]">{t('activityCenter.subtitle')}</p>
        </div>
        {unreadCountLabel ? (
          <span
            className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"
            aria-live="polite"
          >
            {unreadCountLabel}
          </span>
        ) : null}
      </div>

      <NotificationPermissionBanner />

      {banner ? (
        <p role="status" aria-live="polite" className="mt-4 text-sm font-semibold text-emerald-700">
          {banner}
        </p>
      ) : null}
      {errorBanner ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {errorBanner}
        </p>
      ) : null}

      {isSuccess && items.length > 0 ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            disabled={unreadCount === 0}
            loading={markingAllRead}
            loadingLabel={t('activityCenter.markingAllRead')}
            onClick={handleMarkAllRead}
          >
            {t('activityCenter.markAllRead')}
          </Button>
        </div>
      ) : null}

      <section className="mt-6" aria-label={t('activityCenter.title')}>
        {isLoading ? (
          <div className="space-y-3" role="status" aria-label={t('activityCenter.loading')}>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <div role="alert" className="text-sm text-red-700">
            {t('activityCenter.loadError')}
            <button type="button" onClick={loadInitial} className="ml-2 font-bold underline">
              {t('activityCenter.retryButton')}
            </button>
          </div>
        ) : isEmpty ? (
          <EmptyState
            title={t('activityCenter.emptyTitle')}
            description={t('activityCenter.emptyDescription')}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((notification) => (
              <li key={notification.id}>
                <NotificationRow
                  notification={notification}
                  isMarkReadPending={pendingMarkReadIds.has(notification.id)}
                  onMarkRead={handleMarkOneRead}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {isSuccess && nextCursor ? (
        <div className="mt-4 text-center">
          <Button
            type="button"
            variant="secondary"
            loading={loadingMore}
            loadingLabel={t('activityCenter.loadingMore')}
            onClick={handleLoadMore}
          >
            {t('activityCenter.loadMore')}
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function NotificationRow({
  notification,
  isMarkReadPending,
  onMarkRead,
}: {
  notification: PatientNotification;
  isMarkReadPending: boolean;
  onMarkRead: (notification: PatientNotification) => void;
}) {
  const { t, locale } = useLanguage();
  const isUnread = notification.readAt === null;
  const destination = resolveSafeDestination(notification);
  const formattedCreatedAt = formatNotificationTimestamp(notification.createdAt, locale);

  return (
    <Card className={isUnread ? 'border-emerald-600' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {/* Unread/read is never color-only: a visible text badge
                (not merely an sr-only node) carries the state for
                sighted users who cannot distinguish the color
                treatment, in addition to being announced to screen
                readers via its own text content. */}
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                isUnread ? 'bg-emerald-600 text-white' : 'bg-[#e8e6dc] text-[#60706b]'
              }`}
            >
              {isUnread ? t('activityCenter.unreadLabel') : t('activityCenter.readLabel')}
            </span>
            <span className="text-xs font-bold uppercase tracking-wide text-[#71807b]">
              {t(`activityCenter.category.${notification.category}` as never)}
            </span>
          </div>
          <p className="mt-1 text-sm font-bold text-[#173128]">{notification.title}</p>
          <p className="mt-0.5 text-sm text-[#43524e]">{notification.message}</p>
          <p className="mt-1 text-xs text-[#71807b]">
            <time dateTime={notification.createdAt}>{formattedCreatedAt}</time>
          </p>
          {destination ? (
            <a
              href={destination}
              className="mt-1 inline-block text-xs font-bold text-emerald-700 underline"
            >
              {t('activityCenter.viewDetails')}
            </a>
          ) : null}
        </div>
        {isUnread ? (
          <button
            type="button"
            onClick={() => onMarkRead(notification)}
            disabled={isMarkReadPending}
            aria-busy={isMarkReadPending}
            className="shrink-0 text-xs font-bold text-emerald-700 underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isMarkReadPending ? t('activityCenter.markingRead') : t('activityCenter.markRead')}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * Correction: the AIM-selected application locale (from
 * LanguageProvider), not the browser's unrelated preferred locale,
 * must drive date/time presentation -- so a patient using AIM in
 * Tamil or Urdu sees the created-time formatted accordingly, not
 * silently in whatever English/default format the browser happens to
 * prefer. The machine-readable ISO string in the <time dateTime=...>
 * attribute is unchanged either way.
 */
function formatNotificationTimestamp(isoTimestamp: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoTimestamp));
  } catch {
    // An unrecognized locale tag falls back to a bounded, still
    // machine-derived (not hard-coded) presentation rather than
    // throwing.
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(isoTimestamp),
    );
  }
}

function NotificationPermissionBanner() {
  const { t } = useLanguage();
  const [capability, setCapability] = useState<
    'unsupported' | 'granted' | 'denied' | 'prompt' | 'unavailable' | 'error' | 'loading'
  >('loading');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readBrowserCapability('notifications').then((state) => {
      if (!cancelled) setCapability(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    if (requesting) return;
    setRequesting(true);
    try {
      const result = await requestBrowserNotifications();
      setCapability(result);
    } finally {
      setRequesting(false);
    }
  }

  if (capability === 'loading' || capability === 'granted') {
    return capability === 'granted' ? (
      <p className="mt-3 text-xs text-[#71807b]">{t('activityCenter.permissionGranted')}</p>
    ) : null;
  }

  if (capability === 'unsupported' || capability === 'unavailable' || capability === 'error') {
    return (
      <p className="mt-3 text-xs text-[#71807b]">{t('activityCenter.permissionUnsupported')}</p>
    );
  }

  if (capability === 'denied') {
    return <p className="mt-3 text-xs text-[#71807b]">{t('activityCenter.permissionDenied')}</p>;
  }

  return (
    <Card className="mt-4">
      <p className="text-sm font-bold text-[#173128]">{t('activityCenter.permissionTitle')}</p>
      <p className="mt-1 text-xs text-[#60706b]">{t('activityCenter.permissionDescription')}</p>
      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          loading={requesting}
          loadingLabel={t('activityCenter.permissionRequesting')}
          onClick={handleEnable}
        >
          {t('activityCenter.permissionEnableButton')}
        </Button>
      </div>
    </Card>
  );
}
