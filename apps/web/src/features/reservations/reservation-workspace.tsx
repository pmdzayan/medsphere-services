'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { ApiError, getAssignedProviders, getProviderReservations } from '@/lib/api-client';
import type { ProviderAccess } from '@/lib/inventory-contract';
import {
  RESERVATION_STATUSES,
  type ProviderReservation,
  type ProviderReservationPage,
  type ReservationStatus,
} from '@/lib/reservation-contract';

const PAGE_SIZE = 25;
const statusTone: Record<ReservationStatus, 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate'> = {
  PENDING: 'amber',
  CONFIRMED: 'cyan',
  READY: 'emerald',
  COMPLETED: 'slate',
  CANCELLED: 'rose',
  EXPIRED: 'rose',
};

export function ReservationWorkspace() {
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [status, setStatus] = useState<'' | ReservationStatus>('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ProviderReservationPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
        assigned.some((item) => item.providerId === current)
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

  const loadReservations = useCallback(
    async (selectedProvider: string, selectedStatus: '' | ReservationStatus, start: number) => {
      if (!selectedProvider) return;
      setLoading(true);
      setError(null);
      setSelectedId(null);
      try {
        setPage(
          await getProviderReservations({
            providerId: selectedProvider,
            status: selectedStatus || undefined,
            limit: PAGE_SIZE,
            offset: start,
          }),
        );
      } catch (loadError) {
        setPage(null);
        setError(publicError(loadError, 'Unable to load provider reservations.'));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => void loadProviders(), [loadProviders]);
  useEffect(() => {
    if (!providersLoading && providerId) void loadReservations(providerId, status, offset);
  }, [loadReservations, offset, providerId, providersLoading, status]);

  const metrics = useMemo(() => reservationMetrics(page?.data ?? []), [page]);
  const selected = page?.data.find((reservation) => reservation.id === selectedId) ?? null;

  if (!providersLoading && error?.status === 403 && providers.length === 0) {
    return (
      <WorkspaceState
        title="Reservation access is not assigned"
        detail="Your membership needs provider-access and inventory.reservations.read permissions."
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
            Live assigned-provider reservations
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            Reservation workspace
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            Read-only operational records. This view contains no patient, prescription, payment, or
            delivery identity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => providerId && void loadReservations(providerId, status, offset)}
          disabled={!providerId || loading}
          className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158] disabled:opacity-50"
        >
          <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          reservations
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Reservations on page"
          value={String(metrics.total)}
          icon="reservations"
          detail="Current loaded page only"
        />
        <MetricCard
          label="Pending or confirmed"
          value={String(metrics.open)}
          icon="clock"
          accent="cyan"
          detail="Current loaded page only"
        />
        <MetricCard
          label="Ready"
          value={String(metrics.ready)}
          icon="reservations"
          accent="amber"
          detail="Current loaded page only"
        />
        <MetricCard
          label="Medicine units"
          value={String(metrics.quantity)}
          icon="inventory"
          accent="rose"
          detail="Current loaded page only"
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
              Reservation status
            </span>
            <select
              aria-label="Reservation status"
              value={status}
              disabled={!providerId}
              onChange={(event) => {
                setStatus(event.target.value as '' | ReservationStatus);
                setOffset(0);
              }}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b] disabled:opacity-60"
            >
              <option value="">All statuses</option>
              {RESERVATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {providersLoading ? <LoadingState label="Checking assigned providers…" /> : null}
        {!providersLoading && !error && providers.length === 0 ? (
          <WorkspaceState
            title="No active provider assignment"
            detail="Ask a tenant administrator to assign this membership to an active pharmacy or hospital."
            action="Check again"
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && error ? (
          <WorkspaceState
            title={
              error.status === 404
                ? 'Reservations are no longer available'
                : 'Reservations could not be loaded'
            }
            detail={error.message}
            action="Try again"
            onAction={() =>
              providerId ? void loadReservations(providerId, status, offset) : void loadProviders()
            }
          />
        ) : null}
        {!providersLoading && !error && loading && !page ? (
          <LoadingState label="Loading live reservations…" />
        ) : null}
        {!providersLoading && !error && !loading && page?.data.length === 0 ? (
          <WorkspaceState
            title="No reservations matched"
            detail="No accepted reservation records matched this provider and status."
            action="Refresh"
            onAction={() => providerId && void loadReservations(providerId, status, offset)}
          />
        ) : null}
        {!error && page?.data.length ? (
          <ReservationTable
            reservations={page.data}
            selectedId={selectedId}
            onSelect={(reservation) =>
              setSelectedId((current) => (current === reservation.id ? null : reservation.id))
            }
          />
        ) : null}
        {!error && page && page.total > 0 ? (
          <Pagination page={page} loading={loading} onOffset={setOffset} />
        ) : null}
      </SectionCard>

      {selected ? (
        <ReservationDetails reservation={selected} onClose={() => setSelectedId(null)} />
      ) : null}
      <p className="pb-2 text-center text-[11px] text-[#93a09c]">
        Read-only live data · No reservation lifecycle action is available in this workspace
      </p>
    </div>
  );
}

function ReservationTable({
  reservations,
  selectedId,
  onSelect,
}: {
  reservations: ProviderReservation[];
  selectedId: string | null;
  onSelect: (reservation: ProviderReservation) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-left">
        <thead>
          <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
            <th className="px-6 py-3.5">Reservation</th>
            <th className="px-4 py-3.5">Status</th>
            <th className="px-4 py-3.5">Created</th>
            <th className="px-4 py-3.5">Expires</th>
            <th className="px-4 py-3.5">Quantity</th>
            <th className="px-6 py-3.5">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf1ef]">
          {reservations.map((reservation) => (
            <tr
              key={reservation.id}
              className={selectedId === reservation.id ? 'bg-emerald-50/50' : 'hover:bg-[#fbfdfc]'}
            >
              <td className="px-6 py-4">
                <p className="font-mono text-xs font-semibold text-[#38544b]">
                  {shortId(reservation.id)}
                </p>
                <p className="mt-1 text-[11px] text-[#899792]">
                  Version {reservation.version} · {reservation.items.length} product
                  {reservation.items.length === 1 ? '' : 's'}
                </p>
              </td>
              <td className="px-4 py-4">
                <StatusBadge tone={statusTone[reservation.status]}>
                  {titleCase(reservation.status)}
                </StatusBadge>
              </td>
              <td className="px-4 py-4 text-xs text-[#536a62]">
                {formatDate(reservation.createdAt)}
              </td>
              <td className="px-4 py-4 text-xs text-[#536a62]">
                {formatDate(reservation.expiresAt)}
              </td>
              <td className="px-4 py-4 text-sm font-bold text-[#28453b]">
                {reservation.totalQuantity}
              </td>
              <td className="px-6 py-4 text-right">
                <button
                  type="button"
                  aria-expanded={selectedId === reservation.id}
                  aria-label={`View reservation ${shortId(reservation.id)} details`}
                  onClick={() => onSelect(reservation)}
                  className="rounded-lg border border-[#dce5e1] px-3 py-2 text-xs font-bold text-emerald-700"
                >
                  Details
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReservationDetails({
  reservation,
  onClose,
}: {
  reservation: ProviderReservation;
  onClose: () => void;
}) {
  return (
    <SectionCard>
      <div className="flex items-start justify-between border-b border-[#edf1ef] px-5 py-5 sm:px-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
            Read-only reservation details
          </p>
          <h2 className="mt-1 font-mono text-sm font-bold text-[#173128]">{reservation.id}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reservation details"
          className="rounded-lg p-2 text-[#71817c]"
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <div className="divide-y divide-[#edf1ef]">
        {reservation.items.map((item) => (
          <div key={item.productId} className="p-5 sm:px-6">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#1b372d]">{item.name}</h3>
                <p className="mt-1 text-xs text-[#758780]">
                  {item.genericName ?? 'Generic name unavailable'} · {item.brand}
                </p>
              </div>
              <p className="text-sm font-bold text-[#28453b]">
                {item.quantity} unit{item.quantity === 1 ? '' : 's'}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.allocations.map((allocation) => (
                <span
                  key={allocation.batchId}
                  className="rounded-lg bg-[#f0f5f3] px-3 py-2 font-mono text-[11px] text-[#536a62]"
                >
                  {allocation.batchNumber} · {allocation.quantity} · {titleCase(allocation.status)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Pagination({
  page,
  loading,
  onOffset,
}: {
  page: ProviderReservationPage;
  loading: boolean;
  onOffset: (offset: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[#edf1ef] px-5 py-4 text-xs text-[#70827b] sm:px-6">
      <p>
        {page.offset + 1}–{Math.min(page.offset + page.data.length, page.total)} of {page.total}{' '}
        reservations
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading || page.offset === 0}
          onClick={() => onOffset(Math.max(0, page.offset - PAGE_SIZE))}
          className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={loading || page.offset + page.data.length >= page.total}
          onClick={() => onOffset(page.offset + PAGE_SIZE)}
          className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="grid min-h-64 place-items-center p-8 text-sm font-semibold text-[#71817c]"
    >
      <span className="inline-flex items-center gap-2">
        <Icon name="refresh" className="size-4 animate-spin" />
        {label}
      </span>
    </div>
  );
}
function WorkspaceState({
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
    <div className="grid min-h-64 place-items-center p-8 text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf6f2] text-emerald-700">
          <Icon name="reservations" className="size-5" />
        </span>
        <h2 className="mt-4 font-[var(--font-display)] text-lg font-bold text-[#203c32]">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[#80908b]">{detail}</p>
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-sm font-bold text-emerald-700"
        >
          {action}
        </button>
      </div>
    </div>
  );
}
function reservationMetrics(items: ProviderReservation[]) {
  return items.reduce(
    (value, item) => ({
      total: value.total + 1,
      open: value.open + (item.status === 'PENDING' || item.status === 'CONFIRMED' ? 1 : 0),
      ready: value.ready + (item.status === 'READY' ? 1 : 0),
      quantity: value.quantity + item.totalQuantity,
    }),
    { total: 0, open: 0, ready: 0, quantity: 0 },
  );
}
function publicError(error: unknown, fallback: string) {
  return {
    message: error instanceof Error ? error.message : fallback,
    status: error instanceof ApiError ? error.status : undefined,
  };
}
function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}
