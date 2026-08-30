'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard, SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import { useLanguage } from '@/components/language-provider';
import {
  ApiError,
  createProviderReservation,
  getAssignedProviders,
  getProviderReservations,
  getProviderStock,
  transitionProviderReservation,
} from '@/lib/api-client';
import {
  isCanonicalUuid,
  type InventoryStockItem,
  type ProviderAccess,
} from '@/lib/inventory-contract';
import {
  RESERVATION_STATUSES,
  type ProviderReservation,
  type ProviderReservationPage,
  type ReservationCreationResponse,
  type ReservationStatus,
  type ReservationTransition,
  type ReservationTransitionResponse,
} from '@/lib/reservation-contract';
import type { TranslationKey, TranslationValues } from '@/lib/i18n';

const PAGE_SIZE = 25;
const statusTone: Record<ReservationStatus, 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate'> = {
  PENDING: 'amber',
  CONFIRMED: 'cyan',
  READY: 'emerald',
  COMPLETED: 'slate',
  CANCELLED: 'rose',
  EXPIRED: 'rose',
};

interface TransitionTarget {
  reservation: ProviderReservation;
  transition: ReservationTransition;
  idempotencyKey: string;
}

interface CreationDraft {
  subjectUserId: string;
  productId: string;
  quantity: string;
  expiresAt: string;
  idempotencyKey: string;
}

