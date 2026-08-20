'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { ApiError, getAssignedProviders, getProviderExpiryWorklist } from '@/lib/api-client';
import type { InventoryExpiryWorklistPage, ProviderAccess } from '@/lib/inventory-contract';
import { daysUntilExpiry, expiryUrgencyLabel } from './inventory-data';

const PAGE_SIZE = 25;
const HORIZONS = [7, 30, 60, 90] as const;

export function ExpiryWorklistWorkspace() {
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
      setError(publicError(loadError, 'Unable to load assigned providers.'));
    } finally {
      setProvidersLoading(false);
    }
  }, []);

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
        setError(publicError(loadError, 'Unable to load expiry worklist.'));
      } finally {
        setLoading(false);
      }
    },
    [],
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
        title="Expiry worklist access is not assigned"
        detail="Your membership needs provider access and inventory.stock.read permission."
        action="Retry access check"
        onAction={() => void loadProviders()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-amber-700">
            Live physical batch evidence
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            Expiry worklist
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            Active on-hand batches approaching expiry. This read does not reconcile, quarantine,
            release, dispose, or notify.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/inventory"
            className="inline-flex items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158]"
          >
            Back to inventory
          </Link>
          <button
            type="button"
            disabled={!providerId || loading}
            onClick={() => providerId && void loadWorklist(providerId, horizonDays, offset)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Batches on page"
          value={String(metrics.batches)}
          detail="Current page only"
          icon="inventory"
        />
        <MetricCard
          label="Physical units"
          value={String(metrics.onHand)}
          detail="Current page only"
          icon="inventory"
          accent="cyan"
        />
        <MetricCard
          label="Held units"
          value={String(metrics.held)}
          detail="Current page only"
          icon="clock"
          accent="amber"
        />
        <MetricCard
          label="Available units"
          value={String(metrics.available)}
          detail="Current page only"
          icon="inventory"
          accent="rose"
        />
      </div>

      <SectionCard>
        <div className="grid gap-3 border-b border-[#edf1ef] bg-[#fbfcfb] p-4 sm:grid-cols-2 sm:p-5 lg:px-6">
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
          <label>
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
              Expiry horizon
            </span>
            <select
              aria-label="Expiry horizon"
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
                  Next {days} days
                </option>
              ))}
            </select>
          </label>
        </div>

        {providersLoading ? <Loading label="Checking assigned providers…" /> : null}
        {!providersLoading && !error && providers.length === 0 ? (
          <StatePanel
            title="No active provider assignment"
            detail="Ask a tenant administrator to assign this membership to an active provider."
            action="Check again"
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && error ? (
          <StatePanel
            title="Expiry worklist could not be loaded"
            detail={error.message}
            action="Try again"
            onAction={() =>
              providerId ? void loadWorklist(providerId, horizonDays, offset) : void loadProviders()
            }
          />
        ) : null}
        {!providersLoading && !error && loading && !page ? (
          <Loading label="Loading expiry worklist…" />
        ) : null}
        {!providersLoading && !error && page?.data.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="font-bold text-[#27483e]">
              No active on-hand batches expire in this horizon
            </p>
            <p className="mt-2 text-sm text-[#75857f]">
              Change the bounded horizon or refresh the authoritative read.
            </p>
          </div>
        ) : null}
        {!providersLoading && !error && page && page.data.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f8faf9] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#74847e]">
                  <tr>
                    <th className="px-5 py-3">Medicine</th>
                    <th className="px-5 py-3">Batch</th>
                    <th className="px-5 py-3">Expiry</th>
                    <th className="px-5 py-3">Physical</th>
                    <th className="px-5 py-3">Held</th>
                    <th className="px-5 py-3">Available</th>
                    <th className="px-5 py-3">Listing</th>
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
                        <p>{formatDate(item.expiryDate)}</p>
                        <p
                          className={`mt-0.5 text-[11px] font-bold ${expiryLabelTone(
                            daysUntilExpiry(item.expiryDate),
                          )}`}
                        >
                          {expiryUrgencyLabel(daysUntilExpiry(item.expiryDate))}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-bold text-[#24483d]">{item.onHandQuantity}</td>
                      <td className="px-5 py-4 text-[#735f30]">{item.heldQuantity}</td>
                      <td className="px-5 py-4 font-bold text-emerald-700">
                        {item.availableQuantity}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge tone={item.isVisible ? 'emerald' : 'slate'}>
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
                      {item.isVisible ? 'Visible' : 'Hidden'}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-xs text-[#456158]">
                    Batch <span className="font-semibold">{item.batchNumber}</span> · Expires{' '}
                    {formatDate(item.expiryDate)}
                  </p>
                  <p
                    className={`mt-1 text-[11px] font-bold ${expiryLabelTone(
                      daysUntilExpiry(item.expiryDate),
                    )}`}
                  >
                    {expiryUrgencyLabel(daysUntilExpiry(item.expiryDate))}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#f8faf9] p-3 text-center">
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#8a9994]">
                        Physical
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold text-[#24483d]">
                        {item.onHandQuantity}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#8a9994]">
                        Held
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold text-[#735f30]">
                        {item.heldQuantity}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#8a9994]">
                        Available
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
                Observed {formatDateTime(page.asOf)} · through {formatDateTime(page.horizonEndsAt)}{' '}
                · {page.total} total
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page.offset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page.offset + page.data.length >= page.total || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
                >
                  Next
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
    ? { message: error.message, status: error.status }
    : { message: fallback };
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

function expiryLabelTone(daysUntil: number | null): string {
  if (daysUntil === null) return 'text-[#8a9994]';
  if (daysUntil < 0) return 'text-rose-700';
  if (daysUntil <= 7) return 'text-amber-700';
  return 'text-[#8a9994]';
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}
