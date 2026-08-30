'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { useLanguage } from '@/components/language-provider';
import { ApiError, getAssignedProviders, getProviderExpiryWorklist } from '@/lib/api-client';
import type { TranslationKey, TranslationValues } from '@/lib/i18n';
import type { InventoryExpiryWorklistPage, ProviderAccess } from '@/lib/inventory-contract';
import { daysUntilExpiry } from './inventory-data';

const PAGE_SIZE = 25;
const HORIZONS = [7, 30, 60, 90] as const;

export function ExpiryWorklistWorkspace() {
  const { locale, t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [horizonDays, setHorizonDays] = useState(30);
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<InventoryExpiryWorklistPage | null>(null);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    setError(null);
    setPage(null);
    try {
      const assigned = await getAssignedProviders();
      setProviders(assigned);
      setProviderId((current) =>
        assigned.some((provider) => provider.providerId === current)
          ? current
          : (assigned[0]?.providerId ?? ''),
      );
    } catch (loadError) {
      setProviders([]);
      setProviderId('');
      setError(publicError(loadError, t('inventory.error.providers')));
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

  const loadWorklist = useCallback(
    async (selectedProvider: string, days: number, start: number) => {
      if (!selectedProvider) return;
      setLoading(true);
      setError(null);
      try {
        setPage(
          await getProviderExpiryWorklist({
            providerId: selectedProvider,
            horizonDays: days,
            limit: PAGE_SIZE,
            offset: start,
          }),
        );
      } catch (loadError) {
        setPage(null);
        setError(publicError(loadError, t('inventory.expiry.error.load')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => void loadProviders(), [loadProviders]);
  useEffect(() => {
    if (!providersLoading && providerId) void loadWorklist(providerId, horizonDays, offset);
  }, [horizonDays, loadWorklist, offset, providerId, providersLoading]);

  const metrics = useMemo(
    () => ({
      batches: page?.data.length ?? 0,
      onHand: page?.data.reduce((sum, item) => sum + item.onHandQuantity, 0) ?? 0,
      held: page?.data.reduce((sum, item) => sum + item.heldQuantity, 0) ?? 0,
      available: page?.data.reduce((sum, item) => sum + item.availableQuantity, 0) ?? 0,
    }),
    [page],
  );

  if (!providersLoading && error?.status === 403 && providers.length === 0) {
    return (
      <StatePanel
        title={t('inventory.expiry.accessTitle')}
        detail={t('inventory.expiry.accessDetail')}
        action={t('inventory.expiry.retryAccess')}
        onAction={() => void loadProviders()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-amber-700">
            {t('inventory.expiry.eyebrow')}
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            {t('inventory.expiry.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            {t('inventory.expiry.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158]"
          >
            {t('inventory.expiry.back')}
          </Link>
          <button
            type="button"
            disabled={!providerId || loading}
            onClick={() => providerId && void loadWorklist(providerId, horizonDays, offset)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} />{' '}
            {t('inventory.common.refresh')}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('inventory.expiry.metric.batches')}
          value={String(metrics.batches)}
          detail={t('inventory.common.currentPage')}
          icon="inventory"
        />
        <MetricCard
          label={t('inventory.expiry.metric.physical')}
          value={String(metrics.onHand)}
          detail={t('inventory.common.currentPage')}
          icon="inventory"
          accent="cyan"
        />
        <MetricCard
          label={t('inventory.expiry.metric.held')}
          value={String(metrics.held)}
          detail={t('inventory.common.currentPage')}
          icon="clock"
          accent="amber"
        />
        <MetricCard
          label={t('inventory.expiry.metric.available')}
          value={String(metrics.available)}
          detail={t('inventory.common.currentPage')}
          icon="inventory"
          accent="rose"
        />
      </div>

      <SectionCard>
        <div className="grid gap-3 border-b border-[#edf1ef] bg-[#fbfcfb] p-4 sm:grid-cols-2 sm:p-5 lg:px-6">
          <label>
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
              {t('inventory.common.assignedProvider')}
            </span>
            <select
              aria-label={t('inventory.common.assignedProvider')}
              value={providerId}
              disabled={providersLoading || providers.length === 0}
              onChange={(event) => {
                setProviderId(event.target.value);
                setOffset(0);
              }}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b] disabled:opacity-60"
            >
              {providers.length === 0 ? (
                <option value="">{t('inventory.common.noProvider')}</option>
              ) : null}
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.businessName} ·{' '}
                  {provider.providerType === 'PHARMACY'
                    ? t('inventory.common.pharmacy')
                    : t('inventory.common.hospital')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
              {t('inventory.expiry.horizon')}
            </span>
            <select
              aria-label={t('inventory.expiry.horizon')}
              value={horizonDays}
              disabled={!providerId}
              onChange={(event) => {
                setHorizonDays(Number(event.target.value));
                setOffset(0);
              }}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b] disabled:opacity-60"
            >
              {HORIZONS.map((days) => (
                <option key={days} value={days}>
                  {t('inventory.expiry.nextDays', { days })}
                </option>
              ))}
            </select>
          </label>
        </div>

        {providersLoading ? <Loading label={t('inventory.expiry.checkingProviders')} /> : null}
        {!providersLoading && !error && providers.length === 0 ? (
          <StatePanel
            title={t('inventory.expiry.noActiveProvider')}
            detail={t('inventory.expiry.noActiveProviderDetail')}
            action={t('inventory.expiry.checkAgain')}
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && error ? (
          <StatePanel
            title={t('inventory.expiry.loadFailure')}
            detail={error.message}
            action={t('inventory.common.tryAgain')}
            onAction={() =>
              providerId ? void loadWorklist(providerId, horizonDays, offset) : void loadProviders()
            }
          />
        ) : null}
        {!providersLoading && !error && loading && !page ? (
          <Loading label={t('inventory.expiry.loading')} />
        ) : null}
        {!providersLoading && !error && page?.data.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-bold text-[#27483e]">{t('inventory.expiry.empty')}</p>
            <p className="mt-2 text-sm text-[#75857f]">{t('inventory.expiry.emptyDetail')}</p>
          </div>
        ) : null}
        {!providersLoading && !error && page && page.data.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f8faf9] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#74847e]">
                  <tr>
                    <th className="px-5 py-3">{t('inventory.expiry.medicine')}</th>
                    <th className="px-5 py-3">{t('inventory.expiry.batch')}</th>
                    <th className="px-5 py-3">{t('inventory.expiry.expiry')}</th>
                    <th className="px-5 py-3">{t('inventory.expiry.physical')}</th>
                    <th className="px-5 py-3">{t('inventory.common.held')}</th>
                    <th className="px-5 py-3">{t('inventory.common.available')}</th>
                    <th className="px-5 py-3">{t('inventory.expiry.listing')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ef]">
                  {page.data.map((item) => (
                    <tr key={item.batchId}>
                      <td className="px-5 py-4">
                        <p className="font-bold text-[#24483d]">{item.name}</p>
                        <p className="mt-1 text-xs text-[#7a8984]">
                          {item.genericName ?? item.brand}
                          {item.sku ? ` · ${item.sku}` : ''}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-semibold text-[#456158]">{item.batchNumber}</td>
                      <td className="px-5 py-4 text-[#456158]">
                        <p>{formatDate(item.expiryDate, locale)}</p>
                        <p
                          className={`mt-0.5 text-[11px] font-bold ${expiryLabelTone(
                            daysUntilExpiry(item.expiryDate),
                          )}`}
                        >
                          {localizedExpiryUrgency(daysUntilExpiry(item.expiryDate), t)}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-bold text-[#24483d]">{item.onHandQuantity}</td>
                      <td className="px-5 py-4 text-[#735f30]">{item.heldQuantity}</td>
                      <td className="px-5 py-4 font-bold text-emerald-700">
                        {item.availableQuantity}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={item.isVisible ? 'emerald' : 'slate'}>
                          {item.isVisible
                            ? t('inventory.expiry.visible')
                            : t('inventory.expiry.hidden')}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-[#edf1ef] lg:hidden">
              {page.data.map((item) => (
                <li key={item.batchId} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-[#24483d]">{item.name}</p>
                      <p className="mt-1 text-xs text-[#7a8984]">
                        {item.genericName ?? item.brand}
                        {item.sku ? ` · ${item.sku}` : ''}
                      </p>
                    </div>
                    <StatusBadge tone={item.isVisible ? 'emerald' : 'slate'}>
                      {item.isVisible
                        ? t('inventory.expiry.visible')
                        : t('inventory.expiry.hidden')}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-xs text-[#456158]">
                    {t('inventory.expiry.batch')}{' '}
                    <span className="font-semibold">{item.batchNumber}</span> ·{' '}
                    {t('inventory.expiry.expires')} {formatDate(item.expiryDate, locale)}
                  </p>
                  <p
                    className={`mt-1 text-[11px] font-bold ${expiryLabelTone(
                      daysUntilExpiry(item.expiryDate),
                    )}`}
                  >
                    {localizedExpiryUrgency(daysUntilExpiry(item.expiryDate), t)}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#f8faf9] p-3 text-center">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#8a9994]">
                        {t('inventory.expiry.physical')}
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold text-[#24483d]">
                        {item.onHandQuantity}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#8a9994]">
                        {t('inventory.common.held')}
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold text-[#735f30]">
                        {item.heldQuantity}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#8a9994]">
                        {t('inventory.common.available')}
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold text-emerald-700">
                        {item.availableQuantity}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 border-t border-[#edf1ef] px-5 py-4 text-xs text-[#74847e] sm:flex-row sm:items-center sm:justify-between">
              <span>
                {t('inventory.expiry.observed', {
                  start: formatDateTime(page.asOf, locale),
                  end: formatDateTime(page.horizonEndsAt, locale),
                  total: page.total,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page.offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
                >
                  {t('inventory.common.previous')}
                </button>
                <button
                  type="button"
                  disabled={page.offset + page.data.length >= page.total || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
                >
                  {t('inventory.common.next')}
                </button>
              </div>
            </div>
          </>
        ) : null}
      </SectionCard>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div role="status" className="px-6 py-14 text-center text-sm font-semibold text-[#60756d]">
      {label}
    </div>
  );
}
function StatePanel({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-[1.4rem] border border-[#dfe7e3] bg-white px-6 py-12 text-center">
      <h2 className="font-[var(--font-display)] text-xl font-bold text-[#173128]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#71817c]">{detail}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-5 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"
      >
        {action}
      </button>
    </div>
  );
}
function publicError(error: unknown, fallback: string) {
  return error instanceof ApiError
    ? { message: fallback, status: error.status }
    : { message: fallback };
}
function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

function expiryLabelTone(daysUntil: number | null): string {
  if (daysUntil === null) return 'text-[#8a9994]';
  if (daysUntil < 0) return 'text-rose-700';
  if (daysUntil <= 7) return 'text-amber-700';
  return 'text-[#8a9994]';
}
function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

type Translator = (key: TranslationKey, values?: TranslationValues) => string;

function localizedExpiryUrgency(daysUntil: number | null, t: Translator): string {
  if (daysUntil === null) return t('inventory.expiry.urgency.unknown');
  if (daysUntil < 0) return t('inventory.expiry.urgency.overdue', { days: Math.abs(daysUntil) });
  if (daysUntil === 0) return t('inventory.expiry.urgency.today');
  if (daysUntil === 1) return t('inventory.expiry.urgency.tomorrow');
  return t('inventory.expiry.urgency.days', { days: daysUntil });
}
