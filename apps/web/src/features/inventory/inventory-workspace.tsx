'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { useLanguage } from '@/components/language-provider';
import {
  ApiError,
  getAssignedProviders,
  getProviderStock,
  quarantineBatch,
  recordCompletedTransfer,
  recordDamagedStock,
} from '@/lib/api-client';
import type {
  BatchQuarantineReason,
  BatchQuarantineResponse,
  CompletedTransferResponse,
  DamagedStockResponse,
  InventoryBatchStock,
  InventoryStockItem,
  InventoryStockPage,
  ProviderAccess,
} from '@/lib/inventory-contract';
import { BATCH_QUARANTINE_REASONS } from '@/lib/inventory-contract';
import type { TranslationKey, TranslationValues } from '@/lib/i18n';
import {
  daysUntilExpiry,
  expiryUrgency,
  formatInventoryCurrency,
  formatInventoryDate,
  loadedInventoryMetrics,
} from './inventory-data';

const PAGE_SIZE = 25;
const QUARANTINE_REASON_KEYS: Record<BatchQuarantineReason, TranslationKey> = {
  QUALITY_SUSPECT: 'inventory.dialog.quarantine.quality',
  TEMPERATURE_EXCURSION: 'inventory.dialog.quarantine.temperature',
  PACKAGING_COMPROMISED: 'inventory.dialog.quarantine.packaging',
  STORAGE_DEVIATION: 'inventory.dialog.quarantine.storage',
};

interface QuarantineTarget {
  batch: InventoryBatchStock;
  medicineName: string;
  idempotencyKey: string;
}

interface DamageTarget {
  batch: InventoryBatchStock;
  medicineName: string;
  idempotencyKey: string;
}

interface TransferTarget {
  batch: InventoryBatchStock;
  medicineName: string;
  idempotencyKey: string;
}

