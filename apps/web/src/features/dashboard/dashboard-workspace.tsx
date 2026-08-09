'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import {
  ApiError,
  getAssignedProviders,
  getProviderReservations,
  getProviderStock,
} from '@/lib/api-client';
import type {
  InventoryStockItem,
  InventoryStockPage,
  ProviderAccess,
} from '@/lib/inventory-contract';
import {
  RESERVATION_STATUSES,
  type ProviderReservation,
  type ProviderReservationPage,
  type ReservationStatus,
} from '@/lib/reservation-contract';
import { formatInventoryDate, loadedInventoryMetrics } from '../inventory/inventory-data';

const PAGE_SIZE = 10;

type PublicError = { message: string; status?: number };

const statusTone: Record<ReservationStatus, 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate'> = {
  PENDING: 'amber',
  CONFIRMED: 'cyan',
  READY: 'emerald',
  COMPLETED: 'slate',
  CANCELLED: 'rose',
  EXPIRED: 'rose',
};

export function DashboardWorkspace() {
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerError, setProviderError] = useState<PublicError | null>(null);
  const [stock, setStock] = useState<InventoryStockPage | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<PublicError | null>(null);
  const [reservations, setReservations] = useState<ProviderReservationPage | null>(null);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState<PublicError | null>(null);
  const providerRequest = useRef(0);
  const stockRequest = useRef(0);
  const reservationRequest = useRef(0);

  const loadProviders = useCallback(async () => {
    const request = ++providerRequest.current;
    setProvidersLoading(true);
    setProviderError(null);
    try {
      const assigned = (await getAssignedProviders()).filter((provider) => provider.isActive);
      if (request !== providerRequest.current) return;
      setProviders(assigned);
      setProviderId((current) =>
        assigned.some((provider) => provider.providerId === current)
          ? current
          : (assigned[0]?.providerId ?? ''),
      );
    } catch (error) {
      if (request !== providerRequest.current) return;
      setProviders([]);
      setProviderId('');
      setProviderError(toPublicError(error, 'Unable to load assigned providers.'));
    } finally {
      if (request === providerRequest.current) setProvidersLoading(false);
    }
  }, []);

  const loadStock = useCallback(async (selectedProvider: string) => {
    const request = ++stockRequest.current;
    setStockLoading(true);
    setStockError(null);
    setStock(null);
    try {
      const page = await getProviderStock({
        providerId: selectedProvider,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (request === stockRequest.current) setStock(page);
    } catch (error) {
      if (request === stockRequest.current) {
        setStockError(toPublicError(error, 'Unable to load provider stock.'));
      }
    } finally {
      if (request === stockRequest.current) setStockLoading(false);
    }
  }, []);

  const loadReservations = useCallback(async (selectedProvider: string) => {
    const request = ++reservationRequest.current;
    setReservationsLoading(true);
    setReservationsError(null);
    setReservations(null);
    try {
      const page = await getProviderReservations({
        providerId: selectedProvider,
        limit: PAGE_SIZE,
        offset: 0,
      });
      if (request === reservationRequest.current) setReservations(page);
    } catch (error) {
      if (request === reservationRequest.current) {
        setReservationsError(toPublicError(error, 'Unable to load provider reservations.'));
      }
    } finally {
      if (request === reservationRequest.current) setReservationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders();
    return () => {
      providerRequest.current += 1;
    };
  }, [loadProviders]);
  useEffect(() => {
    if (!providerId) {
      stockRequest.current += 1;
      reservationRequest.current += 1;
      setStock(null);
      setReservations(null);
      setStockError(null);
      setReservationsError(null);
      setStockLoading(false);
      setReservationsLoading(false);
      return;
    }
    void loadStock(providerId);
    void loadReservations(providerId);
    return () => {
      stockRequest.current += 1;
      reservationRequest.current += 1;
    };
  }, [loadReservations, loadStock, providerId]);

  const selectProvider = (nextProviderId: string) => {
    stockRequest.current += 1;
    reservationRequest.current += 1;
    setStock(null);
    setReservations(null);
    setStockError(null);
    setReservationsError(null);
    setProviderId(nextProviderId);
  };

  const stockMetrics = useMemo(() => loadedInventoryMetrics(stock?.data ?? []), [stock]);
  const reservationMetrics = useMemo(
    () => loadedReservationMetrics(reservations?.data ?? []),
    [reservations],
  );
  const selectedProvider = providers.find((provider) => provider.providerId === providerId);

  return (
    <main className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
            Live assigned-provider operations
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            Operations overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            A read-only current-page view of accepted stock and reservation records. No patient,
            prescription, payment, or delivery identity is displayed.
          </p>
        </div>
        <nav aria-label="Operations workspaces" className="flex flex-wrap gap-2.5">
          <WorkspaceLink href="/inventory" icon="inventory">
            Open Inventory
          </WorkspaceLink>
          <WorkspaceLink href="/reservations" icon="reservations">
            Open Reservations
          </WorkspaceLink>
        </nav>
      </header>

      <SectionCard>
        <div className="border-b border-[#edf1ef] bg-[#fbfcfb] p-4 sm:p-5 lg:px-6">
          <label className="block max-w-xl">
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
              Assigned provider
            </span>
            <select
              aria-label="Assigned provider"
              value={providerId}
              disabled={providersLoading || providers.length === 0}
              onChange={(event) => selectProvider(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b] disabled:opacity-60"
            >
              {providers.length === 0 ? (
                <option value="">No active provider assignment</option>
              ) : null}
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.businessName} ·{' '}
                  {provider.providerType === 'PHARMACY' ? 'Pharmacy' : 'Hospital'}
                </option>
              ))}
            </select>
          </label>
          {selectedProvider ? (
            <p className="mt-2 text-xs text-[#7a8b85]">
              Showing bounded reads for {selectedProvider.businessName}.
            </p>
          ) : null}
        </div>
        {providersLoading ? <LoadingState label="Checking assigned providers…" /> : null}
        {!providersLoading && providerError ? (
          <StatePanel
            title={errorTitle(providerError, 'Assigned providers are unavailable')}
            detail={providerError.message}
            action="Retry provider access"
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && !providerError && providers.length === 0 ? (
          <StatePanel
            title="No active provider assignment"
            detail="Ask a tenant administrator to assign this membership to an active pharmacy or hospital."
            action="Check assignments again"
            onAction={() => void loadProviders()}
          />
        ) : null}
      </SectionCard>

      {providerId ? (
        <>
          <section aria-labelledby="stock-metrics-title" className="space-y-3">
            <SectionTitle id="stock-metrics-title">Stock · Current page</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Products"
                value={metricValue(stock, stockMetrics.products)}
                icon="inventory"
                detail="Current page"
              />
              <MetricCard
                label="Batches"
                value={metricValue(stock, stockMetrics.batches)}
                icon="calendar"
                accent="cyan"
                detail="Current page"
              />
              <MetricCard
                label="On-hand units"
                value={metricValue(stock, stockMetrics.onHand)}
                icon="inventory"
                accent="amber"
                detail="Current page"
              />
              <MetricCard
                label="Held units"
                value={metricValue(stock, stockMetrics.held)}
                icon="clock"
                accent="rose"
                detail="Current page"
              />
              <MetricCard
                label="Available units"
                value={metricValue(stock, stockMetrics.available)}
                icon="inventory"
                detail="Current page"
              />
            </div>
          </section>

          <section aria-labelledby="reservation-metrics-title" className="space-y-3">
            <SectionTitle id="reservation-metrics-title">Reservations · Current page</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Reservations"
                value={metricValue(reservations, reservationMetrics.total)}
                icon="reservations"
                detail="Current page"
              />
              <MetricCard
                label="Medicine units"
                value={metricValue(reservations, reservationMetrics.units)}
                icon="inventory"
                accent="cyan"
                detail="Current page"
              />
              <MetricCard
                label="Pending or confirmed"
                value={metricValue(reservations, reservationMetrics.open)}
                icon="clock"
                accent="amber"
                detail="Current page"
              />
              <MetricCard
                label="Ready"
                value={metricValue(reservations, reservationMetrics.ready)}
                icon="reservations"
                accent="rose"
                detail="Current page"
              />
            </div>
            {reservations && reservationMetrics.total > 0 ? (
              <div
                aria-label="Current-page reservation status counts"
                className="flex flex-wrap gap-2"
              >
                {RESERVATION_STATUSES.map((status) => (
                  <StatusBadge key={status} tone={statusTone[status]}>
                    {titleCase(status)}: {reservationMetrics.statuses[status]}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
          </section>

          <div className="grid gap-5 2xl:grid-cols-2">
            <SectionCard>
              <PanelHeader
                title="Stock records"
                resultCount={stock?.total}
                loading={stockLoading}
                action="Retry stock"
                onAction={() => void loadStock(providerId)}
              />
              {stockLoading ? <LoadingState label="Loading current-page stock…" /> : null}
              {!stockLoading && stockError ? (
                <StatePanel
                  title={errorTitle(stockError, 'Stock is unavailable')}
                  detail={stockError.message}
                  action="Retry stock"
                  onAction={() => void loadStock(providerId)}
                />
              ) : null}
              {!stockLoading && !stockError && stock?.data.length === 0 ? (
                <StatePanel
                  title="No stock records"
                  detail="The accepted stock read returned no products for this provider."
                  action="Refresh stock"
                  onAction={() => void loadStock(providerId)}
                />
              ) : null}
              {!stockLoading && !stockError && stock?.data.length ? (
                <StockTable items={stock.data} />
              ) : null}
            </SectionCard>

            <SectionCard>
              <PanelHeader
                title="Reservation records"
                resultCount={reservations?.total}
                loading={reservationsLoading}
                action="Retry reservations"
                onAction={() => void loadReservations(providerId)}
              />
              {reservationsLoading ? (
                <LoadingState label="Loading current-page reservations…" />
              ) : null}
              {!reservationsLoading && reservationsError ? (
                <StatePanel
                  title={errorTitle(reservationsError, 'Reservations are unavailable')}
                  detail={reservationsError.message}
                  action="Retry reservations"
                  onAction={() => void loadReservations(providerId)}
                />
              ) : null}
              {!reservationsLoading && !reservationsError && reservations?.data.length === 0 ? (
                <StatePanel
                  title="No reservation records"
                  detail="The accepted reservation read returned no reservations for this provider."
                  action="Refresh reservations"
                  onAction={() => void loadReservations(providerId)}
                />
              ) : null}
              {!reservationsLoading && !reservationsError && reservations?.data.length ? (
                <ReservationTable reservations={reservations.data} />
              ) : null}
            </SectionCard>
          </div>
        </>
      ) : null}

      <p className="pb-2 text-center text-[11px] text-[#93a09c]">
        Read-only bounded data · No operational mutation is available from this overview
      </p>
    </main>
  );
}

function WorkspaceLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: 'inventory' | 'reservations';
  children: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158] shadow-sm hover:border-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    >
      <Icon name={icon} className="size-4" /> {children}
    </Link>
  );
}

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="text-sm font-extrabold uppercase tracking-[.13em] text-[#38544b]">
      {children}
    </h2>
  );
}

