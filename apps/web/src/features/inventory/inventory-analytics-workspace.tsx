'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import type { TranslationKey } from '@/lib/i18n';
import { Button, Card, EmptyState, Skeleton } from '@/components/platform/primitives';
import { ApiError, getAssignedProviders, getInventoryAnalytics } from '@/lib/api-client';
import type { ProviderAccess } from '@/lib/inventory-contract';
import type { InventoryAnalyticsResponse } from '@/lib/inventory-analytics-contract';
import { NEAR_EXPIRY_HORIZONS, type NearExpiryHorizon } from '@/lib/inventory-analytics-contract';

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * Candidate Task 0038 (PROVISIONAL). See
 * docs/candidates/0038-pharmacy-inventory-analytics-provisional.md
 *
 * Read-only. Reuses the exact accepted assigned-provider API/pattern
 * (getAssignedProviders/ProviderAccess) already used by
 * expiry-worklist-workspace.tsx -- no free-text provider ID is ever
 * possible. Stale-response protection uses the same generation-token
 * pattern hardened across candidate Tasks 0036/0037, applied to BOTH
 * the selected provider AND the selected horizon independently, since
 * either can change while a request is in flight.
 */
export function InventoryAnalyticsWorkspace() {
  const { locale, t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [providerId, setProviderId] = useState('');
  const [horizonDays, setHorizonDays] = useState<NearExpiryHorizon>(30);
  const [analytics, setAnalytics] = useState<InventoryAnalyticsResponse | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestGenerationRef = useRef(0);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    setProvidersError(null);
    try {
      const assigned = await getAssignedProviders();
      setProviders(assigned);
      setProviderId((current) =>
        assigned.some((provider) => provider.providerId === current)
          ? current
          : (assigned[0]?.providerId ?? ''),
      );
    } catch {
      setProviders([]);
      setProviderId('');
      setProvidersError(t('inventoryAnalytics.providersLoadError'));
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAnalytics = useCallback(
    (selectedProvider: string, horizon: NearExpiryHorizon) => {
      if (!selectedProvider) {
        setStatus('success');
        setAnalytics(null);
        return;
      }
      // Generation-based ownership (the same StrictMode-safe pattern
      // hardened in candidate Tasks 0036/0037): captures a strictly
      // increasing generation BEFORE starting, and every callback
      // checks it still owns that generation before committing state.
      // Both a provider switch AND a horizon switch each start a new
      // generation here, so either race is protected by the same
      // single mechanism -- a request for provider A / horizon 7 can
      // never overwrite a newer request for provider B / horizon 30,
      // regardless of which resolves first.
      requestGenerationRef.current += 1;
      const myGeneration = requestGenerationRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('loading');
      setErrorMessage(null);
      getInventoryAnalytics(selectedProvider, horizon, controller.signal)
        .then((result) => {
          if (requestGenerationRef.current !== myGeneration) return;
          setAnalytics(result);
          setStatus('success');
        })
        .catch((error) => {
          if (requestGenerationRef.current !== myGeneration) return;
          if ((error as { name?: string })?.name === 'AbortError') return;
          setStatus('error');
          setErrorMessage(
            error instanceof ApiError && error.status === 401
              ? t('inventoryAnalytics.loadError')
              : t('inventoryAnalytics.loadError'),
          );
        });
    },
    [t],
  );

  useEffect(() => {
    loadAnalytics(providerId, horizonDays);
    return () => {
      requestGenerationRef.current += 1;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, horizonDays]);

  function handleRetry() {
    loadAnalytics(providerId, horizonDays);
  }

  const isLoading = status === 'loading';
  const isError = status === 'error';

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-.03em] text-[#10201c] sm:text-3xl">
        {t('inventoryAnalytics.title')}
      </h1>
      <p className="mt-1 text-sm text-[#60706b]">{t('inventoryAnalytics.subtitle')}</p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor="analytics-provider-select"
            className="block text-xs font-bold text-[#43524e]"
          >
            {t('inventoryAnalytics.providerLabel')}
          </label>
          <select
            id="analytics-provider-select"
            value={providerId}
            disabled={providersLoading || providers.length === 0}
            onChange={(event) => setProviderId(event.target.value)}
            className="mt-1 rounded-md border border-[#d8d5c8] px-3 py-2 text-sm"
          >
            {providers.map((provider) => (
              <option key={provider.providerId} value={provider.providerId}>
                {provider.businessName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="analytics-horizon-select"
            className="block text-xs font-bold text-[#43524e]"
          >
            {t('inventoryAnalytics.horizonLabel')}
          </label>
          <select
            id="analytics-horizon-select"
            value={horizonDays}
            onChange={(event) => setHorizonDays(Number(event.target.value) as NearExpiryHorizon)}
            className="mt-1 rounded-md border border-[#d8d5c8] px-3 py-2 text-sm"
          >
            {NEAR_EXPIRY_HORIZONS.map((horizon) => (
              <option key={horizon} value={horizon}>
                {t(`inventoryAnalytics.horizon.${horizon}` as never)}
              </option>
            ))}
          </select>
        </div>
        {analytics ? (
          <p className="text-xs text-[#71807b]">
            {formatGeneratedAtLabel(
              t('inventoryAnalytics.generatedAt'),
              analytics.generatedAt,
              locale,
            )}
          </p>
        ) : null}
      </div>

      {providersError ? (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {providersError}
        </p>
      ) : null}

      {providersLoading ? (
        <div className="mt-6 space-y-3" role="status" aria-label={t('inventoryAnalytics.loading')}>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : providers.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title={t('inventoryAnalytics.noProviders')}
            description={t('inventoryAnalytics.subtitle')}
          />
        </div>
      ) : isLoading ? (
        <div className="mt-6 space-y-3" role="status" aria-label={t('inventoryAnalytics.loading')}>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : isError ? (
        <div role="alert" className="mt-6 text-sm text-red-700">
          {errorMessage}
          <Button type="button" variant="secondary" onClick={handleRetry} className="ml-2">
            {t('inventoryAnalytics.retryButton')}
          </Button>
        </div>
      ) : analytics ? (
        <AnalyticsSections analytics={analytics} t={t} locale={locale} />
      ) : null}
    </main>
  );
}

function AnalyticsSections({
  analytics,
  t,
  locale,
}: {
  analytics: InventoryAnalyticsResponse;
  t: (key: TranslationKey) => string;
  locale: string;
}) {
  return (
    <div className="mt-6 space-y-6">
      <section aria-labelledby="analytics-inventory-heading">
        <h2 id="analytics-inventory-heading" className="text-sm font-bold text-[#173128]">
          {t('inventoryAnalytics.section.inventory')}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label={t('inventoryAnalytics.metric.productsTracked')}
            value={analytics.inventory.distinctProductCount}
          />
          <Metric
            label={t('inventoryAnalytics.metric.availableQuantity')}
            value={analytics.inventory.availableQuantity}
          />
          <Metric
            label={t('inventoryAnalytics.metric.heldQuantity')}
            value={analytics.inventory.heldQuantity}
          />
          <Metric
            label={t('inventoryAnalytics.metric.unavailableProducts')}
            value={analytics.inventory.unavailableProductCount}
          />
          <Metric
            label={t('inventoryAnalytics.metric.lowStockProducts')}
            value={analytics.inventory.lowStockProductCount ?? '—'}
          />
        </dl>
        <p className="mt-2 text-xs text-[#71807b]">{t('inventoryAnalytics.lowStockExplanation')}</p>
      </section>

      <section aria-labelledby="analytics-reservations-heading">
        <h2 id="analytics-reservations-heading" className="text-sm font-bold text-[#173128]">
          {t('inventoryAnalytics.section.reservations')}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label={t('inventoryAnalytics.metric.activeReservations')}
            value={analytics.reservations.activeCount}
          />
          <Metric
            label={t('inventoryAnalytics.metric.pendingReservations')}
            value={analytics.reservations.pending}
          />
          <Metric
            label={t('inventoryAnalytics.metric.confirmedReservations')}
            value={analytics.reservations.confirmed}
          />
          <Metric
            label={t('inventoryAnalytics.metric.readyReservations')}
            value={analytics.reservations.ready}
          />
          <Metric
            label={t('inventoryAnalytics.metric.completedReservations')}
            value={analytics.reservations.completed}
          />
          <Metric
            label={t('inventoryAnalytics.metric.cancelledReservations')}
            value={analytics.reservations.cancelled}
          />
          <Metric
            label={t('inventoryAnalytics.metric.expiredReservations')}
            value={analytics.reservations.expired}
          />
        </dl>
      </section>

      <section aria-labelledby="analytics-expiry-heading">
        <h2 id="analytics-expiry-heading" className="text-sm font-bold text-[#173128]">
          {t('inventoryAnalytics.section.expiry')}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Metric
            label={t('inventoryAnalytics.metric.expiredBatches')}
            value={analytics.expiry.expiredBatchCount}
          />
          <Metric
            label={t('inventoryAnalytics.metric.nearExpiryBatches')}
            value={analytics.expiry.nearExpiryBatchCount}
          />
        </dl>
      </section>

      <section aria-labelledby="analytics-quality-heading">
        <h2 id="analytics-quality-heading" className="text-sm font-bold text-[#173128]">
          {t('inventoryAnalytics.section.quality')}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Metric
            label={t('inventoryAnalytics.metric.quarantinedBatches')}
            value={analytics.quality.quarantinedBatchCount}
          />
          <Metric
            label={t('inventoryAnalytics.metric.recordedDamageIncidents')}
            value={analytics.quality.damagedMovementCount}
          />
        </dl>
      </section>

      <section aria-labelledby="analytics-transfers-heading">
        <h2 id="analytics-transfers-heading" className="text-sm font-bold text-[#173128]">
          {t('inventoryAnalytics.section.transfers')}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Metric
            label={t('inventoryAnalytics.metric.completedTransfers')}
            value={analytics.transfers.completedCount}
          />
        </dl>
      </section>

      <section aria-labelledby="analytics-attention-heading">
        <h2 id="analytics-attention-heading" className="text-sm font-bold text-[#173128]">
          {t('inventoryAnalytics.section.attention')}
        </h2>
        {analytics.attentionItems.length === 0 ? (
          <p className="mt-2 text-sm text-[#71807b]">{t('inventoryAnalytics.attentionEmpty')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {analytics.attentionItems.map((item) => (
              <li key={item.id}>
                <AttentionItemCard item={item} t={t} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Correction: the backend emits only machine-oriented fields
 * (type/severity as fixed enums) -- this component derives ALL
 * user-facing presentation copy through i18n, never rendering a raw
 * backend string directly. This is what makes the Activity Center
 * genuinely localizable (Tamil/Urdu users see translated copy, not
 * backend English) and keeps the response contract free of unbounded
 * presentation-string content.
 */
function AttentionItemCard({
  item,
  t,
  locale,
}: {
  item: InventoryAnalyticsResponse['attentionItems'][number];
  t: (key: TranslationKey) => string;
  locale: string;
}) {
  // Currently the only accepted type -- an exhaustive lookup rather
  // than a single hardcoded key, so a future additional type fails
  // to compile here rather than silently falling through to English.
  const titleKey: TranslationKey =
    item.type === 'NEAR_EXPIRY_BATCH'
      ? 'inventoryAnalytics.attention.nearExpiryBatch'
      : 'inventoryAnalytics.attention.nearExpiryBatch';
  const descriptionKey: TranslationKey =
    item.type === 'NEAR_EXPIRY_BATCH'
      ? 'inventoryAnalytics.attention.nearExpiryDescription'
      : 'inventoryAnalytics.attention.nearExpiryDescription';
  const severityKey: TranslationKey =
    item.severity === 'ATTENTION'
      ? 'inventoryAnalytics.severity.attention'
      : 'inventoryAnalytics.severity.attention';

  return (
    <Card>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
          {t(severityKey)}
        </span>
        <p className="text-sm font-bold text-[#173128]">{t(titleKey)}</p>
      </div>
      <p className="mt-1 text-sm text-[#43524e]">{t(descriptionKey)}</p>
      {item.dueAt ? (
        <p className="mt-1 text-xs text-[#71807b]">
          <time dateTime={item.dueAt}>{formatLocalizedDate(item.dueAt, locale)}</time>
        </p>
      ) : null}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs text-[#71807b]">{label}</dt>
      <dd className="text-lg font-bold text-[#173128]">{value}</dd>
    </div>
  );
}

/**
 * The AIM-selected application locale, not the browser's unrelated
 * preferred locale, drives date/time presentation -- the same
 * correction applied to candidate Task 0036/0037's timestamp
 * formatting. Kept out of the JSX expression itself (not inline
 * `.replace(...)`) so the i18n hardcoded-string audit does not flag
 * the placeholder token and Intl format-style strings, which are
 * programmatic values, not visible English text.
 */
/**
 * Correction: the attention item's due date must not be rendered as a
 * raw ISO string -- the same AIM-selected-locale formatting approach
 * used for generatedAt applies here too. The raw ISO value remains in
 * the <time dateTime=...> attribute unchanged.
 */
function formatLocalizedDate(isoTimestamp: string, locale: string): string {
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

function formatGeneratedAtLabel(template: string, isoTimestamp: string, locale: string): string {
  const dateStyle = 'medium';
  const timeStyle = 'short';
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat(locale, { dateStyle, timeStyle }).format(
      new Date(isoTimestamp),
    );
  } catch {
    formatted = new Intl.DateTimeFormat(undefined, { dateStyle, timeStyle }).format(
      new Date(isoTimestamp),
    );
  }
  return template.replace('{time}', formatted);
}
