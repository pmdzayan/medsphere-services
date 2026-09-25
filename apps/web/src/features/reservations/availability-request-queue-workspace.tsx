'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { Icon } from '@/components/platform/icon';
import {
  ApiError,
  getAssignedProviders,
  getProviderAvailabilityRequests,
  respondProviderAvailabilityRequest,
} from '@/lib/api-client';
import type {
  AvailabilityRequestQueuePage,
  AvailabilityRequestQueueRow,
  AvailabilityResponseOutcome,
} from '@/lib/availability-request-contract';
import type { ProviderAccess } from '@/lib/inventory-contract';

const PAGE_SIZE = 25;

export function AvailabilityRequestQueueWorkspace() {
  const { locale, t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [page, setPage] = useState<AvailabilityRequestQueuePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const assigned = (await getAssignedProviders()).filter(
        (provider) => provider.providerType === 'PHARMACY' && provider.isActive,
      );
      setProviders(assigned);
      setProviderId((current) =>
        assigned.some((provider) => provider.providerId === current)
          ? current
          : (assigned[0]?.providerId ?? ''),
      );
    } catch {
      setProviders([]);
      setProviderId('');
      setError(t('reservations.availability.errorProviders'));
    }
  }, [t]);

  const loadQueue = useCallback(
    async (selectedProviderId: string) => {
      if (!selectedProviderId) {
        setPage(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        setPage(await getProviderAvailabilityRequests(selectedProviderId, PAGE_SIZE, 0));
      } catch (loadError) {
        setPage(null);
        setError(
          loadError instanceof ApiError && loadError.status === 403
            ? t('reservations.availability.errorDenied')
            : t('reservations.availability.errorLoad'),
        );
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => void loadProviders(), [loadProviders]);
  useEffect(() => void loadQueue(providerId), [loadQueue, providerId]);

  async function respond(row: AvailabilityRequestQueueRow, outcome: AvailabilityResponseOutcome) {
    if (!providerId || row.status !== 'PENDING' || respondingId) return;
    setRespondingId(row.requestId);
    setError(null);
    try {
      await respondProviderAvailabilityRequest(providerId, row.requestId, {
        outcome,
        expectedVersion: row.version,
        idempotencyKey: `availability-${outcome.toLowerCase()}-${crypto.randomUUID()}`,
        ...(outcome === 'CHECK_LATER' ? { retryAfterMinutes: 15 } : {}),
      });
      await loadQueue(providerId);
    } catch {
      setError(t('reservations.availability.errorRespond'));
    } finally {
      setRespondingId(null);
    }
  }

  return (
    <div className="mx-auto mt-6 max-w-[94rem]">
      <SectionCard>
        <div className="flex flex-col gap-4 border-b border-[#edf1ef] p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-emerald-700">
              {t('reservations.availability.eyebrow')}
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-[-.025em] text-[#10271f]">
              {t('reservations.availability.title')}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#71817c]">
              {t('reservations.availability.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label={t('reservations.availability.providerAria')}
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className="h-10 rounded-xl border border-[#dce5e1] bg-white px-3 text-sm font-semibold text-[#38544b]"
            >
              {providers.length === 0 ? (
                <option value="">{t('reservations.availability.noProvider')}</option>
              ) : null}
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.businessName}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!providerId || loading}
              onClick={() => void loadQueue(providerId)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#d8e2de] bg-white px-3 py-2 text-sm font-bold text-[#436158] disabled:opacity-50"
            >
              <Icon name="refresh" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              {t('reservations.availability.refresh')}
            </button>
          </div>
        </div>

        {error ? (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="p-8 text-center text-sm text-[#71817c]">
            {t('reservations.availability.loading')}
          </div>
        ) : page?.data.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fbfcfb] text-[11px] uppercase tracking-[.12em] text-[#70827b]">
                <tr>
                  <th className="px-5 py-3">{t('reservations.availability.tableMedicine')}</th>
                  <th className="px-5 py-3">{t('reservations.availability.tableRequested')}</th>
                  <th className="px-5 py-3">{t('reservations.availability.tableExpires')}</th>
                  <th className="px-5 py-3">{t('reservations.availability.tableStatus')}</th>
                  <th className="px-5 py-3">{t('reservations.availability.tableResponse')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {page.data.map((row) => (
                  <tr key={row.requestId}>
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#18392f]">{row.productName}</div>
                      <div className="mt-1 text-xs text-[#71817c]">
                        {[row.genericName, row.brand, row.strength, row.dosageForm]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#50665f]">
                      {new Date(row.requestedAt).toLocaleString(locale)}
                    </td>
                    <td className="px-5 py-4 text-[#50665f]">
                      {new Date(row.expiresAt).toLocaleString(locale)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        tone={
                          row.status === 'PENDING'
                            ? 'amber'
                            : row.status === 'RESPONDED'
                              ? 'emerald'
                              : 'slate'
                        }
                      >
                        {row.status}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-4">
                      {row.status === 'PENDING' ? (
                        <div className="flex flex-wrap gap-2">
                          <ResponseButton
                            label={t('reservations.availability.available')}
                            disabled={respondingId !== null}
                            onClick={() => void respond(row, 'AVAILABLE')}
                          />
                          <ResponseButton
                            label={t('reservations.availability.unavailable')}
                            disabled={respondingId !== null}
                            onClick={() => void respond(row, 'UNAVAILABLE')}
                          />
                          <ResponseButton
                            label={t('reservations.availability.checkLater')}
                            disabled={respondingId !== null}
                            onClick={() => void respond(row, 'CHECK_LATER')}
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-[#81918c]">
                          {t('reservations.availability.closed')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="font-bold text-[#29483e]">{t('reservations.availability.empty')}</p>
            <p className="mt-1 text-sm text-[#71817c]">
              {t('reservations.availability.emptyDetail')}
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function ResponseButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-[#d8e2de] bg-white px-3 py-2 text-xs font-bold text-[#36584d] disabled:opacity-50"
    >
      {label}
    </button>
  );
}