function PanelHeader({
  title,
  resultCount,
  loading,
  action,
  onAction,
}: {
  title: string;
  resultCount?: number;
  loading: boolean;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ef] px-5 py-4 sm:px-6">
      <div>
        <h2 className="font-[var(--font-display)] text-lg font-bold tracking-[-.025em] text-[#173128]">
          {title}
        </h2>
        {resultCount !== undefined ? (
          <p className="mt-1 text-xs text-[#7a8b85]">
            {resultCount} exact result{resultCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={loading}
        onClick={onAction}
        className="inline-flex items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-3.5 py-2 text-xs font-bold text-[#436158] disabled:cursor-wait disabled:opacity-50"
      >
        <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} /> {action}
      </button>
    </div>
  );
}

function StockTable({ items }: { items: InventoryStockItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
            <th className="px-5 py-3.5 sm:px-6">Product</th>
            <th className="px-4 py-3.5">Batches</th>
            <th className="px-4 py-3.5">On hand</th>
            <th className="px-4 py-3.5">Held</th>
            <th className="px-5 py-3.5 sm:px-6">Available</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1ef]">
          {items.map((item) => (
            <tr key={item.inventoryId}>
              <td className="px-5 py-4 sm:px-6">
                <p className="text-sm font-bold text-[#1b372d]">{item.name}</p>
                <p className="mt-1 text-xs text-[#85938f]">
                  {item.brand}
                  {item.sku ? ` · ${item.sku}` : ''}
                </p>
              </td>
              <td className="px-4 py-4 text-sm text-[#405a52]">{item.batches.length}</td>
              <td className="px-4 py-4 text-sm text-[#405a52]">{item.totalOnHandQuantity}</td>
              <td className="px-4 py-4 text-sm text-[#405a52]">{item.totalHeldQuantity}</td>
              <td className="px-5 py-4 text-sm font-bold text-emerald-700 sm:px-6">
                {item.totalAvailableQuantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReservationTable({ reservations }: { reservations: ProviderReservation[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
            <th className="px-5 py-3.5 sm:px-6">Reservation</th>
            <th className="px-4 py-3.5">Status</th>
            <th className="px-4 py-3.5">Products</th>
            <th className="px-4 py-3.5">Units</th>
            <th className="px-5 py-3.5 sm:px-6">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1ef]">
          {reservations.map((reservation) => (
            <tr key={reservation.id}>
              <td className="px-5 py-4 font-mono text-xs font-semibold text-[#38544b] sm:px-6">
                {shortId(reservation.id)}
              </td>
              <td className="px-4 py-4">
                <StatusBadge tone={statusTone[reservation.status]}>
                  {titleCase(reservation.status)}
                </StatusBadge>
              </td>
              <td className="px-4 py-4 text-sm text-[#405a52]">{reservation.items.length}</td>
              <td className="px-4 py-4 text-sm font-bold text-[#405a52]">
                {reservation.totalQuantity}
              </td>
              <td className="px-5 py-4 text-sm text-[#60736c] sm:px-6">
                {formatInventoryDate(reservation.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 px-5 py-10 text-sm font-semibold text-[#60736c] sm:px-6"
      role="status"
    >
      <Icon name="refresh" className="size-5 animate-spin" /> {label}
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
    <div className="px-5 py-10 sm:px-6">
      <h2 className="text-lg font-bold text-[#1b372d]">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">{detail}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-emerald-700"
      >
        <Icon name="refresh" className="size-4" /> {action}
      </button>
    </div>
  );
}

function loadedReservationMetrics(items: ProviderReservation[]) {
  const statuses = Object.fromEntries(RESERVATION_STATUSES.map((status) => [status, 0])) as Record<
    ReservationStatus,
    number
  >;
  let units = 0;
  for (const reservation of items) {
    statuses[reservation.status] += 1;
    units += reservation.totalQuantity;
  }
  return {
    total: items.length,
    units,
    open: statuses.PENDING + statuses.CONFIRMED,
    ready: statuses.READY,
    statuses,
  };
}

function toPublicError(error: unknown, fallback: string): PublicError {
  return error instanceof ApiError
    ? { message: error.message, status: error.status }
    : { message: fallback };
}

function errorTitle(error: PublicError, fallback: string): string {
  if (error.status === 401) return 'Your session must be verified';
  if (error.status === 403) return 'Access is restricted';
  return fallback;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function shortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

function metricValue(page: InventoryStockPage | ProviderReservationPage | null, value: number) {
  return page ? String(value) : '—';
}
