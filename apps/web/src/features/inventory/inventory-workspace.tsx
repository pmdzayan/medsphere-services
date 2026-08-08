'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { ApiError, getAssignedProviders, getProviderStock } from '@/lib/api-client';
import type { InventoryStockPage, ProviderAccess } from '@/lib/inventory-contract';
import {
  formatInventoryCurrency,
  formatInventoryDate,
  loadedInventoryMetrics,
} from './inventory-data';

const PAGE_SIZE = 25;

export function InventoryWorkspace() {
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [page, setPage] = useState<InventoryStockPage | null>(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
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
            Read-only stock returned for providers currently assigned to your authenticated
            membership.
          </p>
        </div>
        <button
          type="button"
          onClick={() => providerId && void loadStock(providerId, query, offset)}
          disabled={!providerId || stockLoading}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158] disabled:cursor-wait disabled:opacity-50"
        >
          <Icon name="refresh" className={`size-4 ${stockLoading ? 'animate-spin' : ''}`} />
          Refresh stock
        </button>
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
        {!error && page?.data.length ? <InventoryTable page={page} /> : null}

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

      <p className="pb-2 text-center text-[11px] text-[#93a09c]">
        Read-only live data · Access is rechecked by the inventory service for every request
      </p>
    </div>
  );
}

function InventoryTable({ page }: { page: InventoryStockPage }) {
  return (
    <div className="overflow-x-auto">
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
                <div className="space-y-2">
                  {item.batches.length ? (
                    item.batches.map((batch) => (
                      <div key={batch.id} className="text-xs text-[#536a62]">
                        <p>
                          <span className="font-mono font-semibold">{batch.batchNumber}</span> ·{' '}
                          {batch.status}
                        </p>
                        <p className="mt-0.5 text-[#899792]">
                          Expires {formatInventoryDate(batch.expiryDate)} ·{' '}
                          {batch.availableQuantity} available
                        </p>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-[#899792]">No batches</span>
                  )}
                </div>
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
  );
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
