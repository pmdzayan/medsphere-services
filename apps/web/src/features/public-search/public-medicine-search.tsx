'use client';

import { FormEvent, useState } from 'react';
import { LanguageSelector } from '@/components/language-selector';
import { useLanguage } from '@/components/language-provider';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/platform/primitives';
import { ApiError, searchPublicMedicine } from '@/lib/api-client';
import type { PublicMedicineSearchResult } from '@/lib/public-medicine-search-contract';
import { publicSearchCopy } from './public-search-copy';

type PublicError = { message: string; status?: number };

export function PublicMedicineSearch({ providerId }: { providerId: string }) {
  const { locale } = useLanguage();
  const copy = publicSearchCopy[locale];
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<PublicMedicineSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PublicError | null>(null);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = term.trim();
    if (!query || loading) return;
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex justify-end">
        <LanguageSelector />
      </div>
      <h1 className="mt-6 text-2xl font-extrabold text-[#173128] sm:text-3xl">{copy.title}</h1>
      <p className="mt-2 text-sm text-[#536a62]">{copy.description}</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label={copy.medicineName}
            name="q"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={copy.placeholder}
            autoComplete="off"
            maxLength={120}
          />
        </div>
        <Button type="submit" loading={loading} loadingLabel={copy.searching} disabled={!term.trim()}>
          {copy.search}
        </Button>
      </form>

      <div className="mt-6" aria-live="polite">
        {loading ? (
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
              <li key={result.productId}>
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

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function toPublicError(error: unknown, fallback: string): PublicError {
  if (error instanceof ApiError) return { message: error.message, status: error.status };
  return { message: fallback };
}
