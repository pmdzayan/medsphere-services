'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button, Card, EmptyState, Skeleton } from '@/components/platform/primitives';
import { listPatientTimeline } from '@/lib/api-client';
import type { PatientTimelineEvent } from '@/lib/patient-timeline-contract';
import { resolveSafeDestination } from './safe-destination';

type LoadStatus = 'loading' | 'success' | 'error';

/** Read-only patient timeline, protected by the shared patient layout. */
export function PatientTimelineWorkspace() {
  const { t, locale } = useLanguage();
  const [items, setItems] = useState<PatientTimelineEvent[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);
  const loadingMoreRef = useRef(false);

  function loadInitial() {
    // Generation-based ownership (StrictMode-safe pattern established
    // and hardened in candidate Task 0036): each call captures a
    // strictly increasing generation number BEFORE starting its
    // request. Any callback firing after a NEWER generation has
    // started -- or after cleanup has explicitly invalidated
    // ownership -- is ignored, so a resolution that slips through an
    // abort can never commit state on a stale/unmounted instance.
    requestGenerationRef.current += 1;
    const myGeneration = requestGenerationRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setErrorBanner(null);
    listPatientTimeline(undefined, controller.signal)
      .then((result) => {
        if (requestGenerationRef.current !== myGeneration) return;
        setItems(result.items);
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
      requestGenerationRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLoadMore() {
    if (loadingMoreRef.current || !nextCursor) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setErrorBanner(null);
    const myGeneration = requestGenerationRef.current;
    const cursorAtRequestTime = nextCursor;
    try {
      const result = await listPatientTimeline(cursorAtRequestTime);
      if (requestGenerationRef.current !== myGeneration) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        const deduped: PatientTimelineEvent[] = [];
        for (const item of result.items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          deduped.push(item);
        }
        return [...current, ...deduped];
      });
      setNextCursor(result.nextCursor);
    } catch {
      if (requestGenerationRef.current !== myGeneration) return;
      setErrorBanner(t('patientTimeline.loadError'));
    } finally {
      loadingMoreRef.current = false;
      if (requestGenerationRef.current === myGeneration) setLoadingMore(false);
    }
  }

  const isLoading = status === 'loading';
  const isError = status === 'error';
  const isSuccess = status === 'success';
  const isEmpty = isSuccess && items.length === 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-.03em] text-[#10201c] sm:text-3xl">
        {t('patientTimeline.title')}
      </h1>
      <p className="mt-1 text-sm text-[#60706b]">{t('patientTimeline.subtitle')}</p>

      {errorBanner ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {errorBanner}
        </p>
      ) : null}

      <section className="mt-6" aria-label={t('patientTimeline.title')}>
        {isLoading ? (
          <div className="space-y-3" role="status" aria-label={t('patientTimeline.loading')}>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <div role="alert" className="text-sm text-red-700">
            {t('patientTimeline.loadError')}
            <button type="button" onClick={loadInitial} className="ml-2 font-bold underline">
              {t('patientTimeline.retryButton')}
            </button>
          </div>
        ) : isEmpty ? (
          <EmptyState
            title={t('patientTimeline.emptyTitle')}
            description={t('patientTimeline.emptyDescription')}
          />
        ) : (
          <ul className="space-y-3">
            {items.map((event) => (
              <li key={event.id}>
                <TimelineEventRow
                  event={event}
                  locale={locale}
                  reservationLinkLabel={t('patientTimeline.viewReservations')}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {isSuccess && items.length > 0 ? (
        nextCursor ? (
          <div className="mt-4 text-center">
            <Button
              type="button"
              variant="secondary"
              loading={loadingMore}
              loadingLabel={t('patientTimeline.loadingMore')}
              onClick={handleLoadMore}
            >
              {t('patientTimeline.loadMore')}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-[#71807b]">
            {t('patientTimeline.endOfTimeline')}
          </p>
        )
      ) : null}
    </main>
  );
}

function TimelineEventRow({
  event,
  locale,
  reservationLinkLabel,
}: {
  event: PatientTimelineEvent;
  locale: string;
  reservationLinkLabel: string;
}) {
  const destination = resolveSafeDestination(event);
  const formattedOccurredAt = formatTimelineTimestamp(event.occurredAt, locale);

  return (
    <Card>
      <p className="text-xs text-[#71807b]">
        <time dateTime={event.occurredAt}>{formattedOccurredAt}</time>
      </p>
      <p className="mt-1 text-sm font-bold text-[#173128]">{event.title}</p>
      <p className="mt-0.5 text-sm text-[#43524e]">{event.summary}</p>
      {destination ? (
        <a
          href={destination}
          className="mt-1 inline-block text-xs font-bold text-emerald-700 underline"
        >
          {reservationLinkLabel}
        </a>
      ) : null}
    </Card>
  );
}

/**
 * The AIM-selected application locale (from LanguageProvider), not the
 * browser's unrelated preferred locale, drives date/time presentation
 * -- the same correction applied to candidate Task 0036's Activity
 * Center. The machine-readable ISO string in <time dateTime=...>
 * remains unchanged regardless of locale.
 */
function formatTimelineTimestamp(isoTimestamp: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(isoTimestamp),
    );
  } catch {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(isoTimestamp),
    );
  }
}
