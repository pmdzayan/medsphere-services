'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { useLanguage } from '@/components/language-provider';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusIndicator,
} from '@/components/platform/primitives';
import {
  ApiError,
  getAssignedProviders,
  getAuditEvents,
  getProviderExpiryWorklist,
  getProviderReservations,
  getProviderStock,
} from '@/lib/api-client';
import type { AuditEvent } from '@/lib/audit-contract';
import type {
  InventoryExpiryWorklistPage,
  InventoryStockItem,
  InventoryStockPage,
  ProviderAccess,
} from '@/lib/inventory-contract';
import type { TranslationKey, TranslationValues } from '@/lib/i18n';
import {
  RESERVATION_STATUSES,
  type ProviderReservation,
  type ProviderReservationPage,
  type ReservationStatus,
} from '@/lib/reservation-contract';
import {
  daysUntilExpiry,
  formatInventoryDate,
  loadedInventoryMetrics,
} from '../inventory/inventory-data';

const PAGE_SIZE = 10;
const EXPIRY_HORIZON_DAYS = 30;
const RECENT_ACTIVITY_LIMIT = 5;

type PublicError = { message: string; status?: number };
type Translator = (key: TranslationKey, values?: TranslationValues) => string;

const statusTone: Record<ReservationStatus, 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate'> = {
  PENDING: 'amber',
  CONFIRMED: 'cyan',
  READY: 'emerald',
  COMPLETED: 'slate',
  CANCELLED: 'rose',
  EXPIRED: 'rose',
};

