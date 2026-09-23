'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { SectionCard, StatusBadge } from '@/components/platform/dashboard-primitives';
import { useLanguage } from '@/components/language-provider';
import { ApiError, getAssignedProviders, getPosSale, returnPosSale } from '@/lib/api-client';
import type { ProviderAccess } from '@/lib/inventory-contract';
import type { PosSaleReceipt } from '@/lib/pos-contract';
import {
  POS_RETURN_PAYMENT_METHODS,
  POS_RETURN_REASONS,
  type PosReturnPaymentMethod,
  type PosReturnReason,
  type PosReturnReceipt,
} from '@/lib/pos-return-contract';

export function PosReturnWorkspace() {
  const { t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [saleId, setSaleId] = useState('');
  const [sale, setSale] = useState<PosSaleReceipt | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasonCode, setReasonCode] = useState<PosReturnReason>('CUSTOMER_REQUEST');
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<PosReturnPaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const [commandKey, setCommandKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<PosReturnReceipt | null>(null);

  useEffect(() => {
    if (!commandKey) setCommandKey(`pos-return-${crypto.randomUUID()}`);
  }, [commandKey]);

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
    } catch (cause) {
      setError(publicMessage(cause, t('task0044.return.errorLoad')));
    }
  }, [t]);

  useEffect(() => void loadProviders(), [loadProviders]);

  const selectedLines = useMemo(() => {
    if (!sale) return [];
    return sale.lines
      .map((line) => ({ line, quantity: Number(quantities[line.saleLineId] ?? '0') }))
      .filter(
        ({ line, quantity }) =>
          Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= line.quantity,
      );
  }, [quantities, sale]);

  async function loadSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !saleId.trim() || loading) return;
    setLoading(true);
    setError('');
    setReceipt(null);
    try {
      const loaded = await getPosSale(providerId, saleId.trim());
      if (loaded.status !== 'COMPLETED') {
        throw new Error('sale-not-returnable');
      }
      setSale(loaded);
      setQuantities(Object.fromEntries(loaded.lines.map((line) => [line.saleLineId, '0'])));
    } catch (cause) {
      setSale(null);
      setQuantities({});
      setError(publicMessage(cause, t('task0044.return.errorLoad')));
    } finally {
      setLoading(false);
    }
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sale || selectedLines.length === 0 || submitting) return;
    const normalizedReason = reason.trim();
    const normalizedReference = reference.trim();
    if (
      normalizedReason.length < 1 ||
      normalizedReason.length > 500 ||
      normalizedReference.length > 80
    ) {
      setError(t('task0044.return.errorSubmit'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await returnPosSale(providerId, sale.saleId, {
        idempotencyKey: commandKey,
        reasonCode,
        reason: normalizedReason,
        refundMethod,
        ...(normalizedReference ? { refundExternalReference: normalizedReference } : {}),
        lines: selectedLines.map(({ line, quantity }) => ({
          saleLineId: line.saleLineId,
          quantity,
        })),
      });
      setReceipt(result);
      setReason('');
      setReference('');
      setCommandKey(`pos-return-${crypto.randomUUID()}`);
      setQuantities(Object.fromEntries(sale.lines.map((line) => [line.saleLineId, '0'])));
    } catch (cause) {
      setError(publicMessage(cause, t('task0044.return.errorSubmit')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      className="mx-auto mt-6 max-w-[94rem] space-y-4"
      aria-labelledby="task-0044-return-title"
    >
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-violet-700">
          {t('task0044.return.eyebrow')}
        </p>
        <h2
          id="task-0044-return-title"
          className="mt-2 font-[var(--font-display)] text-2xl font-bold tracking-[-.035em] text-[#10271f]"
        >
          {t('task0044.return.title')}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71817c]">
          {t('task0044.return.description')}
        </p>
      </header>

      {error ? <StatusBadge tone="rose">{error}</StatusBadge> : null}
      {receipt ? (
        <StatusBadge tone="emerald">
          {t('task0044.return.success', { amount: receipt.refundTotal })}
        </StatusBadge>
      ) : null}

      <SectionCard>
        <form
          onSubmit={loadSale}
          className="grid gap-3 p-5 md:grid-cols-[minmax(14rem,22rem)_1fr_auto] md:items-end"
        >
          <label className="text-sm font-semibold text-[#38544b]">
            <span className="mb-1.5 block">{t('task0044.return.provider')}</span>
            <select
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                setSale(null);
                setReceipt(null);
              }}
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
            <span className="mb-1.5 block">{t('task0044.return.saleId')}</span>
            <input
              value={saleId}
              onChange={(event) => setSaleId(event.target.value)}
              className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
            />
          </label>
          <button
            type="submit"
            disabled={!providerId || loading}
            className="h-11 rounded-xl bg-[#0b5f4b] px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? t('task0044.return.loading') : t('task0044.return.load')}
          </button>
        </form>
      </SectionCard>

      <SectionCard>
        <form onSubmit={submitReturn} className="space-y-5 p-5">
          <h3 className="font-bold text-[#173c31]">{t('task0044.return.lines')}</h3>
          {!sale ? (
            <p className="text-sm text-[#71817c]">{t('task0044.return.none')}</p>
          ) : (
            <div className="space-y-2">
              {sale.lines.map((line) => (
                <div
                  key={line.saleLineId}
                  className="grid gap-3 rounded-xl border border-[#e3ebe7] p-3 md:grid-cols-[1fr_9rem] md:items-center"
                >
                  <div>
                    <p className="font-semibold text-[#173c31]">{line.productNameSnapshot}</p>
                    <p className="text-xs text-[#71817c]">
                      {line.brandSnapshot} · {line.strengthSnapshot} · {line.quantity}
                    </p>
                  </div>
                  <label className="text-xs font-semibold text-[#38544b]">
                    <span className="mb-1 block">{t('task0044.return.quantity')}</span>
                    <input
                      type="number"
                      min={0}
                      max={line.quantity}
                      value={quantities[line.saleLineId] ?? '0'}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [line.saleLineId]: event.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-[#dce5e1] px-2"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.return.reasonCode')}</span>
              <select
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value as PosReturnReason)}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
              >
                {POS_RETURN_REASONS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'CUSTOMER_REQUEST'
                      ? t('task0044.return.reason.customer')
                      : value === 'WRONG_ITEM'
                        ? t('task0044.return.reason.wrong')
                        : value === 'DAMAGED_PACKAGE'
                          ? t('task0044.return.reason.damage')
                          : value === 'PRODUCT_DEFECT'
                            ? t('task0044.return.reason.defect')
                            : t('task0044.return.reason.other')}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-[#38544b]">
              <span className="mb-1.5 block">{t('task0044.return.refundMethod')}</span>
              <select
                value={refundMethod}
                onChange={(event) => setRefundMethod(event.target.value as PosReturnPaymentMethod)}
                className="h-11 w-full rounded-xl border border-[#dce5e1] bg-white px-3"
              >
                {POS_RETURN_PAYMENT_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {value === 'CASH'
                      ? t('task0044.return.cash')
                      : value === 'CARD'
                        ? t('task0044.return.card')
                        : value === 'UPI'
                          ? t('task0044.return.upi')
                          : t('task0044.return.other')}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-[#38544b]">
            <span className="mb-1.5 block">{t('task0044.return.reason')}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              className="min-h-24 w-full rounded-xl border border-[#dce5e1] p-3"
            />
          </label>
          <label className="block text-sm font-semibold text-[#38544b]">
            <span className="mb-1.5 block">{t('task0044.return.reference')}</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={80}
              className="h-11 w-full rounded-xl border border-[#dce5e1] px-3"
            />
          </label>
          <button
            type="submit"
            disabled={!sale || selectedLines.length === 0 || submitting}
            className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? t('task0044.return.submitting') : t('task0044.return.submit')}
          </button>
        </form>
      </SectionCard>
    </section>
  );
}

function publicMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}
