'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { PermissionExplanationDialog } from '@/components/permission-explanation-dialog';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/platform/primitives';
import {
  cancelPatientReservation,
  createPatientReservation,
  getPatientLiveAvailabilityStatus,
  listPatientReservations,
  recordConsent,
  requestPatientLiveAvailability,
  searchPatientMedicine,
} from '@/lib/api-client';
import { requestCurrentLocation, type BrowserCapabilityState } from '@/lib/browser-permissions';
import type {
  PatientLiveAvailabilityRequestResponse,
  PatientMedicineSearchResult,
} from '@/lib/patient-medicine-search-contract';
import type { PatientReservation } from '@/lib/patient-reservation-contract';

const CANCELLABLE_STATUSES = new Set(['PENDING', 'CONFIRMED', 'READY']);
const SEARCH_LIMIT = 20;
const PRECISE_RADIUS_KM = 10;

type LiveRequestState = 'NONE' | 'PENDING' | 'RESPONDED' | 'EXPIRED';

interface LiveCheckState {
  readonly requestId: string | null;
  readonly requestStatus: LiveRequestState;
  readonly submitting: boolean;
  readonly refreshing: boolean;
  readonly error: string | null;
}

type AvailabilityState = 'AVAILABLE' | 'UNAVAILABLE' | 'CONFIRMATION_REQUIRED' | 'UNKNOWN';
type TFunction = ReturnType<typeof useLanguage>['t'];