export function DashboardWorkspace() {
  const { t } = useLanguage();
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
  const [expiryWorklist, setExpiryWorklist] = useState<InventoryExpiryWorklistPage | null>(null);
  const [expiryLoading, setExpiryLoading] = useState(false);
  const [expiryError, setExpiryError] = useState<PublicError | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditEvent[] | null>(null);
  const [recentActivityLoading, setRecentActivityLoading] = useState(true);
  const [recentActivityError, setRecentActivityError] = useState<PublicError | null>(null);
  const providerRequest = useRef(0);
  const stockRequest = useRef(0);
  const reservationRequest = useRef(0);
  const expiryRequest = useRef(0);
  const recentActivityRequest = useRef(0);

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
      setProviderError(toPublicError(error, t('dashboard.providersLoadFailed')));
    } finally {
      if (request === providerRequest.current) setProvidersLoading(false);
    }
  }, [t]);

  const loadStock = useCallback(
    async (selectedProvider: string) => {
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
          setStockError(toPublicError(error, t('dashboard.stockLoadFailed')));
        }
      } finally {
        if (request === stockRequest.current) setStockLoading(false);
      }
    },
    [t],
  );

  const loadReservations = useCallback(
    async (selectedProvider: string) => {
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
          setReservationsError(toPublicError(error, t('dashboard.reservationsLoadFailed')));
        }
      } finally {
        if (request === reservationRequest.current) setReservationsLoading(false);
      }
    },
    [t],
  );

  const loadExpiryWorklist = useCallback(
    async (selectedProvider: string) => {
      const request = ++expiryRequest.current;
      setExpiryLoading(true);
      setExpiryError(null);
      setExpiryWorklist(null);
      try {
        const page = await getProviderExpiryWorklist({
          providerId: selectedProvider,
          horizonDays: EXPIRY_HORIZON_DAYS,
          limit: 5,
          offset: 0,
        });
        if (request === expiryRequest.current) setExpiryWorklist(page);
      } catch (error) {
        if (request === expiryRequest.current) {
          setExpiryError(toPublicError(error, t('dashboard.expiryLoadFailed')));
        }
      } finally {
        if (request === expiryRequest.current) setExpiryLoading(false);
      }
    },
    [t],
  );

  const loadRecentActivity = useCallback(async () => {
    const request = ++recentActivityRequest.current;
    setRecentActivityLoading(true);
    setRecentActivityError(null);
    try {
      const page = await getAuditEvents({ limit: RECENT_ACTIVITY_LIMIT });
      if (request === recentActivityRequest.current) setRecentActivity(page.data);
    } catch (error) {
      if (request === recentActivityRequest.current) {
        setRecentActivity(null);
        // A 403 here means this membership lacks audit-read permission -- that
        // is an honest, expected outcome, not an error worth alarming over.
        const publicError = toPublicError(error, t('dashboard.activityLoadFailed'));
        setRecentActivityError(publicError);
      }
    } finally {
      if (request === recentActivityRequest.current) setRecentActivityLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadProviders();
    void loadRecentActivity();
    return () => {
      providerRequest.current += 1;
      recentActivityRequest.current += 1;
    };
  }, [loadProviders, loadRecentActivity]);
  useEffect(() => {
    if (!providerId) {
      stockRequest.current += 1;
      reservationRequest.current += 1;
      expiryRequest.current += 1;
      setStock(null);
      setReservations(null);
      setExpiryWorklist(null);
      setStockError(null);
      setReservationsError(null);
      setExpiryError(null);
      setStockLoading(false);
      setReservationsLoading(false);
      setExpiryLoading(false);
      return;
    }
    void loadStock(providerId);
    void loadReservations(providerId);
    void loadExpiryWorklist(providerId);
    return () => {
      stockRequest.current += 1;
      reservationRequest.current += 1;
      expiryRequest.current += 1;
    };
  }, [loadExpiryWorklist, loadReservations, loadStock, providerId]);

  const selectProvider = (nextProviderId: string) => {
    stockRequest.current += 1;
    reservationRequest.current += 1;
    expiryRequest.current += 1;
    setStock(null);
    setReservations(null);
    setExpiryWorklist(null);
    setStockError(null);
    setReservationsError(null);
    setExpiryError(null);
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
            {t('dashboard.eyebrow')}
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            {t('dashboard.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            {t('dashboard.description')}
          </p>
        </div>
        <nav aria-label={t('dashboard.workspaceNavigation')} className="flex flex-wrap gap-2.5">
          <WorkspaceLink href="/inventory" icon="inventory">
            {t('dashboard.openInventory')}
          </WorkspaceLink>
          <WorkspaceLink href="/reservations" icon="reservations">
            {t('dashboard.openReservations')}
          </WorkspaceLink>
        </nav>
      </header>

      <SectionCard>
        <div className="border-b border-[#edf1ef] bg-[#fbfcfb] p-4 sm:p-5 lg:px-6">
          <label className="block max-w-xl">
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[.14em] text-[#70827b]">
              {t('dashboard.assignedProvider')}
            </span>
            <select
              aria-label={t('dashboard.assignedProvider')}
              value={providerId}
              disabled={providersLoading || providers.length === 0}
              onChange={(event) => selectProvider(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b] disabled:opacity-60"
            >
              {providers.length === 0 ? (
                <option value="">{t('dashboard.noProvider')}</option>
              ) : null}
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.businessName} ·{' '}
                  {provider.providerType === 'PHARMACY'
                    ? t('dashboard.pharmacy')
                    : t('dashboard.hospital')}
                </option>
              ))}
            </select>
          </label>
          {selectedProvider ? (
            <p className="mt-2 text-xs text-[#7a8b85]">
              {t('dashboard.showingProvider', { provider: selectedProvider.businessName })}
            </p>
          ) : null}
        </div>
        {providersLoading ? <LoadingState label={t('dashboard.checkingProviders')} /> : null}
        {!providersLoading && providerError ? (
          <StatePanel
            title={errorTitle(providerError, t('dashboard.providersUnavailable'), t)}
            detail={providerError.message}
            action={t('dashboard.retryProvider')}
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && !providerError && providers.length === 0 ? (
          <StatePanel
            title={t('dashboard.noProvider')}
            detail={t('dashboard.noProviderDetail')}
            action={t('dashboard.checkAssignments')}
            onAction={() => void loadProviders()}
          />
        ) : null}
      </SectionCard>

      <section aria-labelledby="attention-title" className="space-y-3">
        <SectionTitle id="attention-title">{t('dashboard.needsAttention')}</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <AttentionCard
            providerSelected={Boolean(providerId)}
            loading={expiryLoading}
            error={expiryError}
            worklist={expiryWorklist}
            onRetry={() => void loadExpiryWorklist(providerId)}
          />
          <RecentActivityCard
            loading={recentActivityLoading}
            error={recentActivityError}
            events={recentActivity}
            onRetry={() => void loadRecentActivity()}
          />
        </div>
      </section>

      {providerId ? (
        <>
          <section aria-labelledby="stock-metrics-title" className="space-y-3">
            <SectionTitle id="stock-metrics-title">{t('dashboard.stockCurrentPage')}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label={t('dashboard.products')}
                value={metricValue(stock, stockMetrics.products)}
                icon="inventory"
                detail={t('dashboard.currentPage')}
              />
              <MetricCard
                label={t('dashboard.batches')}
                value={metricValue(stock, stockMetrics.batches)}
                icon="calendar"
                accent="cyan"
                detail={t('dashboard.currentPage')}
              />
              <MetricCard
                label={t('dashboard.onHandUnits')}
                value={metricValue(stock, stockMetrics.onHand)}
                icon="inventory"
                accent="amber"
                detail={t('dashboard.currentPage')}
              />
              <MetricCard
                label={t('dashboard.heldUnits')}
                value={metricValue(stock, stockMetrics.held)}
                icon="clock"
                accent="rose"
                detail={t('dashboard.currentPage')}
              />
              <MetricCard
                label={t('dashboard.availableUnits')}
                value={metricValue(stock, stockMetrics.available)}
                icon="inventory"
                detail={t('dashboard.currentPage')}
              />
            </div>
          </section>

          <section aria-labelledby="reservation-metrics-title" className="space-y-3">
            <SectionTitle id="reservation-metrics-title">
              {t('dashboard.reservationsCurrentPage')}
            </SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label={t('dashboard.reservations')}
                value={metricValue(reservations, reservationMetrics.total)}
                icon="reservations"
                detail={t('dashboard.currentPage')}
              />
              <MetricCard
                label={t('dashboard.medicineUnits')}
                value={metricValue(reservations, reservationMetrics.units)}
                icon="inventory"
                accent="cyan"
                detail={t('dashboard.currentPage')}
              />
              <MetricCard
                label={t('dashboard.pendingOrConfirmed')}
                value={metricValue(reservations, reservationMetrics.open)}
                icon="clock"
                accent="amber"
                detail={t('dashboard.currentPage')}
              />
              <MetricCard
                label={t('dashboard.ready')}
                value={metricValue(reservations, reservationMetrics.ready)}
                icon="reservations"
                accent="rose"
                detail={t('dashboard.currentPage')}
              />
            </div>
            {reservations && reservationMetrics.total > 0 ? (
              <div aria-label={t('dashboard.statusCounts')} className="flex flex-wrap gap-2">
                {RESERVATION_STATUSES.map((status) => (
                  <StatusBadge key={status} tone={statusTone[status]}>
                    {reservationStatusLabel(status, t)}: {reservationMetrics.statuses[status]}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
          </section>

          <div className="grid gap-5 2xl:grid-cols-2">
            <SectionCard>
              <PanelHeader
                title={t('dashboard.stockRecords')}
                resultCount={stock?.total}
                loading={stockLoading}
                action={t('dashboard.retryStock')}
                onAction={() => void loadStock(providerId)}
              />
              {stockLoading ? <LoadingState label={t('dashboard.loadingStock')} /> : null}
              {!stockLoading && stockError ? (
                <StatePanel
                  title={errorTitle(stockError, t('dashboard.stockUnavailable'), t)}
                  detail={stockError.message}
                  action={t('dashboard.retryStock')}
                  onAction={() => void loadStock(providerId)}
                />
              ) : null}
              {!stockLoading && !stockError && stock?.data.length === 0 ? (
                <StatePanel
                  title={t('dashboard.noStock')}
                  detail={t('dashboard.noStockDetail')}
                  action={t('dashboard.refreshStock')}
                  onAction={() => void loadStock(providerId)}
                />
              ) : null}
              {!stockLoading && !stockError && stock?.data.length ? (
                <StockTable items={stock.data} />
              ) : null}
            </SectionCard>

            <SectionCard>
              <PanelHeader
                title={t('dashboard.reservationRecords')}
                resultCount={reservations?.total}
                loading={reservationsLoading}
                action={t('dashboard.retryReservations')}
                onAction={() => void loadReservations(providerId)}
              />
              {reservationsLoading ? (
                <LoadingState label={t('dashboard.loadingReservations')} />
              ) : null}
              {!reservationsLoading && reservationsError ? (
                <StatePanel
                  title={errorTitle(reservationsError, t('dashboard.reservationsUnavailable'), t)}
                  detail={reservationsError.message}
                  action={t('dashboard.retryReservations')}
                  onAction={() => void loadReservations(providerId)}
                />
              ) : null}
              {!reservationsLoading && !reservationsError && reservations?.data.length === 0 ? (
                <StatePanel
                  title={t('dashboard.noReservations')}
                  detail={t('dashboard.noReservationsDetail')}
                  action={t('dashboard.refreshReservations')}
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
        {t('dashboard.readOnlyBoundary')}
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
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ef] px-5 py-4 sm:px-6">
      <div>
        <h2 className="font-[var(--font-display)] text-lg font-bold tracking-[-.025em] text-[#173128]">
          {title}
        </h2>
        {resultCount !== undefined ? (
          <p className="mt-1 text-xs text-[#7a8b85]">
            {t(resultCount === 1 ? 'dashboard.exactResult' : 'dashboard.exactResults', {
              count: resultCount,
            })}
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
  const { t } = useLanguage();
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
              <th className="px-5 py-3.5 sm:px-6">{t('dashboard.product')}</th>
              <th className="px-4 py-3.5">{t('dashboard.batches')}</th>
              <th className="px-4 py-3.5">{t('dashboard.onHand')}</th>
              <th className="px-4 py-3.5">{t('dashboard.held')}</th>
              <th className="px-5 py-3.5 sm:px-6">{t('dashboard.available')}</th>
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

      <ul className="divide-y divide-[#edf1ef] lg:hidden">
        {items.map((item) => (
          <li key={item.inventoryId} className="p-4 sm:p-5">
            <p className="text-sm font-bold text-[#1b372d]">{item.name}</p>
            <p className="mt-1 text-xs text-[#85938f]">
              {item.brand}
              {item.sku ? ` · ${item.sku}` : ''}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#fbfcfb] p-3 text-center sm:grid-cols-4">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  {t(item.batches.length === 1 ? 'dashboard.batch' : 'dashboard.batches')}
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-[#28453b]">{item.batches.length}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  {t('dashboard.onHand')}
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-[#28453b]">
                  {item.totalOnHandQuantity}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  {t('dashboard.held')}
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-[#28453b]">
                  {item.totalHeldQuantity}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-[#899792]">
                  {t('dashboard.available')}
                </dt>
                <dd className="mt-0.5 text-sm font-bold text-emerald-700">
                  {item.totalAvailableQuantity}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function ReservationTable({ reservations }: { reservations: ProviderReservation[] }) {
  const { t } = useLanguage();
  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
              <th className="px-5 py-3.5 sm:px-6">{t('dashboard.reservation')}</th>
              <th className="px-4 py-3.5">{t('dashboard.status')}</th>
              <th className="px-4 py-3.5">{t('dashboard.products')}</th>
              <th className="px-4 py-3.5">{t('dashboard.units')}</th>
              <th className="px-5 py-3.5 sm:px-6">{t('dashboard.created')}</th>
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
                    {reservationStatusLabel(reservation.status, t)}
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

      <ul className="divide-y divide-[#edf1ef] lg:hidden">
        {reservations.map((reservation) => (
          <li key={reservation.id} className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-xs font-semibold text-[#38544b]">
                {shortId(reservation.id)}
              </p>
              <StatusBadge tone={statusTone[reservation.status]}>
                {reservationStatusLabel(reservation.status, t)}
              </StatusBadge>
            </div>
            <p className="mt-2 text-xs text-[#536a62]">
              {t('dashboard.mobileReservationSummary', {
                products: reservation.items.length,
                units: reservation.totalQuantity,
                createdAt: formatInventoryDate(reservation.createdAt),
              })}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function AttentionCard({
  providerSelected,
  loading,
  error,
  worklist,
  onRetry,
}: {
  providerSelected: boolean;
  loading: boolean;
  error: PublicError | null;
  worklist: InventoryExpiryWorklistPage | null;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  if (!providerSelected) {
    return (
      <Card>
        <EmptyState
          title={t('dashboard.selectProvider')}
          description={t('dashboard.expirySelectDetail')}
        />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <EmptyState
          title={errorTitle(error, t('dashboard.expiryUnavailable'), t)}
          description={error.message}
          action={
            <Button variant="secondary" onClick={onRetry}>
              {t('dashboard.retry')}
            </Button>
          }
        />
      </Card>
    );
  }

  if (!worklist || worklist.total === 0) {
    return (
      <Card className="border-emerald-600/20 bg-emerald-50/40">
        <div className="flex items-start gap-3">
          <StatusIndicator tone="positive" label={t('dashboard.allClear')} />
        </div>
        <p className="mt-2 text-sm text-canvas-700">
          {t('dashboard.noExpiringBatches', { days: EXPIRY_HORIZON_DAYS })}
        </p>
      </Card>
    );
  }

  const nearest = worklist.data[0];
  const daysUntil = nearest ? daysUntilExpiry(nearest.expiryDate) : null;
  const urgent = daysUntil !== null && daysUntil <= 7;

  return (
    <Card
      className={urgent ? 'border-rose-600/25 bg-rose-50/50' : 'border-amber-600/25 bg-amber-50/40'}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusIndicator
          tone={urgent ? 'critical' : 'warning'}
          label={t(worklist.total === 1 ? 'dashboard.batchExpiring' : 'dashboard.batchesExpiring', {
            count: worklist.total,
            days: EXPIRY_HORIZON_DAYS,
          })}
        />
        <Link
          href="/inventory/expiry"
          className="text-xs font-bold text-emerald-700 hover:underline"
        >
          {t('dashboard.viewExpiry')}
        </Link>
      </div>
      <ul className="mt-4 space-y-2">
        {worklist.data.slice(0, 3).map((item) => {
          const itemDays = daysUntilExpiry(item.expiryDate);
          return (
            <li
              key={`${item.inventoryId}-${item.batchId}`}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink-900">{item.name}</p>
                <p className="truncate text-xs text-canvas-600">
                  {t('dashboard.batchNumber', {
                    batchNumber: item.batchNumber,
                    expiryDate: formatInventoryDate(item.expiryDate),
                  })}
                </p>
              </div>
              <Badge tone={itemDays !== null && itemDays <= 7 ? 'rose' : 'amber'}>
                {itemDays !== null && itemDays >= 0
                  ? t('dashboard.daysShort', { days: itemDays })
                  : t('dashboard.overdue')}
              </Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function RecentActivityCard({
  loading,
  error,
  events,
  onRetry,
}: {
  loading: boolean;
  error: PublicError | null;
  events: AuditEvent[] | null;
  onRetry: () => void;
}) {
  const { t } = useLanguage();
  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Card>
    );
  }

  if (error) {
    const permissionRestricted = error.status === 403;
    return (
      <Card>
        <EmptyState
          title={
            permissionRestricted
              ? t('dashboard.activityAuditRequired')
              : errorTitle(error, t('dashboard.activityUnavailable'), t)
          }
          description={permissionRestricted ? undefined : error.message}
          action={
            permissionRestricted ? undefined : (
              <Button variant="secondary" onClick={onRetry}>
                {t('dashboard.retry')}
              </Button>
            )
          }
        />
      </Card>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Card>
        <EmptyState
          title={t('dashboard.noActivity')}
          description={t('dashboard.noActivityDetail')}
        />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <div className="border-b border-[#edf1ef] px-5 py-4">
        <h3 className="text-sm font-extrabold uppercase tracking-[.13em] text-[#38544b]">
          {t('dashboard.recentActivity')}
        </h3>
      </div>
      <ul className="divide-y divide-[#edf1ef]">
        {events.map((event) => (
          <li key={event.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">
                {t('dashboard.eventActivity')} · <code>{event.eventType}</code>
              </p>
              <p className="mt-0.5 text-xs text-canvas-600">
                {formatInventoryDate(event.occurredAt)}
              </p>
            </div>
            <Badge tone={event.outcome === 'SUCCEEDED' ? 'emerald' : 'rose'}>
              {auditOutcomeLabel(event.outcome, t)}
            </Badge>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3">
        <Link href="/audit" className="text-xs font-bold text-emerald-700 hover:underline">
          {t('dashboard.viewAudit')}
        </Link>
      </div>
    </Card>
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
    ? { message: fallback, status: error.status }
    : { message: fallback };
}

function errorTitle(error: PublicError, fallback: string, t: Translator): string {
  if (error.status === 401) return t('dashboard.sessionVerify');
  if (error.status === 403) return t('dashboard.accessRestricted');
  return fallback;
}

function reservationStatusLabel(status: ReservationStatus, t: Translator): string {
  const keys: Record<ReservationStatus, TranslationKey> = {
    PENDING: 'dashboard.status.pending',
    CONFIRMED: 'dashboard.status.confirmed',
    READY: 'dashboard.status.ready',
    COMPLETED: 'dashboard.status.completed',
    CANCELLED: 'dashboard.status.cancelled',
    EXPIRED: 'dashboard.status.expired',
  };
  return t(keys[status]);
}

function auditOutcomeLabel(outcome: string, t: Translator): string {
  if (outcome === 'SUCCEEDED') return t('dashboard.outcome.succeeded');
  if (outcome === 'DENIED') return t('dashboard.outcome.denied');
  if (outcome === 'FAILED') return t('dashboard.outcome.failed');
  return outcome;
}

function shortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

function metricValue(page: InventoryStockPage | ProviderReservationPage | null, value: number) {
  return page ? String(value) : '—';
}
