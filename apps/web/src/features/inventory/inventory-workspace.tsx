'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
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
import {
  daysUntilExpiry,
  expiryUrgency,
  expiryUrgencyLabel,
  formatInventoryCurrency,
  formatInventoryDate,
  loadedInventoryMetrics,
} from './inventory-data';

const PAGE_SIZE = 25;
const QUARANTINE_REASON_LABELS: Record<BatchQuarantineReason, string> = {
  QUALITY_SUSPECT: 'Quality concern',
  TEMPERATURE_EXCURSION: 'Temperature excursion',
  PACKAGING_COMPROMISED: 'Packaging compromised',
  STORAGE_DEVIATION: 'Storage deviation',
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
      setError(toPublicError(loadError, 'Unable to load assigned providers.'));
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  const loadStock = useCallback(async (selectedProvider: string, search: string, start: number) => {
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
      setError(toPublicError(loadError, 'Unable to load provider stock.'));
    } finally {
      setStockLoading(false);
    }
  }, []);

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
      setQuarantineError(toPublicError(mutationError, 'Unable to quarantine this batch.').message);
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
      setDamageError('Enter a valid available quantity and a reason of 1–500 characters.');
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
      setDamageError(
        toPublicError(mutationError, 'Unable to record damaged stock for this batch.').message,
      );
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
      setTransferError('Select another assigned provider and enter a valid available quantity.');
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
      setTransferError(
        toPublicError(mutationError, 'Unable to record the completed transfer.').message,
      );
    } finally {
      setTransferSubmitting(false);
    }
  }

  if (!providersLoading && error?.status === 403 && providers.length === 0) {
    return (
      <InventoryState
        title="Inventory access is not assigned"
        detail="Your membership needs authorization.provider-access.read before assigned provider stock can be viewed."
        action="Retry access check"
        onAction={() => void loadProviders()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
            Live assigned-provider stock
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            Medicine inventory
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            Live stock and bounded batch-safety actions for providers assigned to your authenticated
            membership.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/inventory/expiry"
            className="inline-flex w-fit items-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white"
          >
            Expiry worklist
          </Link>
          <button
            type="button"
            onClick={() => providerId && void loadStock(providerId, query, offset)}
            disabled={!providerId || stockLoading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158] disabled:cursor-wait disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${stockLoading ? 'animate-spin' : ''}`} />
            Refresh stock
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Products on page"
          value={String(metrics.products)}
          icon="inventory"
          detail="Current loaded page only"
        />
        <MetricCard
          label="Available units"
          value={String(metrics.available)}
          icon="inventory"
          accent="cyan"
          detail="Current loaded page only"
        />
        <MetricCard
          label="Held units"
          value={String(metrics.held)}
          icon="clock"
          accent="amber"
          detail="Current loaded page only"
        />
        <MetricCard
          label="Batches on page"
          value={String(metrics.batches)}
          icon="calendar"
          accent="rose"
          detail="Current loaded page only"
        />
      </div>

      <SectionCard>
        <div className="grid gap-3 border-b border-[#edf1ef] bg-[#fbfcfb] p-4 sm:p-5 lg:grid-cols-[minmax(14rem,22rem)_1fr] lg:px-6">
          <label>
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
              Assigned provider
            </span>
            <select
              aria-label="Assigned provider"
              value={providerId}
              disabled={providersLoading || providers.length === 0}
              onChange={(event) => {
                setProviderId(event.target.value);
                setOffset(0);
              }}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b] disabled:opacity-60"
            >
              {providers.length === 0 ? <option value="">No assigned provider</option> : null}
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.businessName} ·{' '}
                  {provider.providerType === 'PHARMACY' ? 'Pharmacy' : 'Hospital'}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={submitSearch} className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
                Product search
              </span>
              <input
                aria-label="Product search"
                type="search"
                maxLength={120}
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder="Name, generic name, brand, or SKU"
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-4 text-sm text-[#264239]"
              />
            </label>
            <button
              type="submit"
              disabled={!providerId || stockLoading}
              className="h-11 rounded-xl bg-[#0b5f4b] px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              Search
            </button>
          </form>
        </div>

        {providersLoading ? <InventoryLoading label="Checking assigned providers…" /> : null}
        {!providersLoading && !error && providers.length === 0 ? (
          <InventoryState
            title="No active provider assignment"
            detail="Ask a tenant administrator to assign this membership to an active pharmacy or hospital."
            action="Check again"
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && error ? (
          <InventoryState
            title={
              error.status === 404
                ? 'Provider stock is no longer available'
                : 'Inventory could not be loaded'
            }
            detail={error.message}
            action="Try again"
            onAction={() =>
              providerId ? void loadStock(providerId, query, offset) : void loadProviders()
            }
          />
        ) : null}
        {!providersLoading && !error && stockLoading && !page ? (
          <InventoryLoading label="Loading live stock…" />
        ) : null}
        {!providersLoading && !error && !stockLoading && page?.data.length === 0 ? (
          <InventoryState
            title="No stock matched"
            detail={
              query
                ? `No products matched “${query}” for ${selectedProvider?.businessName ?? 'this provider'}.`
                : 'This assigned provider has no stock listings in the current result.'
            }
            action={query ? 'Clear search' : 'Refresh'}
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
            onQuarantine={openQuarantine}
            onDamage={openDamage}
            onTransfer={providers.length > 1 ? openTransfer : undefined}
          />
        ) : null}

        {!error && page && page.total > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-[#edf1ef] px-5 py-4 text-xs text-[#70827b] sm:px-6">
            <p>
              {page.offset + 1}–{Math.min(page.offset + page.data.length, page.total)} of{' '}
              {page.total} products
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={stockLoading || page.offset === 0}
                onClick={() => setOffset(Math.max(0, page.offset - PAGE_SIZE))}
                className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={stockLoading || page.offset + page.data.length >= page.total}
                onClick={() => setOffset(page.offset + PAGE_SIZE)}
                className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
              >
                Next
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
          Batch quarantined. Physical quantity remains {quarantineReceipt.onHandQuantity};{' '}
          {quarantineReceipt.affectedReservationCount} reservation(s) were cancelled and{' '}
          {quarantineReceipt.releasedUnitCount} held unit(s) were released.
        </div>
      ) : null}

      {damageReceipt ? (
        <div
          role="status"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900"
        >
          Damaged stock recorded. {damageReceipt.quantity} unit(s) were removed from physical
          on-hand quantity: {damageReceipt.onHandBefore} → {damageReceipt.onHandAfter}.
        </div>
      ) : null}

      {transferReceipt ? (
        <div
          role="status"
          className="rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-sm text-cyan-900"
        >
          Completed transfer recorded for {transferReceipt.quantity} unit(s). Source on-hand is now{' '}
          {transferReceipt.sourceOnHandAfter}; destination on-hand is{' '}
          {transferReceipt.destinationOnHandAfter}.
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
              One-way safety action
            </p>
            <h2
              id="quarantine-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              Quarantine batch {quarantineTarget.batch.batchNumber}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              {quarantineTarget.medicineName} will become unavailable. Active reservations holding
              this batch will be cancelled and their holds released. Physical stock is not removed,
              and this action cannot be reversed in V1.
            </p>
            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                Quarantine reason
              </span>
              <select
                aria-label="Quarantine reason"
                value={quarantineReason}
                onChange={(event) =>
                  setQuarantineReason(event.target.value as BatchQuarantineReason)
                }
                disabled={quarantineSubmitting}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b]"
              >
                {BATCH_QUARANTINE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {QUARANTINE_REASON_LABELS[reason]}
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={quarantineSubmitting}
                className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {quarantineSubmitting ? 'Quarantining…' : 'Confirm quarantine'}
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
              Completed physical write-off
            </p>
            <h2
              id="damage-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              Record damage for batch {damageTarget.batch.batchNumber}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              Use this only after damage is physically confirmed for {damageTarget.medicineName}.
              The accepted quantity is permanently removed from on-hand stock. This records the
              write-off; it does not claim disposal or approval.
            </p>
            <div className="mt-5 grid gap-4">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  Damaged quantity
                </span>
                <input
                  aria-label="Damaged quantity"
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
                  Up to {damageTarget.batch.availableQuantity} currently available unit(s)
                </span>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  Confirmed damage reason
                </span>
                <textarea
                  aria-label="Confirmed damage reason"
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={damageSubmitting}
                className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {damageSubmitting ? 'Recording…' : 'Confirm damaged stock'}
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
              Completed physical transfer
            </p>
            <h2
              id="transfer-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              Record transfer of {transferTarget.medicineName}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              Use this only after the stock has physically moved. The command atomically records
              both provider balances; it does not create a shipment, transit, or approval workflow.
            </p>
            <div className="mt-5 grid gap-4">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">
                  Destination provider
                </span>
                <select
                  aria-label="Destination provider"
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
                <span className="mb-1.5 block text-xs font-bold text-[#38544b]">Quantity</span>
                <input
                  aria-label="Transfer quantity"
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
                  Optional operational reason
                </span>
                <textarea
                  aria-label="Transfer reason"
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={transferSubmitting}
                className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {transferSubmitting ? 'Recording…' : 'Confirm completed transfer'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <p className="pb-2 text-center text-[11px] text-[#93a09c]">
        Live data · Provider assignment and command permission are rechecked for every request
      </p>
    </div>
  );
}

function InventoryTable({
  page,
  onQuarantine,
  onDamage,
  onTransfer,
}: {
  page: InventoryStockPage;
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
              <th className="px-6 py-3.5">Medicine</th>
              <th className="px-4 py-3.5">Pricing</th>
              <th className="px-4 py-3.5">Stock totals</th>
              <th className="px-4 py-3.5">Batches</th>
              <th className="px-6 py-3.5">Visibility</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1ef]">
            {page.data.map((item) => (
              <tr key={item.inventoryId} className="align-top hover:bg-[#fbfdfc]">
                <td className="px-6 py-4">
                  <p className="text-sm font-bold text-[#1b372d]">{item.name}</p>
                  <p className="mt-1 text-xs text-[#758780]">
                    {item.genericName ?? 'Generic name unavailable'} · {item.brand}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[#8a9893]">
                    SKU {item.sku ?? 'not assigned'}
                  </p>
                </td>
                <td className="px-4 py-4 text-xs text-[#536a62]">
                  <p>
                    <strong>Selling:</strong> {formatInventoryCurrency(item.sellingPrice)}
                  </p>
                  <p className="mt-1">
                    <strong>MRP:</strong> {formatInventoryCurrency(item.mrp)}
                  </p>
                </td>
                <td className="px-4 py-4 text-xs text-[#536a62]">
                  <p>
                    <strong>{item.totalAvailableQuantity}</strong> available
                  </p>
                  <p className="mt-1">
                    {item.totalOnHandQuantity} on hand · {item.totalHeldQuantity} held
                  </p>
                </td>
                <td className="px-4 py-4">
                  <BatchList
                    item={item}
                    onQuarantine={onQuarantine}
                    onDamage={onDamage}
                    onTransfer={onTransfer}
                  />
                </td>
                <td className="px-6 py-4">
                  <StatusBadge tone={item.isVisible ? 'emerald' : 'amber'}>
                    {item.isVisible ? 'Visible' : 'Hidden'}
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
                  {item.genericName ?? 'Generic name unavailable'} · {item.brand}
                </p>
              </div>
              <StatusBadge tone={item.isVisible ? 'emerald' : 'amber'}>
                {item.isVisible ? 'Visible' : 'Hidden'}
              </StatusBadge>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#fbfcfb] p-3 text-center">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  On hand
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-[#28453b]">
                  {item.totalOnHandQuantity}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  Held
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-[#28453b]">
                  {item.totalHeldQuantity}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  Available
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-emerald-700">
                  {item.totalAvailableQuantity}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-[#536a62]">
              Selling {formatInventoryCurrency(item.sellingPrice)} · MRP{' '}
              {formatInventoryCurrency(item.mrp)}
            </p>
            <div className="mt-3">
              <BatchList
                item={item}
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
  onQuarantine,
  onDamage,
  onTransfer,
}: {
  item: InventoryStockItem;
  onQuarantine: (batch: InventoryBatchStock, medicineName: string) => void;
  onDamage: (batch: InventoryBatchStock, medicineName: string) => void;
  onTransfer?: (batch: InventoryBatchStock, medicineName: string) => void;
}) {
  if (!item.batches.length) {
    return <span className="text-xs text-[#899792]">No batches</span>;
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
                {batch.status === 'QUARANTINED' ? 'Quarantined' : batch.status}
              </StatusBadge>
              {showUrgencyChip ? (
                <StatusBadge tone={urgency === 'overdue' ? 'rose' : 'amber'}>
                  {expiryUrgencyLabel(daysUntil)}
                </StatusBadge>
              ) : null}
            </p>
            <p className="mt-0.5 text-[#899792]">
              Expires {formatInventoryDate(batch.expiryDate)} · {batch.availableQuantity} available
            </p>
            {batch.status === 'ACTIVE' ? (
              <span className="mt-1.5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onQuarantine(batch, item.name)}
                  className="font-bold text-amber-700 hover:text-amber-800"
                  aria-label={`Quarantine batch ${batch.batchNumber}`}
                >
                  Quarantine batch
                </button>
                {batch.availableQuantity > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onDamage(batch, item.name)}
                      className="font-bold text-rose-700 hover:text-rose-800"
                      aria-label={`Record damage for batch ${batch.batchNumber}`}
                    >
                      Record damage
                    </button>
                    {onTransfer ? (
                      <button
                        type="button"
                        onClick={() => onTransfer(batch, item.name)}
                        className="font-bold text-cyan-700 hover:text-cyan-800"
                        aria-label={`Record completed transfer for batch ${batch.batchNumber}`}
                      >
                        Record transfer
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
    message: error instanceof Error ? error.message : fallback,
    status: error instanceof ApiError ? error.status : undefined,
  };
}
