'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { useLanguage } from '@/components/language-provider';
import {
  ApiError,
  decideInventoryException,
  getAssignedProviders,
  getProviderStock,
  recallInventoryBatch,
  requestInventoryException,
} from '@/lib/api-client';
import type { InventoryBatchStock, ProviderAccess } from '@/lib/inventory-contract';
import {
  BATCH_RECALL_REASONS,
  INVENTORY_EXCEPTION_ACTIONS,
  type BatchRecallReason,
  type InventoryExceptionAction,
} from '@/lib/inventory-exception-contract';

interface BatchOption {
  batch: InventoryBatchStock;
  medicineName: string;
}

const RECALL_REASON_KEYS: Record<BatchRecallReason, Parameters<ReturnType<typeof useLanguage>['t']>[0]> = {
  MANUFACTURER_RECALL: 'task0044.inventory.reason.manufacturer',
  REGULATORY_RECALL: 'task0044.inventory.reason.regulatory',
  QUALITY_ALERT: 'task0044.inventory.reason.quality',
  OTHER: 'task0044.inventory.reason.other',
};

export function InventoryExceptionWorkspace() {
  const { t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [batchId, setBatchId] = useState('');
  const [loading, setLoading] = useState(true);
  const [mutation, setMutation] = useState<'recall' | 'request' | 'decision' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [recallReasonCode, setRecallReasonCode] = useState<BatchRecallReason>('MANUFACTURER_RECALL');
  const [recallReason, setRecallReason] = useState('');
  const [recallKey, setRecallKey] = useState('');

  const [action, setAction] = useState<InventoryExceptionAction>('QUARANTINE_RELEASE');
  const [quantity, setQuantity] = useState('1');
  const [requestReason, setRequestReason] = useState('');
  const [requestKey, setRequestKey] = useState('');

  const [requestId, setRequestId] = useState('');
  const [outcome, setOutcome] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [decisionReason, setDecisionReason] = useState('');
  const [decisionKey, setDecisionKey] = useState('');

  const selected = useMemo(
    () => batches.find((entry) => entry.batch.id === batchId) ?? null,
    [batchId, batches],
  );

  const resetKeys = useCallback(() => {
    if (!recallKey) setRecallKey(`batch-recall-${crypto.randomUUID()}`);
    if (!requestKey) setRequestKey(`inventory-exception-${crypto.randomUUID()}`);
    if (!decisionKey) setDecisionKey(`inventory-decision-${crypto.randomUUID()}`);
  }, [decisionKey, recallKey, requestKey]);

  const loadProviders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const assigned = await getAssignedProviders();
      setProviders(assigned);
      setProviderId((current) =>
        assigned.some((provider) => provider.providerId === current)
          ? current
          : (assigned[0]?.providerId ?? ''),
      );
    } catch (cause) {
      setProviders([]);
      setProviderId('');
      setError(publicMessage(cause, t('task0044.inventory.errorLoad')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadBatches = useCallback(
    async (selectedProvider: string) => {
      if (!selectedProvider) {
        setBatches([]);
        setBatchId('');
        return;
      }
      setLoading(true);
      setError('');
      try {
        const first = await getProviderStock({ providerId: selectedProvider, limit: 100, offset: 0 });
        const pages = [first];
        let offset = first.data.length;
        while (offset < first.total && pages.length < 5) {
          const page = await getProviderStock({ providerId: selectedProvider, limit: 100, offset });
          pages.push(page);
          if (page.data.length === 0) break;
          offset += page.data.length;
        }
        const options = pages.flatMap((page) =>
          page.data.flatMap((item) =>
            item.batches.map((batch) => ({
              batch,
              medicineName: [item.name, item.brand].filter(Boolean).join(' · '),
            })),
          ),
        );
        setBatches(options);
        setBatchId((current) =>
          options.some((entry) => entry.batch.id === current) ? current : (options[0]?.batch.id ?? ''),
        );
      } catch (cause) {
        setBatches([]);
        setBatchId('');
        setError(publicMessage(cause, t('task0044.inventory.errorLoad')));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => void loadProviders(), [loadProviders]);
  useEffect(() => {
    resetKeys();
    if (providerId) void loadBatches(providerId);
  }, [loadBatches, providerId, resetKeys]);

  async function submitRecall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !selected || mutation) return;
    const reason = recallReason.trim();
    if (reason.length < 1 || reason.length > 500) {
      setError(t('task0044.inventory.errorRecall'));
      return;
    }
    setMutation('recall');
    setError('');
    setNotice('');
    try {
      await recallInventoryBatch(providerId, selected.batch.id, {
        expectedVersion: selected.batch.version,
        idempotencyKey: recallKey,
        reasonCode: recallReasonCode,
        reason,
      });
      setNotice(t('task0044.inventory.successRecall'));
      setRecallReason('');
      setRecallKey(`batch-recall-${crypto.randomUUID()}`);
      await loadBatches(providerId);
    } catch (cause) {
      setError(publicMessage(cause, t('task0044.inventory.errorRecall')));
    } finally {
      setMutation(null);
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !selected || mutation) return;
    const reason = requestReason.trim();
    const parsedQuantity = Number(quantity);
    if (
      reason.length < 1 ||
      reason.length > 500 ||
      (action !== 'QUARANTINE_RELEASE' &&
        (!Number.isSafeInteger(parsedQuantity) ||
          parsedQuantity < 1 ||
          parsedQuantity > selected.batch.onHandQuantity))
    ) {
      setError(t('task0044.inventory.errorRequest'));
      return;
    }
    setMutation('request');
    setError('');
    setNotice('');
    try {
      const receipt = await requestInventoryException(providerId, {
        batchId: selected.batch.id,
        expectedVersion: selected.batch.version,
        action,
        ...(action === 'QUARANTINE_RELEASE' ? {} : { quantity: parsedQuantity }),
        idempotencyKey: requestKey,
        reason,
      });
      setRequestId(receipt.requestId);
      setNotice(t('task0044.inventory.successRequest', { requestId: receipt.requestId }));
      setRequestReason('');
      setRequestKey(`inventory-exception-${crypto.randomUUID()}`);
    } catch (cause) {
      setError(publicMessage(cause, t('task0044.inventory.errorRequest')));
    } finally {
      setMutation(null);
    }
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || mutation) return;
    const reason = decisionReason.trim();
    const normalizedRequestId = requestId.trim();
    if (normalizedRequestId.length === 0 || reason.length < 1 || reason.length > 500) {
      setError(t('task0044.inventory.errorDecision'));
      return;
    }
    setMutation('decision');
    setError('');
    setNotice('');
    try {
      const receipt = await decideInventoryException(providerId, normalizedRequestId, {
        outcome,
        idempotencyKey: decisionKey,
        reason,
      });
      setNotice(t('task0044.inventory.successDecision', { outcome: receipt.outcome }));
      setDecisionReason('');
      setDecisionKey(`inventory-decision-${crypto.randomUUID()}`);
      await loadBatches(providerId);
    } catch (cause) {
      setError(publicMessage(cause, t('task0044.inventory.errorDecision')));
    } finally {
      setMutation(null);
    }
  }

  const recallSubmitting = mutation === 'recall';
  const requestSubmitting = mutation === 'request';
  const decisionSubmitting = mutation === 'decision';

  return (
    <section className="mx-auto mt-6 max-w-[94rem] space-y-4" aria-labelledby="task-0044-inventory-title">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-rose-700">
          {t('task0044.inventory.eyebrow')}
        </p>
        <h2
          id="task-0044-inventory-title"
          className="mt-2 font-[var(--font-display)] text-2xl font-bold tracking-[-.035em] text-[#10271f]"
        >
          {t('task0044.inventory.title')}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71817c]">
          {t('task0044.inventory.description')}
        </p>
      </header>

      {error ? <StatusBadge tone="rose">{error}</StatusBadge> : null}
      {notice ? <StatusBadge tone="emerald">{notice}</StatusBadge> : null}

      <SectionCard>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <label className="text-sm font-semibold text-[#38544b]">
            <span className="mb-1.5 block">{t('task0044.inventory.provider')}</span>
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              disabled={loading}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
            >
              {providers.map((provider) => (
                <option key={provider.providerId} value={provider.providerId}>
                  {provider.businessName}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-[#38544b]">
            <span className="mb-1.5 block">{t('task0044.inventory.batch')}</span>
            <select
              value={batchId}
              onChange={(event) => setBatchId(event.target.value)}
              disabled={loading || batches.length === 0}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
            >
              {batches.length === 0 ? (
                <option value="">
                  {loading
                    ? t('task0044.inventory.loading')
                    : t('task0044.inventory.noBatches')}
                </option>
              ) : null}
              {batches.map(({ batch, medicineName }) => (
                <option key={batch.id} value={batch.id}>
                  {medicineName} · {batch.batchNumber} · {batch.status} · {batch.onHandQuantity}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard>
          <form onSubmit={submitRecall} className="space-y-3 p-5">
            <h3 className="font-bold text-[#173c31]">{t('task0044.inventory.recallTitle')}</h3>
            <label className="block text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.inventory.recallReasonCode')}</span>
              <select
                value={recallReasonCode}
                onChange={(event) => setRecallReasonCode(event.target.value as BatchRecallReason)}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
              >
                {BATCH_RECALL_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {t(RECALL_REASON_KEYS[reason])}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.inventory.recallReason')}</span>
              <textarea
                value={recallReason}
                onChange={(event) => setRecallReason(event.target.value)}
                maxLength={500}
                className="min-h-24 w-full rounded-xl border border-[#dce5e1] p-3"
              />
            </label>
            <button
              type="submit"
              disabled={!selected || mutation !== null}
              className="w-full rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {recallSubmitting
                ? t('task0044.inventory.recallSubmitting')
                : t('task0044.inventory.recallSubmit')}
            </button>
          </form>
        </SectionCard>

        <SectionCard>
          <form onSubmit={submitRequest} className="space-y-3 p-5">
            <h3 className="font-bold text-[#173c31]">{t('task0044.inventory.requestTitle')}</h3>
            <label className="block text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.inventory.action')}</span>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as InventoryExceptionAction)}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
              >
                {INVENTORY_EXCEPTION_ACTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'QUARANTINE_RELEASE'
                      ? t('task0044.inventory.release')
                      : value === 'DISPOSAL'
                        ? t('task0044.inventory.disposal')
                        : t('task0044.inventory.supplierReturn')}
                  </option>
                ))}
              </select>
            </label>
            {action !== 'QUARANTINE_RELEASE' ? (
              <label className="block text-sm font-semibold text-[#38544b]">
                <span className="mb-1.5 block">{t('task0044.inventory.quantity')}</span>
                <input
                  type="number"
                  min={1}
                  max={selected?.batch.onHandQuantity ?? 1}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
                />
              </label>
            ) : null}
            <label className="block text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.inventory.requestReason')}</span>
              <textarea
                value={requestReason}
                onChange={(event) => setRequestReason(event.target.value)}
                maxLength={500}
                className="min-h-24 w-full rounded-xl border border-[#dce5e1] p-3"
              />
            </label>
            <button
              type="submit"
              disabled={!selected || mutation !== null}
              className="w-full rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {requestSubmitting
                ? t('task0044.inventory.requestSubmitting')
                : t('task0044.inventory.requestSubmit')}
            </button>
          </form>
        </SectionCard>

        <SectionCard>
          <form onSubmit={submitDecision} className="space-y-3 p-5">
            <h3 className="font-bold text-[#173c31]">{t('task0044.inventory.decisionTitle')}</h3>
            <p className="text-xs leading-5 text-[#71817c]">{t('task0044.inventory.decisionHelp')}</p>
            <label className="block text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.inventory.requestId')}</span>
              <input
                value={requestId}
                onChange={(event) => setRequestId(event.target.value)}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
              />
            </label>
            <label className="block text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.inventory.outcome')}</span>
              <select
                value={outcome}
                onChange={(event) => setOutcome(event.target.value as 'APPROVED' | 'REJECTED')}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
              >
                <option value="APPROVED">{t('task0044.inventory.approve')}</option>
                <option value="REJECTED">{t('task0044.inventory.reject')}</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.inventory.decisionReason')}</span>
              <textarea
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                maxLength={500}
                className="min-h-24 w-full rounded-xl border border-[#dce5e1] p-3"
              />
            </label>
            <button
              type="submit"
              disabled={mutation !== null}
              className="w-full rounded-xl bg-[#0b5f4b] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {decisionSubmitting
                ? t('task0044.inventory.decisionSubmitting')
                : t('task0044.inventory.decisionSubmit')}
            </button>
          </form>
        </SectionCard>
      </div>
    </section>
  );
}

function publicMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