export function InventoryWorkspace() {
  const { locale, t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [page, setPage] = useState<InventoryStockPage | null>(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [quarantineTarget, setQuarantineTarget] = useState<QuarantineTarget | null>(null);
  const [quarantineReason, setQuarantineReason] =
    useState<BatchQuarantineReason>('QUALITY_SUSPECT');
  const [quarantineSubmitting, setQuarantineSubmitting] = useState(false);
  const [quarantineError, setQuarantineError] = useState<string | null>(null);
  const [quarantineReceipt, setQuarantineReceipt] = useState<BatchQuarantineResponse | null>(null);
  const [damageTarget, setDamageTarget] = useState<DamageTarget | null>(null);
  const [damageQuantity, setDamageQuantity] = useState('1');
  const [damageReason, setDamageReason] = useState('');
  const [damageSubmitting, setDamageSubmitting] = useState(false);
  const [damageError, setDamageError] = useState<string | null>(null);
  const [damageReceipt, setDamageReceipt] = useState<DamagedStockResponse | null>(null);
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null);
  const [transferDestinationId, setTransferDestinationId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('1');
  const [transferReason, setTransferReason] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferReceipt, setTransferReceipt] = useState<CompletedTransferResponse | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  // Escape dismisses whichever confirmation dialog is open, unless a
  // submission is in flight (an in-progress mutation should not be
  // silently abandoned by an accidental key press).
  useEffect(() => {
    if (!quarantineTarget && !damageTarget && !transferTarget) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (quarantineTarget && !quarantineSubmitting) setQuarantineTarget(null);
      else if (damageTarget && !damageSubmitting) setDamageTarget(null);
      else if (transferTarget && !transferSubmitting) setTransferTarget(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    quarantineTarget,
    quarantineSubmitting,
    damageTarget,
    damageSubmitting,
    transferTarget,
    transferSubmitting,
  ]);

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
      setError(toPublicError(loadError, t('inventory.error.providers')));
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

  const loadStock = useCallback(
    async (selectedProvider: string, search: string, start: number) => {
      if (!selectedProvider) return;
      setStockLoading(true);
      setError(null);
      try {
        setPage(
          await getProviderStock({
            providerId: selectedProvider,
            query: search || undefined,
            limit: PAGE_SIZE,
            offset: start,
          }),
        );
      } catch (loadError) {
        setPage(null);
        setError(toPublicError(loadError, t('inventory.error.stock')));
      } finally {
        setStockLoading(false);
      }
    },
    [t],
  );

  useEffect(() => void loadProviders(), [loadProviders]);
  useEffect(() => {
    if (!providersLoading && providerId) void loadStock(providerId, query, offset);
  }, [loadStock, offset, providerId, providersLoading, query]);

  const metrics = useMemo(() => loadedInventoryMetrics(page?.data ?? []), [page]);
  const selectedProvider = providers.find((provider) => provider.providerId === providerId);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOffset(0);
    setQuery(draftQuery.trim());
  }

  function openQuarantine(batch: InventoryBatchStock, medicineName: string) {
    setQuarantineTarget({
      batch,
      medicineName,
      idempotencyKey: `batch-quarantine-${crypto.randomUUID()}`,
    });
    setQuarantineReason('QUALITY_SUSPECT');
    setQuarantineError(null);
  }

  async function submitQuarantine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quarantineTarget || !providerId || quarantineSubmitting) return;
    setQuarantineSubmitting(true);
    setQuarantineError(null);
    try {
      const receipt = await quarantineBatch(providerId, quarantineTarget.batch.id, {
        expectedVersion: quarantineTarget.batch.version,
        idempotencyKey: quarantineTarget.idempotencyKey,
        reasonCode: quarantineReason,
      });
      setQuarantineReceipt(receipt);
      setQuarantineTarget(null);
      await loadStock(providerId, query, offset);
    } catch (mutationError) {
      setQuarantineError(toPublicError(mutationError, t('inventory.error.quarantine')).message);
    } finally {
      setQuarantineSubmitting(false);
    }
  }

  function openDamage(batch: InventoryBatchStock, medicineName: string) {
    setDamageTarget({
      batch,
      medicineName,
      idempotencyKey: `damaged-stock-${crypto.randomUUID()}`,
    });
    setDamageQuantity('1');
    setDamageReason('');
    setDamageError(null);
  }

  async function submitDamage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!damageTarget || !providerId || damageSubmitting) return;
    const quantity = Number(damageQuantity);
    const reason = damageReason.trim();
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > damageTarget.batch.availableQuantity ||
      reason.length < 1 ||
      reason.length > 500
    ) {
      setDamageError(t('inventory.error.damageValidation'));
      return;
    }
    setDamageSubmitting(true);
    setDamageError(null);
    try {
      const receipt = await recordDamagedStock(providerId, damageTarget.batch.id, {
        expectedVersion: damageTarget.batch.version,
        quantity,
        idempotencyKey: damageTarget.idempotencyKey,
        reason,
      });
      setDamageReceipt(receipt);
      setDamageTarget(null);
      await loadStock(providerId, query, offset);
    } catch (mutationError) {
      setDamageError(toPublicError(mutationError, t('inventory.error.damage')).message);
    } finally {
      setDamageSubmitting(false);
    }
  }

  function openTransfer(batch: InventoryBatchStock, medicineName: string) {
    setTransferTarget({
      batch,
      medicineName,
      idempotencyKey: `completed-transfer-${crypto.randomUUID()}`,
    });
    setTransferDestinationId(
      providers.find((provider) => provider.providerId !== providerId)?.providerId ?? '',
    );
    setTransferQuantity('1');
    setTransferReason('');
    setTransferError(null);
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferTarget || !providerId || transferSubmitting) return;
    const quantity = Number(transferQuantity);
    const reason = transferReason.trim();
    if (
      !providers.some(
        (provider) =>
          provider.providerId === transferDestinationId && provider.providerId !== providerId,
      ) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > transferTarget.batch.availableQuantity ||
      reason.length > 500
    ) {
      setTransferError(t('inventory.error.transferValidation'));
      return;
    }
    setTransferSubmitting(true);
    setTransferError(null);
    try {
      const receipt = await recordCompletedTransfer(providerId, {
        destinationProviderId: transferDestinationId,
        sourceBatchId: transferTarget.batch.id,
        expectedSourceVersion: transferTarget.batch.version,
        quantity,
        idempotencyKey: transferTarget.idempotencyKey,
        ...(reason ? { reason } : {}),
      });
      setTransferReceipt(receipt);
      setTransferTarget(null);
      await loadStock(providerId, query, offset);
    } catch (mutationError) {
      setTransferError(toPublicError(mutationError, t('inventory.error.transfer')).message);
    } finally {
      setTransferSubmitting(false);
    }
  }

  if (!providersLoading && error?.status === 403 && providers.length === 0) {
    return (
      <InventoryState
        title={t('inventory.accessTitle')}
        detail={t('inventory.accessDetail')}
        action={t('inventory.retryAccess')}
        onAction={() => void loadProviders()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
            {t('inventory.eyebrow')}
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            {t('inventory.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            {t('inventory.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/inventory/expiry"
            className="inline-flex w-fit items-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white"
          >
            {t('inventory.expiry.title')}
          </Link>
          <button
            type="button"
            onClick={() => providerId && void loadStock(providerId, query, offset)}
            disabled={!providerId || stockLoading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158] disabled:cursor-wait disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${stockLoading ? 'animate-spin' : ''}`} />
            {t('inventory.refreshStock')}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('inventory.metric.products')}
          value={String(metrics.products)}
          icon="inventory"
          detail={t('inventory.metric.detail')}
        />
        <MetricCard
          label={t('inventory.metric.available')}
          value={String(metrics.available)}
          icon="inventory"
          accent="cyan"
          detail={t('inventory.metric.detail')}
        />
        <MetricCard
          label={t('inventory.metric.held')}
          value={String(metrics.held)}
          icon="clock"
          accent="amber"
          detail={t('inventory.metric.detail')}
        />
        <MetricCard
          label={t('inventory.metric.batches')}
          value={String(metrics.batches)}
          icon="calendar"
          accent="rose"
          detail={t('inventory.metric.detail')}
        />
      </div>

      <SectionCard>
        <div className="grid gap-3 border-b border-[#edf1ef] bg-[#fbfcfb] p-4 sm:p-5 lg:grid-cols-[minmax(14rem,22rem)_1fr] lg:px-6">
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
          <form onSubmit={submitSearch} className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
                {t('inventory.search.label')}
              </span>
              <input
                aria-label={t('inventory.search.label')}
                type="search"
                maxLength={120}
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder={t('inventory.search.placeholder')}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-4 text-sm text-[#264239]"
              />
            </label>
            <button
              type="submit"
              disabled={!providerId || stockLoading}
              className="h-11 rounded-xl bg-[#0b5f4b] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {t('inventory.search.action')}
            </button>
          </form>
        </div>

        {providersLoading ? <InventoryLoading label={t('inventory.checkingProviders')} /> : null}
        {!providersLoading && !error && providers.length === 0 ? (
          <InventoryState
            title={t('inventory.noActiveProvider')}
            detail={t('inventory.noActiveProviderDetail')}
            action={t('inventory.checkAgain')}
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && error ? (
          <InventoryState
            title={
              error.status === 404 ? t('inventory.providerUnavailable') : t('inventory.loadFailure')
            }
            detail={error.message}
            action={t('inventory.common.tryAgain')}
            onAction={() =>
              providerId ? void loadStock(providerId, query, offset) : void loadProviders()
            }
          />
        ) : null}
        {!providersLoading && !error && stockLoading && !page ? (
          <InventoryLoading label={t('inventory.loading')} />
        ) : null}
        {!providersLoading && !error && !stockLoading && page?.data.length === 0 ? (
          <InventoryState
            title={t('inventory.noMatch')}
            detail={
              query
                ? t('inventory.noMatchQuery', {
                    query,
                    provider: selectedProvider?.businessName ?? t('inventory.noMatchProvider'),
                  })
                : t('inventory.noStock')
            }
            action={query ? t('inventory.clearSearch') : t('inventory.common.refresh')}
            onAction={() => {
              if (query) {
                setDraftQuery('');
                setQuery('');
                setOffset(0);
              } else if (providerId) void loadStock(providerId, '', 0);
            }}
          />
        ) : null}
        {!error && page?.data.length ? (
          <InventoryTable
            page={page}
            locale={locale}
            t={t}
            onQuarantine={openQuarantine}
            onDamage={openDamage}
            onTransfer={providers.length > 1 ? openTransfer : undefined}
          />
        ) : null}

        {!error && page && page.total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-[#edf1ef] px-5 py-4 text-xs text-[#70827b] sm:px-6">
            <p>
              {t('inventory.range', {
                start: page.offset + 1,
                end: Math.min(page.offset + page.data.length, page.total),
                total: page.total,
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={stockLoading || page.offset === 0}
                onClick={() => setOffset(Math.max(0, page.offset - PAGE_SIZE))}
                className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
              >
                {t('inventory.common.previous')}
              </button>
              <button
                type="button"
                disabled={stockLoading || page.offset + page.data.length >= page.total}
                onClick={() => setOffset(page.offset + PAGE_SIZE)}
                className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
              >
                {t('inventory.common.next')}
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {quarantineReceipt ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"
        >
          {t('inventory.receipt.quarantine', {
            onHand: quarantineReceipt.onHandQuantity,
            reservations: quarantineReceipt.affectedReservationCount,
            released: quarantineReceipt.releasedUnitCount,
          })}
        </div>
      ) : null}

      {damageReceipt ? (
        <div
          role="status"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900"
        >
          {t('inventory.receipt.damage', {
            quantity: damageReceipt.quantity,
            before: damageReceipt.onHandBefore,
            after: damageReceipt.onHandAfter,
          })}
        </div>
      ) : null}

      {transferReceipt ? (
        <div
          role="status"
          className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm text-cyan-900"
        >
          {t('inventory.receipt.transfer', {
            quantity: transferReceipt.quantity,
            source: transferReceipt.sourceOnHandAfter,
            destination: transferReceipt.destinationOnHandAfter,
          })}
        </div>
      ) : null}

      {quarantineTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quarantine-title"
          className="fixed inset-0 z-50 grid place-items-center bg-[#0d211a]/55 p-4"
        >
          <form
            onSubmit={(event) => void submitQuarantine(event)}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-amber-700">
              {t('inventory.dialog.quarantine.eyebrow')}
            </p>
            <h2
              id="quarantine-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              {t('inventory.dialog.quarantine.title', {
                batch: quarantineTarget.batch.batchNumber,
              })}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              {t('inventory.dialog.quarantine.description', {
                medicine: quarantineTarget.medicineName,
              })}
            </p>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                {t('inventory.dialog.quarantine.reason')}
              </span>
              <select
                aria-label={t('inventory.dialog.quarantine.reason')}
                value={quarantineReason}
                onChange={(event) =>
                  setQuarantineReason(event.target.value as BatchQuarantineReason)
                }
                disabled={quarantineSubmitting}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b]"
              >
                {BATCH_QUARANTINE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {t(QUARANTINE_REASON_KEYS[reason])}
                  </option>
                ))}
              </select>
            </label>
            {quarantineError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {quarantineError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={quarantineSubmitting}
                onClick={() => setQuarantineTarget(null)}
                className="rounded-xl border border-[#dce5e1] px-4 py-2.5 text-sm font-bold text-[#536a62] disabled:opacity-50"
              >
                {t('inventory.dialog.cancel')}
              </button>
              <button
                type="submit"
                disabled={quarantineSubmitting}
                className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {quarantineSubmitting
                  ? t('inventory.dialog.quarantining')
                  : t('inventory.dialog.confirmQuarantine')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {damageTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="damage-title"
          className="fixed inset-0 z-50 grid place-items-center bg-[#0d211a]/55 p-4"
        >
          <form
            onSubmit={(event) => void submitDamage(event)}
            noValidate
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-rose-700">
              {t('inventory.dialog.damage.eyebrow')}
            </p>
            <h2
              id="damage-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              {t('inventory.dialog.damage.title', { batch: damageTarget.batch.batchNumber })}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              {t('inventory.dialog.damage.description', {
                medicine: damageTarget.medicineName,
              })}
            </p>
            <div className="mt-5 grid gap-4">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  {t('inventory.dialog.damage.quantity')}
                </span>
                <input
                  aria-label={t('inventory.dialog.damage.quantity')}
                  type="number"
                  min="1"
                  max={damageTarget.batch.availableQuantity}
                  step="1"
                  value={damageQuantity}
                  onChange={(event) => setDamageQuantity(event.target.value)}
                  disabled={damageSubmitting}
                  className="h-11 w-full rounded-xl border border-[#dce5e1] px-3 text-sm text-[#38544b]"
                />
                <span className="mt-1 block text-xs text-[#80908b]">
                  {t('inventory.dialog.damage.limit', {
                    quantity: damageTarget.batch.availableQuantity,
                  })}
                </span>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  {t('inventory.dialog.damage.reason')}
                </span>
                <textarea
                  aria-label={t('inventory.dialog.damage.reason')}
                  maxLength={500}
                  value={damageReason}
                  onChange={(event) => setDamageReason(event.target.value)}
                  disabled={damageSubmitting}
                  rows={4}
                  className="w-full rounded-xl border border-[#dce5e1] px-3 py-2 text-sm text-[#38544b]"
                />
              </label>
            </div>
            {damageError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {damageError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={damageSubmitting}
                onClick={() => setDamageTarget(null)}
                className="rounded-xl border border-[#dce5e1] px-4 py-2.5 text-sm font-bold text-[#536a62] disabled:opacity-50"
              >
                {t('inventory.dialog.cancel')}
              </button>
              <button
                type="submit"
                disabled={damageSubmitting}
                className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {damageSubmitting
                  ? t('inventory.dialog.recording')
                  : t('inventory.dialog.confirmDamage')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {transferTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transfer-title"
          className="fixed inset-0 z-50 grid place-items-center bg-[#0d211a]/55 p-4"
        >
          <form
            onSubmit={(event) => void submitTransfer(event)}
            noValidate
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-cyan-700">
              {t('inventory.dialog.transfer.eyebrow')}
            </p>
            <h2
              id="transfer-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              {t('inventory.dialog.transfer.title', { medicine: transferTarget.medicineName })}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              {t('inventory.dialog.transfer.description')}
            </p>
            <div className="mt-5 grid gap-4">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  {t('inventory.dialog.transfer.destination')}
                </span>
                <select
                  aria-label={t('inventory.dialog.transfer.destination')}
                  value={transferDestinationId}
                  onChange={(event) => setTransferDestinationId(event.target.value)}
                  disabled={transferSubmitting}
                  className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm text-[#38544b]"
                >
                  {providers
                    .filter((provider) => provider.providerId !== providerId)
                    .map((provider) => (
                      <option key={provider.providerId} value={provider.providerId}>
                        {provider.businessName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  {t('inventory.dialog.transfer.quantityShort')}
                </span>
                <input
                  aria-label={t('inventory.dialog.transfer.quantity')}
                  type="number"
                  min="1"
                  max={transferTarget.batch.availableQuantity}
                  step="1"
                  value={transferQuantity}
                  onChange={(event) => setTransferQuantity(event.target.value)}
                  disabled={transferSubmitting}
                  className="h-11 w-full rounded-xl border border-[#dce5e1] px-3 text-sm text-[#38544b]"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  {t('inventory.dialog.transfer.reason')}
                </span>
                <textarea
                  aria-label={t('inventory.dialog.transfer.reasonAria')}
                  maxLength={500}
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                  disabled={transferSubmitting}
                  rows={3}
                  className="w-full rounded-xl border border-[#dce5e1] px-3 py-2 text-sm text-[#38544b]"
                />
              </label>
            </div>
            {transferError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {transferError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={transferSubmitting}
                onClick={() => setTransferTarget(null)}
                className="rounded-xl border border-[#dce5e1] px-4 py-2.5 text-sm font-bold text-[#536a62] disabled:opacity-50"
              >
                {t('inventory.dialog.cancel')}
              </button>
              <button
                type="submit"
                disabled={transferSubmitting}
                className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {transferSubmitting
                  ? t('inventory.dialog.recording')
                  : t('inventory.dialog.confirmTransfer')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <p className="pb-2 text-center text-[11px] text-[#93a09c]">{t('inventory.footer')}</p>
    </div>
  );
}

function InventoryTable({
  page,
  locale,
  t,
  onQuarantine,
  onDamage,
  onTransfer,
}: {
  page: InventoryStockPage;
  locale: string;
  t: Translator;
  onQuarantine: (batch: InventoryBatchStock, medicineName: string) => void;
  onDamage: (batch: InventoryBatchStock, medicineName: string) => void;
  onTransfer?: (batch: InventoryBatchStock, medicineName: string) => void;
}) {
  return (
    <>
      {/* Desktop/tablet: full table. Below lg, a stacked card list takes over
          instead of forcing horizontal scroll across a dense 5-column table
          with per-batch action buttons -- scrolling sideways to find the
          quarantine/damage/transfer buttons is not workable on a phone. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1000px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
              <th className="px-6 py-3.5">{t('inventory.table.medicine')}</th>
              <th className="px-4 py-3.5">{t('inventory.table.pricing')}</th>
              <th className="px-4 py-3.5">{t('inventory.table.stockTotals')}</th>
              <th className="px-4 py-3.5">{t('inventory.table.batches')}</th>
              <th className="px-6 py-3.5">{t('inventory.table.visibility')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1ef]">
            {page.data.map((item) => (
              <tr key={item.inventoryId} className="align-top hover:bg-[#fbfdfc]">
                <td className="px-6 py-4">
                  <p className="text-sm font-bold text-[#1b372d]">{item.name}</p>
                  <p className="mt-1 text-xs text-[#758780]">
                    {item.genericName ?? t('inventory.table.genericUnavailable')} · {item.brand}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[#8a9893]">
                    {t('inventory.table.sku')} {item.sku ?? t('inventory.table.notAssigned')}
                  </p>
                </td>
                <td className="px-4 py-4 text-xs text-[#536a62]">
                  <p>
                    <strong>{t('inventory.table.selling')}:</strong>{' '}
                    {formatInventoryCurrency(item.sellingPrice, locale)}
                  </p>
                  <p className="mt-1">
                    <strong>{t('inventory.table.mrp')}:</strong>{' '}
                    {formatInventoryCurrency(item.mrp, locale)}
                  </p>
                </td>
                <td className="px-4 py-4 text-xs text-[#536a62]">
                  <p>
                    <strong>{item.totalAvailableQuantity}</strong> {t('inventory.common.available')}
                  </p>
                  <p className="mt-1">
                    {item.totalOnHandQuantity} {t('inventory.table.onHand')} ·{' '}
                    {item.totalHeldQuantity} {t('inventory.common.held')}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <BatchList
                    item={item}
                    locale={locale}
                    t={t}
                    onQuarantine={onQuarantine}
                    onDamage={onDamage}
                    onTransfer={onTransfer}
                  />
                </td>
                <td className="px-6 py-4">
                  <StatusBadge tone={item.isVisible ? 'emerald' : 'amber'}>
                    {item.isVisible ? t('inventory.table.visible') : t('inventory.table.hidden')}
                  </StatusBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[#edf1ef] lg:hidden">
        {page.data.map((item) => (
          <li key={item.inventoryId} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1b372d]">{item.name}</p>
                <p className="mt-1 text-xs text-[#758780]">
                  {item.genericName ?? t('inventory.table.genericUnavailable')} · {item.brand}
                </p>
              </div>
              <StatusBadge tone={item.isVisible ? 'emerald' : 'amber'}>
                {item.isVisible ? t('inventory.table.visible') : t('inventory.table.hidden')}
              </StatusBadge>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#fbfcfb] p-3 text-center">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  {t('inventory.table.onHand')}
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-[#28453b]">
                  {item.totalOnHandQuantity}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  {t('inventory.common.held')}
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-[#28453b]">
                  {item.totalHeldQuantity}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  {t('inventory.common.available')}
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-emerald-700">
                  {item.totalAvailableQuantity}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-[#536a62]">
              {t('inventory.table.selling')} {formatInventoryCurrency(item.sellingPrice, locale)} ·{' '}
              {t('inventory.table.mrp')} {formatInventoryCurrency(item.mrp, locale)}
            </p>
            <div className="mt-3">
              <BatchList
                item={item}
                locale={locale}
                t={t}
                onQuarantine={onQuarantine}
                onDamage={onDamage}
                onTransfer={onTransfer}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function BatchList({
  item,
  locale,
  t,
  onQuarantine,
  onDamage,
  onTransfer,
}: {
  item: InventoryStockItem;
  locale: string;
  t: Translator;
  onQuarantine: (batch: InventoryBatchStock, medicineName: string) => void;
  onDamage: (batch: InventoryBatchStock, medicineName: string) => void;
  onTransfer?: (batch: InventoryBatchStock, medicineName: string) => void;
}) {
  if (!item.batches.length) {
    return <span className="text-xs text-[#899792]">{t('inventory.table.noBatches')}</span>;
  }
  return (
    <div className="space-y-2">
      {item.batches.map((batch) => {
        const daysUntil = batch.status === 'ACTIVE' ? daysUntilExpiry(batch.expiryDate) : null;
        const urgency = expiryUrgency(daysUntil);
        // Only surface a chip for batches that actually need attention
        // (overdue or within the urgent window) -- a distant, healthy
        // expiry date doesn't need a badge cluttering every row.
        const showUrgencyChip = urgency === 'overdue' || urgency === 'urgent';
        return (
          <div key={batch.id} className="text-xs text-[#536a62]">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold">{batch.batchNumber}</span>
              <StatusBadge tone={batchStatusTone(batch.status)}>
                {batchStatusLabel(batch.status, t)}
              </StatusBadge>
              {showUrgencyChip ? (
                <StatusBadge tone={urgency === 'overdue' ? 'rose' : 'amber'}>
                  {localizedExpiryUrgency(daysUntil, t)}
                </StatusBadge>
              ) : null}
            </p>
            <p className="mt-0.5 text-[#899792]">
              {t('inventory.batch.expires', {
                date: formatInventoryDate(batch.expiryDate, locale),
                quantity: batch.availableQuantity,
              })}
            </p>
            {batch.status === 'ACTIVE' ? (
              <span className="mt-1.5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onQuarantine(batch, item.name)}
                  className="font-bold text-amber-700 hover:text-amber-800"
                  aria-label={t('inventory.batch.quarantineAria', { batch: batch.batchNumber })}
                >
                  {t('inventory.batch.quarantine')}
                </button>
                {batch.availableQuantity > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onDamage(batch, item.name)}
                      className="font-bold text-rose-700 hover:text-rose-800"
                      aria-label={t('inventory.batch.damageAria', { batch: batch.batchNumber })}
                    >
                      {t('inventory.batch.damage')}
                    </button>
                    {onTransfer ? (
                      <button
                        type="button"
                        onClick={() => onTransfer(batch, item.name)}
                        className="font-bold text-cyan-700 hover:text-cyan-800"
                        aria-label={t('inventory.batch.transferAria', {
                          batch: batch.batchNumber,
                        })}
                      >
                        {t('inventory.batch.transfer')}
                      </button>
                    ) : null}
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function batchStatusTone(
  status: InventoryBatchStock['status'],
): 'emerald' | 'amber' | 'rose' | 'slate' {
  if (status === 'ACTIVE') return 'emerald';
  if (status === 'QUARANTINED') return 'amber';
  if (status === 'EXPIRED') return 'rose';
  return 'slate';
}

function InventoryLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="grid min-h-64 place-items-center px-6 py-12 text-sm font-semibold text-[#71817c]"
    >
      <span className="inline-flex items-center gap-2">
        <Icon name="refresh" className="size-4 animate-spin" />
        {label}
      </span>
    </div>
  );
}

function InventoryState({
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
    <div className="grid min-h-64 place-items-center px-6 py-12 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf6f2] text-emerald-700">
          <Icon name="inventory" className="size-5" />
        </span>
        <h2 className="mt-4 font-[var(--font-display)] text-lg font-bold text-[#203c32]">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[#80908b]">{detail}</p>
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-sm font-bold text-emerald-700 hover:text-emerald-800"
        >
          {action}
        </button>
      </div>
    </div>
  );
}

function toPublicError(error: unknown, fallback: string): { message: string; status?: number } {
  return {
    message: fallback,
    status: error instanceof ApiError ? error.status : undefined,
  };
}

type Translator = (key: TranslationKey, values?: TranslationValues) => string;

function batchStatusLabel(status: InventoryBatchStock['status'], t: Translator): string {
  if (status === 'ACTIVE') return t('inventory.batch.active');
  if (status === 'QUARANTINED') return t('inventory.batch.quarantined');
  return t('inventory.batch.expired');
}

function localizedExpiryUrgency(daysUntil: number | null, t: Translator): string {
  if (daysUntil === null) return t('inventory.expiry.urgency.unknown');
  if (daysUntil < 0) return t('inventory.expiry.urgency.overdue', { days: Math.abs(daysUntil) });
  if (daysUntil === 0) return t('inventory.expiry.urgency.today');
  if (daysUntil === 1) return t('inventory.expiry.urgency.tomorrow');
  return t('inventory.expiry.urgency.days', { days: daysUntil });
}
