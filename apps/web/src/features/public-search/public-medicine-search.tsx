'use client';

import { FormEvent, useState } from 'react';
import { LanguageSelector } from '@/components/language-selector';
import { useLanguage } from '@/components/language-provider';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/platform/primitives';
import { ApiError, searchNearbyMedicine, searchPublicMedicine } from '@/lib/api-client';
import type {
  PublicMedicineSearchResult,
  PublicNearbyMedicineSearchResult,
} from '@/lib/public-medicine-search-contract';
import { publicSearchCopy } from './public-search-copy';

type PublicError = { message: string; status?: number };

type SearchResult = PublicMedicineSearchResult | PublicNearbyMedicineSearchResult;

function hasDistance(result: SearchResult): result is PublicNearbyMedicineSearchResult {
  return 'distanceKm' in result;
}

export function PublicMedicineSearch({ providerId }: { providerId: string }) {
  const { locale, t } = useLanguage();
  const copy = publicSearchCopy[locale];

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<PublicError | null>(null);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = term.trim();
    if (!query || loading || locating) return;

    setLoading(true);
    setError(null);

    try {
      const response = await searchPublicMedicine(providerId, query);
      setResults(response.data);
      setSearchedFor(query);
    } catch (thrown) {
      setResults(null);
      setError(toPublicError(thrown, copy.unavailable));
    } finally {
      setLoading(false);
    }
  }

  async function handleNearbySearch() {
    const query = term.trim();

    if (!query || loading || locating) return;

    if (!navigator.geolocation) {
      setResults(null);
      setError({
        message: t('publicSearch.locationUnavailable'),
      });
      return;
    }

    setLocating(true);
    setError(null);

    try {
      const position = await getCurrentPosition();

      const response = await searchNearbyMedicine({
        q: query,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        radiusKm: 10,
        limit: 20,
        offset: 0,
      });

      setResults(response.data);
      setSearchedFor(query);
    } catch (thrown) {
      setResults(null);

      if (isGeolocationError(thrown)) {
        setError({
          message:
            thrown.code === 1 ? t('publicSearch.locationDenied') : t('publicSearch.locationFailed'),
        });
      } else {
        setError(toPublicError(thrown, t('publicSearch.nearbyUnavailable')));
      }
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex justify-end">
        <LanguageSelector />
      </div>

      <h1 className="mt-6 text-2xl font-extrabold text-[#173128] sm:text-3xl">{copy.title}</h1>
      <p className="mt-2 text-sm text-[#536a62]">{copy.description}</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <Input
          label={copy.medicineName}
          name="q"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={copy.placeholder}
          autoComplete="off"
          maxLength={120}
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            loading={loading}
            loadingLabel={copy.searching}
            disabled={!term.trim() || locating}
          >
            {copy.search}
          </Button>

          <Button
            type="button"
            onClick={handleNearbySearch}
            loading={locating}
            loadingLabel={t('publicSearch.findingNearby')}
            disabled={!term.trim() || loading}
          >
            {t('publicSearch.findNearMe')}
          </Button>
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {loading || locating ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <Card>
            <EmptyState
              title={error.status === 404 ? copy.pharmacyNotFound : copy.somethingWrong}
              description={error.message}
            />
          </Card>
        ) : results && results.length === 0 ? (
          <Card>
            <EmptyState
              title={copy.noMatches}
              description={searchedFor ? copy.noMatchesFor(searchedFor) : undefined}
            />
          </Card>
        ) : results ? (
          <ul className="space-y-3">
            {results.map((result) => (
              <li key={`${result.providerId}:${result.productId}`}>
                <Card>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#173128]">{result.name}</p>

                      <p className="mt-1 text-xs text-[#758780]">
                        {result.genericName ?? result.brand} · {result.strength} ·{' '}
                        {titleCase(result.dosageForm)}
                      </p>

                      <p className="mt-2 text-xs text-[#899792]">
                        {result.providerName} · {result.providerCity}, {result.providerState}
                      </p>

                      {hasDistance(result) ? (
                        <p className="mt-1 text-xs font-semibold text-[#536a62]">
                          {t('publicSearch.distanceAway', {
                            distance: formatDistance(result.distanceKm, locale),
                          })}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <Badge tone={result.availability === 'IN_STOCK' ? 'emerald' : 'slate'}>
                        {result.availability === 'IN_STOCK' ? copy.inStock : copy.outOfStock}
                      </Badge>

                      {result.requiresPrescription ? (
                        <Badge tone="amber">{copy.prescriptionRequired}</Badge>
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-[#899792]">
                    {copy.contactToReserve(result.providerName)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 60_000,
    });
  });
}

function isGeolocationError(error: unknown): error is GeolocationPositionError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'number'
  );
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

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function toPublicError(error: unknown, fallback: string): PublicError {
  if (error instanceof ApiError) {
    return {
      message: fallback,
      status: error.status,
    };
  }

  return { message: fallback };
}