export function ReservationWorkspace() {
  const { locale, t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [status, setStatus] = useState<'' | ReservationStatus>('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<ProviderReservationPage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<TransitionTarget | null>(null);
  const [transitionSubmitting, setTransitionSubmitting] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionReceipt, setTransitionReceipt] = useState<ReservationTransitionResponse | null>(
    null,
  );
  const [creationDraft, setCreationDraft] = useState<CreationDraft | null>(null);
  const [creationStock, setCreationStock] = useState<InventoryStockItem[]>([]);
  const [creationLoading, setCreationLoading] = useState(false);
  const [creationSubmitting, setCreationSubmitting] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creationReceipt, setCreationReceipt] = useState<ReservationCreationResponse | null>(null);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);

  // Escape dismisses whichever dialog is open, unless a submission is in
  // flight (an in-progress mutation should not be silently abandoned by
  // an accidental key press).
  useEffect(() => {
    if (!creationDraft && !transitionTarget) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (creationDraft && !creationSubmitting) setCreationDraft(null);
      else if (transitionTarget && !transitionSubmitting) setTransitionTarget(null);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [creationDraft, creationSubmitting, transitionTarget, transitionSubmitting]);

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
      setError(publicError(loadError, t('inventory.error.providers')));
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

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
        setError(publicError(loadError, t('reservations.error.load')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => void loadProviders(), [loadProviders]);
  useEffect(() => {
    if (!providersLoading && providerId) void loadReservations(providerId, status, offset);
  }, [loadReservations, offset, providerId, providersLoading, status]);

  const metrics = useMemo(() => reservationMetrics(page?.data ?? []), [page]);
  const selected = page?.data.find((reservation) => reservation.id === selectedId) ?? null;

  function openTransition(reservation: ProviderReservation, transition: ReservationTransition) {
    setTransitionTarget({
      reservation,
      transition,
      idempotencyKey: `reservation-${transition.toLowerCase()}-${crypto.randomUUID()}`,
    });
    setTransitionError(null);
  }

  async function openCreation() {
    if (!providerId || creationLoading) return;
    setCreationLoading(true);
    setCreationError(null);
    try {
      const stock = await getProviderStock({ providerId, limit: 100, offset: 0 });
      const eligible = stock.data.filter(
        (item) => item.isVisible && item.totalAvailableQuantity > 0,
      );
      setCreationStock(eligible);
      setCreationDraft({
        subjectUserId: '',
        productId: eligible[0]?.productId ?? '',
        quantity: '1',
        expiresAt: defaultExpiryValue(),
        idempotencyKey: `reservation-create-${crypto.randomUUID()}`,
      });
    } catch (loadError) {
      setCreationError(publicError(loadError, t('reservations.error.stock')).message);
    } finally {
      setCreationLoading(false);
    }
  }

  async function submitCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creationDraft || !providerId || creationSubmitting) return;
    const selectedStock = creationStock.find(
      ({ productId }) => productId === creationDraft.productId,
    );
    const quantity = Number(creationDraft.quantity);
    const expiry = new Date(creationDraft.expiresAt);
    if (!isCanonicalUuid(creationDraft.subjectUserId.trim())) {
      setCreationError(t('reservations.error.userId'));
      return;
    }
    if (
      !selectedStock ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > selectedStock.totalAvailableQuantity
    ) {
      setCreationError(t('reservations.error.quantity'));
      return;
    }
    if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      setCreationError(t('reservations.error.expiry'));
      return;
    }
    setCreationSubmitting(true);
    setCreationError(null);
    try {
      const receipt = await createProviderReservation(providerId, {
        subjectUserId: creationDraft.subjectUserId.trim(),
        expiresAt: expiry.toISOString(),
        items: [{ productId: selectedStock.productId, quantity }],
        idempotencyKey: creationDraft.idempotencyKey,
      });
      setCreationReceipt(receipt);
      setCreationDraft(null);
      await loadReservations(providerId, status, offset);
    } catch (mutationError) {
      setCreationError(publicError(mutationError, t('reservations.error.create')).message);
    } finally {
      setCreationSubmitting(false);
    }
  }

  async function submitTransition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transitionTarget || !providerId || transitionSubmitting) return;
    setTransitionSubmitting(true);
    setTransitionError(null);
    try {
      const receipt = await transitionProviderReservation(
        providerId,
        transitionTarget.reservation.id,
        {
          transition: transitionTarget.transition,
          expectedVersion: transitionTarget.reservation.version,
          idempotencyKey: transitionTarget.idempotencyKey,
        },
      );
      setTransitionReceipt(receipt);
      setTransitionTarget(null);
      await loadReservations(providerId, status, offset);
    } catch (mutationError) {
      setTransitionError(publicError(mutationError, t('reservations.error.transition')).message);
    } finally {
      setTransitionSubmitting(false);
    }
  }

  if (!providersLoading && error?.status === 403 && providers.length === 0) {
    return (
      <WorkspaceState
        title={t('reservations.accessTitle')}
        detail={t('reservations.accessDetail')}
        action={t('inventory.expiry.retryAccess')}
        onAction={() => void loadProviders()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
            {t('reservations.eyebrow')}
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            {t('reservations.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#71817c]">
            {t('reservations.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void openCreation()}
            disabled={!providerId || creationLoading}
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {creationLoading ? t('reservations.loadingStock') : t('reservations.new')}
          </button>
          <button
            type="button"
            onClick={() => providerId && void loadReservations(providerId, status, offset)}
            disabled={!providerId || loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158] disabled:opacity-50"
          >
            <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} />{' '}
            {t('reservations.refresh')}
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('reservations.metric.total')}
          value={String(metrics.total)}
          icon="reservations"
          detail={t('inventory.metric.detail')}
        />
        <MetricCard
          label={t('reservations.metric.open')}
          value={String(metrics.open)}
          icon="clock"
          accent="cyan"
          detail={t('inventory.metric.detail')}
        />
        <MetricCard
          label={t('reservations.metric.ready')}
          value={String(metrics.ready)}
          icon="reservations"
          accent="amber"
          detail={t('inventory.metric.detail')}
        />
        <MetricCard
          label={t('reservations.metric.units')}
          value={String(metrics.quantity)}
          icon="inventory"
          accent="rose"
          detail={t('inventory.metric.detail')}
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
                setCreationDraft(null);
                setCreationStock([]);
                setCreationError(null);
              }}
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
              {t('reservations.statusFilter')}
            </span>
            <select
              aria-label={t('reservations.statusFilter')}
              value={status}
              disabled={!providerId}
              onChange={(event) => {
                setStatus(event.target.value as '' | ReservationStatus);
                setOffset(0);
              }}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b] disabled:opacity-60"
            >
              <option value="">{t('reservations.allStatuses')}</option>
              {RESERVATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {reservationStatusLabel(value, t)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {providersLoading ? <LoadingState label={t('reservations.checkingProviders')} /> : null}
        {!providersLoading && !error && providers.length === 0 ? (
          <WorkspaceState
            title={t('reservations.noActiveProvider')}
            detail={t('reservations.noActiveProviderDetail')}
            action={t('reservations.checkAgain')}
            onAction={() => void loadProviders()}
          />
        ) : null}
        {!providersLoading && error ? (
          <WorkspaceState
            title={
              error.status === 404 ? t('reservations.unavailable') : t('reservations.loadFailure')
            }
            detail={error.message}
            action={t('inventory.common.tryAgain')}
            onAction={() =>
              providerId ? void loadReservations(providerId, status, offset) : void loadProviders()
            }
          />
        ) : null}
        {!providersLoading && !error && loading && !page ? (
          <LoadingState label={t('reservations.loading')} />
        ) : null}
        {!providersLoading && !error && !loading && page?.data.length === 0 ? (
          <WorkspaceState
            title={t('reservations.empty')}
            detail={t('reservations.emptyDetail')}
            action={t('inventory.common.refresh')}
            onAction={() => providerId && void loadReservations(providerId, status, offset)}
          />
        ) : null}
        {!error && page?.data.length ? (
          <ReservationTable
            reservations={page.data}
            locale={locale}
            t={t}
            selectedId={selectedId}
            onSelect={(reservation) =>
              setSelectedId((current) => (current === reservation.id ? null : reservation.id))
            }
          />
        ) : null}
        {!error && page && page.total > 0 ? (
          <Pagination page={page} loading={loading} t={t} onOffset={setOffset} />
        ) : null}
      </SectionCard>

      {selected ? (
        <ReservationDetails
          reservation={selected}
          t={t}
          onClose={() => setSelectedId(null)}
          onTransition={openTransition}
        />
      ) : null}
      {transitionReceipt ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"
        >
          {t('reservations.transitionReceipt', {
            status: reservationStatusLabel(transitionReceipt.status, t),
            version: transitionReceipt.version,
            quantity: transitionReceipt.totalQuantity,
          })}
        </div>
      ) : null}
      {creationReceipt ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"
        >
          {t('reservations.creationReceipt', {
            reservation: shortId(creationReceipt.reservationId),
            quantity: creationReceipt.totalQuantity,
          })}
        </div>
      ) : null}
      {creationError && !creationDraft ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {creationError}
        </p>
      ) : null}
      {creationDraft ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="creation-title"
          className="fixed inset-0 z-50 grid place-items-center bg-[#0d211a]/55 p-4"
        >
          <form
            noValidate
            onSubmit={(event) => void submitCreation(event)}
            className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-emerald-700">
              {t('reservations.creation.eyebrow')}
            </p>
            <h2
              id="creation-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              {t('reservations.creation.title')}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              {t('reservations.creation.description')}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-[#536a62]">
                  {t('reservations.creation.userId')}
                </span>
                <input
                  aria-label={t('reservations.creation.userId')}
                  value={creationDraft.subjectUserId}
                  onChange={(event) =>
                    setCreationDraft(
                      (current) => current && { ...current, subjectUserId: event.target.value },
                    )
                  }
                  className="h-11 w-full rounded-xl border border-[#dce5e1] px-3 font-mono text-sm"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#536a62]">
                  {t('reservations.creation.medicine')}
                </span>
                <select
                  aria-label={t('reservations.creation.medicineAria')}
                  value={creationDraft.productId}
                  onChange={(event) =>
                    setCreationDraft(
                      (current) =>
                        current && { ...current, productId: event.target.value, quantity: '1' },
                    )
                  }
                  className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3 text-sm"
                >
                  {creationStock.length === 0 ? (
                    <option value="">{t('reservations.creation.noStock')}</option>
                  ) : null}
                  {creationStock.map((item) => (
                    <option key={item.productId} value={item.productId}>
                      {t('reservations.creation.stockOption', {
                        name: item.name,
                        quantity: item.totalAvailableQuantity,
                      })}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#536a62]">
                  {t('reservations.creation.quantity')}
                </span>
                <input
                  aria-label={t('reservations.creation.quantityAria')}
                  inputMode="numeric"
                  value={creationDraft.quantity}
                  onChange={(event) =>
                    setCreationDraft(
                      (current) => current && { ...current, quantity: event.target.value },
                    )
                  }
                  className="h-11 w-full rounded-xl border border-[#dce5e1] px-3 text-sm"
                />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1.5 block text-xs font-bold text-[#536a62]">
                  {t('reservations.creation.expires')}
                </span>
                <input
                  aria-label={t('reservations.creation.expiryAria')}
                  type="datetime-local"
                  value={creationDraft.expiresAt}
                  onChange={(event) =>
                    setCreationDraft(
                      (current) => current && { ...current, expiresAt: event.target.value },
                    )
                  }
                  className="h-11 w-full rounded-xl border border-[#dce5e1] px-3 text-sm"
                />
              </label>
            </div>
            {creationError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {creationError}
              </p>
            ) : null}
            <p className="mt-4 text-xs leading-5 text-[#758780]">
              {t('reservations.creation.boundary')}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={creationSubmitting}
                onClick={() => setCreationDraft(null)}
                className="rounded-xl border border-[#dce5e1] px-4 py-2.5 text-sm font-bold text-[#536a62] disabled:opacity-50"
              >
                {t('reservations.cancel')}
              </button>
              <button
                type="submit"
                disabled={creationSubmitting || creationStock.length === 0}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {creationSubmitting
                  ? t('reservations.creating')
                  : t('reservations.confirmCreation')}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {transitionTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transition-title"
          className="fixed inset-0 z-50 grid place-items-center bg-[#0d211a]/55 p-4"
        >
          <form
            onSubmit={(event) => void submitTransition(event)}
            className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-emerald-700">
              {t('reservations.transition.eyebrow')}
            </p>
            <h2
              id="transition-title"
              className="mt-2 font-[var(--font-display)] text-2xl font-bold text-[#17352a]"
            >
              {t('reservations.transition.title', {
                action: transitionLabel(transitionTarget.transition, t),
              })}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#647870]">
              {transitionWarning(transitionTarget.transition, t)}{' '}
              {t('reservations.transition.boundary')}
            </p>
            {transitionError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
              >
                {transitionError}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={transitionSubmitting}
                onClick={() => setTransitionTarget(null)}
                className="rounded-xl border border-[#dce5e1] px-4 py-2.5 text-sm font-bold text-[#536a62] disabled:opacity-50"
              >
                {t('reservations.cancel')}
              </button>
              <button
                type="submit"
                disabled={transitionSubmitting}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-50"
              >
                {transitionSubmitting
                  ? t('reservations.transition.applying')
                  : t('reservations.transition.confirm', {
                      action: transitionLabel(transitionTarget.transition, t),
                    })}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <p className="pb-2 text-center text-[11px] text-[#93a09c]">{t('reservations.footer')}</p>
    </div>
  );
}

function ReservationTable({
  reservations,
  locale,
  t,
  selectedId,
  onSelect,
}: {
  reservations: ProviderReservation[];
  locale: string;
  t: Translator;
  selectedId: string | null;
  onSelect: (reservation: ProviderReservation) => void;
}) {
  return (
    <>
      {/* Desktop/tablet: full table. Below lg, a stacked card list takes over
          instead of forcing horizontal scroll across 6 columns. */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[850px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#edf1ef] bg-[#fbfcfb] text-[10px] font-extrabold uppercase tracking-[.13em] text-[#8a9994]">
              <th className="px-6 py-3.5">{t('reservations.table.reservation')}</th>
              <th className="px-4 py-3.5">{t('reservations.table.status')}</th>
              <th className="px-4 py-3.5">{t('reservations.table.created')}</th>
              <th className="px-4 py-3.5">{t('reservations.table.expires')}</th>
              <th className="px-4 py-3.5">{t('reservations.table.quantity')}</th>
              <th className="px-6 py-3.5">
                <span className="sr-only">{t('reservations.table.details')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf1ef]">
            {reservations.map((reservation) => (
              <tr
                key={reservation.id}
                className={
                  selectedId === reservation.id ? 'bg-emerald-50/50' : 'hover:bg-[#fbfdfc]'
                }
              >
                <td className="px-6 py-4">
                  <p className="font-mono text-xs font-semibold text-[#38544b]">
                    {shortId(reservation.id)}
                  </p>
                  <p className="mt-1 text-[11px] text-[#899792]">
                    {t('reservations.table.versionProducts', {
                      version: reservation.version,
                      count: reservation.items.length,
                    })}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge tone={statusTone[reservation.status]}>
                    {reservationStatusLabel(reservation.status, t)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-4 text-xs text-[#536a62]">
                  {formatDate(reservation.createdAt, locale)}
                </td>
                <td className="px-4 py-4 text-xs text-[#536a62]">
                  {formatDate(reservation.expiresAt, locale)}
                </td>
                <td className="px-4 py-4 text-sm font-bold text-[#28453b]">
                  {reservation.totalQuantity}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    type="button"
                    aria-expanded={selectedId === reservation.id}
                    aria-label={t('reservations.table.viewAria', {
                      reservation: shortId(reservation.id),
                    })}
                    onClick={() => onSelect(reservation)}
                    className="rounded-lg border border-[#dce5e1] px-3 py-2 text-xs font-bold text-emerald-700"
                  >
                    {t('reservations.table.details')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-[#edf1ef] lg:hidden">
        {reservations.map((reservation) => (
          <li
            key={reservation.id}
            className={`p-4 sm:p-5 ${selectedId === reservation.id ? 'bg-emerald-50/50' : ''}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-[#38544b]">
                  {shortId(reservation.id)}
                </p>
                <p className="mt-1 text-[11px] text-[#899792]">
                  {t('reservations.table.productsUnits', {
                    count: reservation.items.length,
                    quantity: reservation.totalQuantity,
                  })}
                </p>
              </div>
              <StatusBadge tone={statusTone[reservation.status]}>
                {reservationStatusLabel(reservation.status, t)}
              </StatusBadge>
            </div>
            <p className="mt-3 text-xs text-[#536a62]">
              {t('reservations.table.timeline', {
                created: formatDate(reservation.createdAt, locale),
                expires: formatDate(reservation.expiresAt, locale),
              })}
            </p>
            <button
              type="button"
              aria-expanded={selectedId === reservation.id}
              aria-label={t('reservations.table.viewAria', {
                reservation: shortId(reservation.id),
              })}
              onClick={() => onSelect(reservation)}
              className="mt-3 w-full rounded-lg border border-[#dce5e1] px-3 py-2.5 text-xs font-bold text-emerald-700"
            >
              {t('reservations.table.view')}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function ReservationDetails({
  reservation,
  t,
  onClose,
  onTransition,
}: {
  reservation: ProviderReservation;
  t: Translator;
  onClose: () => void;
  onTransition: (reservation: ProviderReservation, transition: ReservationTransition) => void;
}) {
  const actions = transitionsFor(reservation.status);
  return (
    <SectionCard>
      <div className="flex items-start justify-between border-b border-[#edf1ef] px-5 py-5 sm:px-6">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-emerald-700">
            {t('reservations.details.eyebrow')}
          </p>
          <h2 className="mt-1 font-mono text-sm font-bold text-[#173128]">{reservation.id}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('reservations.details.close')}
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
                  {item.genericName ?? t('reservations.details.genericUnavailable')} · {item.brand}
                </p>
              </div>
              <p className="text-sm font-bold text-[#28453b]">
                {t('reservations.details.units', { quantity: item.quantity })}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.allocations.map((allocation) => (
                <span
                  key={allocation.batchId}
                  className="rounded-lg bg-[#f0f5f3] px-3 py-2 font-mono text-[11px] text-[#536a62]"
                >
                  {allocation.batchNumber} · {allocation.quantity} ·{' '}
                  {allocationStatusLabel(allocation.status, t)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {actions.length ? (
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#edf1ef] px-5 py-4 sm:px-6">
          {actions.map((transition) => (
            <button
              key={transition}
              type="button"
              onClick={() => onTransition(reservation, transition)}
              className="rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-bold text-emerald-700"
            >
              {transitionLabel(transition, t)}
            </button>
          ))}
        </div>
      ) : null}
    </SectionCard>
  );
}

function Pagination({
  page,
  loading,
  t,
  onOffset,
}: {
  page: ProviderReservationPage;
  loading: boolean;
  t: Translator;
  onOffset: (offset: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[#edf1ef] px-5 py-4 text-xs text-[#70827b] sm:px-6">
      <p>
        {t('reservations.range', {
          start: page.offset + 1,
          end: Math.min(page.offset + page.data.length, page.total),
          total: page.total,
        })}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading || page.offset === 0}
          onClick={() => onOffset(Math.max(0, page.offset - PAGE_SIZE))}
          className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
        >
          {t('inventory.common.previous')}
        </button>
        <button
          type="button"
          disabled={loading || page.offset + page.data.length >= page.total}
          onClick={() => onOffset(page.offset + PAGE_SIZE)}
          className="rounded-lg border border-[#dce5e1] px-3 py-2 font-bold disabled:opacity-40"
        >
          {t('inventory.common.next')}
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
    message: fallback,
    status: error instanceof ApiError ? error.status : undefined,
  };
}
function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function defaultExpiryValue(): string {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function transitionsFor(status: ReservationStatus): ReservationTransition[] {
  if (status === 'PENDING') return ['CONFIRM', 'CANCEL'];
  if (status === 'CONFIRMED') return ['READY', 'CANCEL'];
  if (status === 'READY') return ['COMPLETE', 'CANCEL'];
  return [];
}

type Translator = (key: TranslationKey, values?: TranslationValues) => string;

function reservationStatusLabel(status: ReservationStatus, t: Translator): string {
  return t(`reservations.status.${status.toLowerCase()}` as TranslationKey);
}

function allocationStatusLabel(status: string, t: Translator): string {
  const key = `reservations.status.${status.toLowerCase()}` as TranslationKey;
  return status === 'HELD' || status === 'CONSUMED' || status === 'RELEASED' ? t(key) : status;
}

function transitionLabel(transition: ReservationTransition, t: Translator): string {
  const keyByTransition: Record<ReservationTransition, TranslationKey> = {
    CONFIRM: 'reservations.transition.confirmAction',
    CANCEL: 'reservations.transition.cancelAction',
    READY: 'reservations.transition.readyAction',
    COMPLETE: 'reservations.transition.completeAction',
  };
  return t(keyByTransition[transition]);
}

function transitionWarning(transition: ReservationTransition, t: Translator): string {
  const keyByTransition: Record<ReservationTransition, TranslationKey> = {
    COMPLETE: 'reservations.transition.completeWarning',
    CANCEL: 'reservations.transition.cancelWarning',
    CONFIRM: 'reservations.transition.confirmWarning',
    READY: 'reservations.transition.readyWarning',
  };
  return t(keyByTransition[transition]);
}