function resultKey(result: PatientMedicineSearchResult): string {
  return `${result.providerId}:${result.productId}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function emptyLiveCheck(): LiveCheckState {
  return {
    requestId: null,
    requestStatus: 'NONE',
    submitting: false,
    refreshing: false,
    error: null,
  };
}

/**
 * Task 0034 - Patient medicines workspace (search, live checks, reserve,
 * reservations list and cancellation).
 *
 * Ownership never comes from the client: every backend call is scoped by the
 * session access token and the backend derives patient identity from it.
 * Browser location is one-shot and only requested AFTER an explicit,
 * consent-bearing user action that explains what will happen. No coordinates
 * or search terms are stored or audited.
 *
 * Async safety: search uses an AbortController + a generation counter so an
 * older search can never overwrite a newer result; the reservation list uses
 * a generation counter so a stale refresh can never restore outdated state
 * after a create/cancel.
 */
export function PatientMedicinesWorkspace() {
  const { locale, t } = useLanguage();

  const [term, setTerm] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [precise, setPrecise] = useState<{
    latitude: number;
    longitude: number;
    radiusKm: number;
  } | null>(null);
  const [results, setResults] = useState<PatientMedicineSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [locationExplanationOpen, setLocationExplanationOpen] = useState(false);
  const [liveChecks, setLiveChecks] = useState<Record<string, LiveCheckState>>({});
  const [reserveKey, setReserveKey] = useState<string | null>(null);
  const [reserveErrorKey, setReserveErrorKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [reservations, setReservations] = useState<PatientReservation[] | null>(null);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [reservationsError, setReservationsError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const searchGeneration = useRef(0);
  const reservationGeneration = useRef(0);
  const searchAborter = useRef<AbortController | null>(null);

  const refreshReservations = useCallback(async () => {
    const generation = ++reservationGeneration.current;
    setReservationsLoading(true);
    setReservationsError(null);
    try {
      const page = await listPatientReservations({ limit: SEARCH_LIMIT, offset: 0 });
      if (generation !== reservationGeneration.current) return;
      setReservations(page.data);
    } catch {
      if (generation !== reservationGeneration.current) return;
      setReservations(null);
      setReservationsError(t('patientMedicines.reservationsError'));
    } finally {
      if (generation === reservationGeneration.current) setReservationsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshReservations();
  }, [refreshReservations]);

  async function performSearch() {
    const query = term.trim();
    if (!query || searching || locating) return;

    const hasArea = city.trim().length > 0 || state.trim().length > 0;
    if (precise && hasArea) return;

    searchAborter.current?.abort();
    const controller = new AbortController();
    searchAborter.current = controller;
    const generation = ++searchGeneration.current;

    setSearching(true);
    setSearchError(null);
    setLiveChecks({});
    setNotice(null);

    const filters = {
      q: query,
      ...(hasArea ? { city: city.trim(), state: state.trim() } : {}),
      ...(precise
        ? { latitude: precise.latitude, longitude: precise.longitude, radiusKm: precise.radiusKm }
        : {}),
      limit: SEARCH_LIMIT,
      offset: 0,
    };

    try {
      const response = await searchPatientMedicine(filters, controller.signal);
      if (generation !== searchGeneration.current) return;
      setResults(response.data);
    } catch (error) {
      if (isAbortError(error)) return;
      if (generation !== searchGeneration.current) return;
      setResults(null);
      setSearchError(t('patientMedicines.searchError'));
    } finally {
      if (generation === searchGeneration.current) setSearching(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performSearch();
  }

  async function handleUseMyLocation() {
    if (searching || locating) return;
    setLocationExplanationOpen(false);
    setLocating(true);
    setSearchError(null);
    try {
      const location = await requestCurrentLocation();
      if (location.state !== 'granted' || !location.position) {
        setSearchError(locationFailureMessage(location.state, t));
        return;
      }
      try {
        await recordConsent({
          category: 'LOCATION_USE',
          status: 'GRANTED',
          source: 'nearby_search_prompt',
        });
      } catch {
        // Browser permission is not application authorization. If the
        // explicit LOCATION_USE consent write fails, do not use the precise
        // coordinates and keep the manual city/state fallback available.
        setSearchError(t('patientMedicines.locationFailed'));
        return;
      }
      const coordinates = {
        latitude: location.position.coords.latitude,
        longitude: location.position.coords.longitude,
        radiusKm: PRECISE_RADIUS_KM,
      };
      setPrecise(coordinates);
      await searchWithPreciseLocation(term.trim(), coordinates);
    } finally {
      setLocating(false);
    }
  }

  async function searchWithPreciseLocation(
    query: string,
    coordinates: { latitude: number; longitude: number; radiusKm: number },
  ) {
    if (!query) return;
    searchAborter.current?.abort();
    const controller = new AbortController();
    searchAborter.current = controller;
    const generation = ++searchGeneration.current;

    setSearching(true);
    setSearchError(null);
    setLiveChecks({});
    setNotice(null);
    try {
      const response = await searchPatientMedicine(
        {
          q: query,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          radiusKm: coordinates.radiusKm,
          limit: SEARCH_LIMIT,
          offset: 0,
        },
        controller.signal,
      );
      if (generation !== searchGeneration.current) return;
      setResults(response.data);
    } catch (error) {
      if (isAbortError(error)) return;
      if (generation !== searchGeneration.current) return;
      setResults(null);
      setSearchError(t('patientMedicines.searchError'));
    } finally {
      if (generation === searchGeneration.current) setSearching(false);
    }
  }
  function applyLiveResolution(key: string, response: PatientLiveAvailabilityRequestResponse) {
    setResults((previous) =>
      previous
        ? previous.map((item) =>
            resultKey(item) === key
              ? {
                  ...item,
                  availability: response.availabilityState,
                  confirmationSource: response.confirmationSource,
                  confirmedAt: response.confirmedAt,
                  requestId: response.requestId,
                  requestStatus: response.requestStatus,
                  requestedAt: response.requestedAt,
                  expiresAt: response.expiresAt,
                  retryAfterAt: response.retryAfterAt,
                }
              : item,
          )
        : previous,
    );
  }

  async function handleLiveCheck(result: PatientMedicineSearchResult) {
    const key = resultKey(result);
    setLiveChecks((previous) => ({
      ...previous,
      [key]: { ...(previous[key] ?? emptyLiveCheck()), submitting: true, error: null },
    }));
    setNotice(null);
    try {
      const response = await requestPatientLiveAvailability(result.providerId, result.productId);
      applyLiveResolution(key, response);
      setLiveChecks((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] ?? emptyLiveCheck()),
          requestId: response.requestId,
          requestStatus: response.requestStatus,
          submitting: false,
          refreshing: false,
          error: null,
        },
      }));
    } catch {
      setLiveChecks((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] ?? emptyLiveCheck()),
          submitting: false,
          error: t('patientMedicines.liveCheckError'),
        },
      }));
    }
  }

  async function handleRefreshLive(key: string, requestId: string) {
    setLiveChecks((previous) => ({
      ...previous,
      [key]: { ...(previous[key] ?? emptyLiveCheck()), refreshing: true, error: null },
    }));
    try {
      const response = await getPatientLiveAvailabilityStatus(requestId);
      applyLiveResolution(key, response);
      setLiveChecks((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] ?? emptyLiveCheck()),
          requestId: response.requestId,
          requestStatus: response.requestStatus,
          submitting: false,
          refreshing: false,
          error: null,
        },
      }));
    } catch {
      setLiveChecks((previous) => ({
        ...previous,
        [key]: {
          ...(previous[key] ?? emptyLiveCheck()),
          refreshing: false,
          error: t('patientMedicines.liveCheckError'),
        },
      }));
    }
  }

  async function handleReserve(result: PatientMedicineSearchResult) {
    const key = resultKey(result);
    if (reserveKey) return;
    setReserveKey(key);
    setReserveErrorKey(null);
    setNotice(null);
    try {
      await createPatientReservation({
        providerId: result.providerId,
        items: [{ productId: result.productId, quantity: 1 }],
        idempotencyKey: crypto.randomUUID(),
      });
      setNotice({ kind: 'success', text: t('patientMedicines.reserveSuccess') });
      await refreshReservations();
    } catch {
      setReserveErrorKey(key);
    } finally {
      setReserveKey(null);
    }
  }

  async function handleCancel(reservation: PatientReservation) {
    if (cancellingId) return;
    setCancellingId(reservation.id);
    setNotice(null);
    try {
      await cancelPatientReservation(reservation.id, {
        expectedVersion: reservation.version,
        idempotencyKey: crypto.randomUUID(),
      });
      setNotice({ kind: 'success', text: t('patientMedicines.cancelSuccess') });
      await refreshReservations();
    } catch {
      setNotice({ kind: 'error', text: t('patientMedicines.cancelError') });
    } finally {
      setCancellingId(null);
    }
  }
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-.03em] text-[#10201c] sm:text-3xl">
        {t('patientMedicines.title')}
      </h1>
      <p className="mt-2 text-sm text-[#60706b]">{t('patientMedicines.subtitle')}</p>

      <section className="mt-8" aria-label={t('patientMedicines.title')}>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Input
              name="q"
              label={t('patientMedicines.searchLabel')}
              placeholder={t('patientMedicines.searchPlaceholder')}
              value={term}
              onChange={(event) => setTerm(event.currentTarget.value)}
              autoComplete="off"
              maxLength={120}
              required
            />
            <Button
              type="submit"
              loading={searching && !locating}
              loadingLabel={t('patientMedicines.searchLoading')}
            >
              {t('patientMedicines.searchSubmit')}
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-canvas-400 bg-canvas-50 p-4">
            <h2 className="text-xs font-bold text-[#173128]">
              {t('patientMedicines.locationHeading')}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Input
                name="city"
                label={t('patientMedicines.cityLabel')}
                value={city}
                onChange={(event) => {
                  setCity(event.currentTarget.value);
                  setPrecise(null);
                }}
                maxLength={120}
              />
              <Input
                name="state"
                label={t('patientMedicines.stateLabel')}
                value={state}
                onChange={(event) => {
                  setState(event.currentTarget.value);
                  setPrecise(null);
                }}
                maxLength={120}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                loading={locating}
                loadingLabel={t('common.working')}
                onClick={() => setLocationExplanationOpen(true)}
                disabled={Boolean(city.trim() || state.trim())}
              >
                {t('patientMedicines.useMyLocation')}
              </Button>
              {precise ? (
                <span className="text-xs text-[#60706b]">
                  {t('patientMedicines.withinRadius', { radius: String(precise.radiusKm) })}
                </span>
              ) : city.trim() || state.trim() ? (
                <span className="text-xs text-[#60706b]">{t('patientMedicines.allAreas')}</span>
              ) : null}
            </div>
          </div>
        </Card>
      </section>

      {searchError ? (
        <p role="alert" className="mt-5 text-sm text-red-700">
          {searchError}
        </p>
      ) : null}

      <section className="mt-8" aria-labelledby="patient-medicine-results-heading">
        <h2 id="patient-medicine-results-heading" className="text-sm font-bold text-[#173128]">
          {t('patientMedicines.resultsHeading')}
        </h2>
        {results === null && !searching && searchError === null ? (
          <EmptyState
            title={t('patientMedicines.resultsEmpty')}
            description={t('patientMedicines.subtitle')}
          />
        ) : null}
        {searching ? (
          <div aria-busy="true" className="mt-4 space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}
        {results !== null && results.length === 0 ? (
          <EmptyState title={t('patientMedicines.resultsEmpty')} />
        ) : null}
        {results !== null && results.length > 0 ? (
          <p className="mt-2 text-xs text-[#899792]">{t('patientMedicines.liveCheckExplainer')}</p>
        ) : null}
        {results ? (
          <ul className="mt-4 space-y-4">
            {results.map((result) => (
              <li
                key={resultKey(result)}
                className="flex flex-col gap-3 rounded-xl border border-canvas-400 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#10201c]">{result.name}</p>
                    <p className="mt-1 text-xs text-[#71807b]">
                      {result.brand}
                      {result.strength ? ` · ${result.strength}` : ''}
                      {result.dosageForm ? ` · ${result.dosageForm}` : ''}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#536a62]">
                      {result.providerName} · {result.providerCity}, {result.providerState}
                      {result.distanceKm !== null
                        ? ` · ${formatDistance(result.distanceKm, locale)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {availabilityBadge(result.availability, t)}
                    {result.requiresPrescription ? (
                      <Badge tone="amber">{t('patientMedicines.prescriptionRequired')}</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LiveCheckControls
                    result={result}
                    live={liveChecks[resultKey(result)] ?? emptyLiveCheck()}
                    disabled={reserveKey === resultKey(result) || searching || locating}
                    reserving={reserveKey === resultKey(result)}
                    onCheck={() => void handleLiveCheck(result)}
                    onRefresh={() => {
                      const live = liveChecks[resultKey(result)];
                      if (live?.requestId)
                        void handleRefreshLive(resultKey(result), live.requestId);
                    }}
                    onReserve={() => void handleReserve(result)}
                  />
                </div>
                {reserveErrorKey === resultKey(result) ? (
                  <p role="alert" className="text-xs text-red-700">
                    {t('patientMedicines.reserveError')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {notice ? (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mt-5 text-sm ${notice.kind === 'error' ? 'text-red-700' : 'text-emerald-700'}`}
        >
          {notice.text}
        </p>
      ) : null}
      <section className="mt-8" aria-labelledby="patient-reservations-heading">
        <h2 id="patient-reservations-heading" className="text-sm font-bold text-[#173128]">
          {t('patientMedicines.reservationsHeading')}
        </h2>
        {reservationsLoading ? (
          <div aria-busy="true" className="mt-4 space-y-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : reservationsError ? (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {reservationsError}
          </p>
        ) : reservations && reservations.length === 0 ? (
          <EmptyState title={t('patientMedicines.reservationsEmpty')} />
        ) : reservations ? (
          <ul className="mt-4 space-y-4">
            {reservations.map((reservation) => (
              <li
                key={reservation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-canvas-400 bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#10201c]">
                    {reservation.items.map((item) => item.name).join(', ')}
                  </p>
                  <p className="mt-1 text-xs text-[#71807b]">
                    {reservation.providerName} · {reservation.providerCity}
                  </p>
                  <p className="mt-1 text-xs text-[#536a62]">
                    {t('patientMedicines.expiresOn', {
                      date: formatDateTime(reservation.expiresAt, locale),
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={statusBadgeTone(reservation.status)}>
                    {statusLabel(reservation.status, t)}
                  </Badge>
                  {CANCELLABLE_STATUSES.has(reservation.status) ? (
                    <Button
                      type="button"
                      variant="danger"
                      loading={cancellingId === reservation.id}
                      loadingLabel={t('patientMedicines.cancelLoading')}
                      onClick={() => void handleCancel(reservation)}
                    >
                      {t('patientMedicines.cancelAction')}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <PermissionExplanationDialog
        kind="location"
        open={locationExplanationOpen}
        busy={locating}
        onContinue={() => void handleUseMyLocation()}
        onAlternative={() => {
          setLocationExplanationOpen(false);
          window.requestAnimationFrame(() => {
            document.querySelector<HTMLInputElement>('input[name="city"]')?.focus();
          });
        }}
      />
    </main>
  );
}
function LiveCheckControls({
  result,
  live,
  disabled,
  reserving,
  onCheck,
  onRefresh,
  onReserve,
}: {
  readonly result: PatientMedicineSearchResult;
  readonly live: LiveCheckState;
  readonly disabled: boolean;
  readonly reserving: boolean;
  readonly onCheck: () => void;
  readonly onRefresh: () => void;
  readonly onReserve: () => void;
}) {
  const { t } = useLanguage();
  const pendingRequest = live.requestId !== null && live.requestStatus === 'PENDING';
  return (
    <>
      {result.availability !== 'AVAILABLE' ? (
        pendingRequest ? (
          <>
            <Badge tone="amber">{t('patientMedicines.liveCheckPending')}</Badge>
            <Button
              type="button"
              variant="secondary"
              loading={live.refreshing}
              loadingLabel={t('common.working')}
              onClick={onRefresh}
            >
              {t('patientMedicines.liveCheckCheckStatus')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="secondary"
            loading={live.submitting}
            loadingLabel={t('common.working')}
            disabled={disabled || live.submitting}
            onClick={onCheck}
          >
            {t('patientMedicines.liveCheckAction')}
          </Button>
        )
      ) : null}
      {live.error ? (
        <p role="alert" className="text-xs text-red-700">
          {live.error}
        </p>
      ) : null}
      <Button
        type="button"
        variant={result.availability === 'AVAILABLE' ? 'primary' : 'secondary'}
        loading={reserving}
        loadingLabel={t('patientMedicines.reserveLoading')}
        disabled={disabled || reserving || result.availability !== 'AVAILABLE'}
        onClick={onReserve}
      >
        {t('patientMedicines.reserveAction')}
      </Button>
    </>
  );
}

function locationFailureMessage(state: BrowserCapabilityState, t: TFunction): string {
  if (state === 'denied') return t('patientMedicines.locationDenied');
  if (state === 'unsupported') return t('patientMedicines.locationUnavailable');
  return t('patientMedicines.locationFailed');
}

function availabilityBadge(availability: AvailabilityState, t: TFunction) {
  const tone =
    availability === 'AVAILABLE'
      ? 'emerald'
      : availability === 'CONFIRMATION_REQUIRED'
        ? 'amber'
        : 'slate';
  const label =
    availability === 'AVAILABLE'
      ? t('patientMedicines.availabilityAvailable')
      : availability === 'UNAVAILABLE'
        ? t('patientMedicines.availabilityUnavailable')
        : availability === 'CONFIRMATION_REQUIRED'
          ? t('patientMedicines.availabilityConfirmationRequired')
          : t('patientMedicines.availabilityUnknown');
  return <Badge tone={tone}>{label}</Badge>;
}

function statusLabel(status: string, t: TFunction): string {
  switch (status) {
    case 'PENDING':
      return t('patientMedicines.status.pending');
    case 'CONFIRMED':
      return t('patientMedicines.status.confirmed');
    case 'READY':
      return t('patientMedicines.status.ready');
    case 'COMPLETED':
      return t('patientMedicines.status.completed');
    case 'CANCELLED':
      return t('patientMedicines.status.cancelled');
    case 'EXPIRED':
      return t('patientMedicines.status.expired');
    default:
      return status;
  }
}

function statusBadgeTone(status: string): 'emerald' | 'amber' | 'rose' | 'slate' | 'cyan' {
  switch (status) {
    case 'PENDING':
      return 'amber';
    case 'CONFIRMED':
      return 'cyan';
    case 'READY':
      return 'emerald';
    case 'CANCELLED':
      return 'rose';
    case 'EXPIRED':
      return 'slate';
    default:
      return 'slate';
  }
}

function formatDistance(distanceKm: number, locale: string): string {
  if (distanceKm < 1) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'meter',
      unitDisplay: 'short',
      maximumFractionDigits: 0,
    }).format(distanceKm * 1000);
  }
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(distanceKm);
}

function formatDateTime(value: string, locale: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}
