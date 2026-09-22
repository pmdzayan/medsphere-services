'use client';

import { BrowserMultiFormatReader } from '@zxing/browser';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLanguage } from '@/components/language-provider';
import { PermissionExplanationDialog } from '@/components/permission-explanation-dialog';
import { Badge, Button, Card, EmptyState, Input } from '@/components/platform/primitives';
import {
  applyInventoryImport,
  getAssignedProviders,
  searchInventoryCatalog,
  stageInventoryImport,
} from '@/lib/api-client';
import { startCameraScan, type CameraSession } from '@/lib/browser-permissions';
import type {
  InventoryCatalogProduct,
  InventoryImportApplyReceipt,
  InventoryImportField,
  InventoryImportPreview,
} from '@/lib/inventory-import-contract';
import { INVENTORY_IMPORT_FIELDS } from '@/lib/inventory-import-contract';
import type { ProviderAccess } from '@/lib/inventory-contract';
import type { TranslationKey } from '@/lib/i18n';

import {
  assertMapping,
  buildInventoryImportRows,
  parseInventoryImportFile,
  type ParsedInventoryImportFile,
} from './inventory-import-file';

type ScannerControls = { stop: () => void | Promise<void> };

const FIELD_LABEL_KEYS: Readonly<Record<InventoryImportField, TranslationKey>> = {
  productId: 'inventory.import.field.productId',
  identifier: 'inventory.import.field.identifier',
  productName: 'inventory.import.field.productName',
  brand: 'inventory.import.field.brand',
  manufacturer: 'inventory.import.field.manufacturer',
  strength: 'inventory.import.field.strength',
  dosageForm: 'inventory.import.field.dosageForm',
  sku: 'inventory.import.field.sku',
  sellingPrice: 'inventory.import.field.sellingPrice',
  mrp: 'inventory.import.field.mrp',
  discountPercentage: 'inventory.import.field.discountPercentage',
  taxPercentage: 'inventory.import.field.taxPercentage',
  minimumStockLevel: 'inventory.import.field.minimumStockLevel',
  isVisible: 'inventory.import.field.isVisible',
  batchNumber: 'inventory.import.field.batchNumber',
  manufacturingDate: 'inventory.import.field.manufacturingDate',
  expiryDate: 'inventory.import.field.expiryDate',
  quantity: 'inventory.import.field.quantity',
  purchasePrice: 'inventory.import.field.purchasePrice',
};

export function InventoryImportWorkspace() {
  const { t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providerError, setProviderError] = useState<string | null>(null);

  const [manualQuery, setManualQuery] = useState('');
  const [barcode, setBarcode] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<InventoryCatalogProduct[]>([]);

  const [cameraPromptOpen, setCameraPromptOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraSessionRef = useRef<CameraSession | null>(null);
  const scannerControlsRef = useRef<ScannerControls | null>(null);

  const [parsedFile, setParsedFile] = useState<ParsedInventoryImportFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, InventoryImportField>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [stageLoading, setStageLoading] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  const [preview, setPreview] = useState<InventoryImportPreview | null>(null);
  const [stageIdempotencyKey, setStageIdempotencyKey] = useState('');
  const [applyIdempotencyKey, setApplyIdempotencyKey] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<InventoryImportApplyReceipt | null>(null);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    setProviderError(null);
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
      setProviderError(t('inventory.error.providers'));
    } finally {
      setProvidersLoading(false);
    }
  }, [t]);

  useEffect(() => void loadProviders(), [loadProviders]);
  useEffect(
    () => () => {
      void stopCamera();
    },
    [],
  );

  async function runCatalogLookup(mode: 'MANUAL' | 'IDENTIFIER', value: string) {
    if (!providerId || catalogLoading) return;
    const normalized = value.trim();
    if ((mode === 'MANUAL' && normalized.length < 2) || !normalized) return;

    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await searchInventoryCatalog(
        providerId,
        mode === 'IDENTIFIER' ? { identifier: normalized } : { query: normalized, limit: 20 },
      );
      setCatalogProducts(response.data);
      if (response.data.length === 0) setCatalogError(t('inventory.import.noProduct'));
    } catch (error) {
      setCatalogProducts([]);
      setCatalogError(publicMessage(error, t('inventory.import.noProduct')));
    } finally {
      setCatalogLoading(false);
    }
  }

  function submitManualSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCatalogLookup('MANUAL', manualQuery);
  }

  function submitBarcodeSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runCatalogLookup('IDENTIFIER', barcode);
  }

  async function beginCamera() {
    if (cameraBusy || cameraActive) return;
    setCameraBusy(true);
    setCameraError(null);

    try {
      const capability = await startCameraScan();
      if (capability.state !== 'granted' || !capability.session || !videoRef.current) {
        capability.session?.stop();
        setCameraError(t('inventory.import.cameraError'));
        return;
      }

      cameraSessionRef.current = capability.session;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromStream(
        capability.session.stream,
        videoRef.current,
        (result) => {
          if (!result) return;
          const text = result.getText().trim();
          if (!text) return;
          setBarcode(text);
          setCameraError(null);
          void stopCamera();
          void runCatalogLookup('IDENTIFIER', text);
        },
      );
      scannerControlsRef.current = controls;
      setCameraActive(true);
    } catch {
      cameraSessionRef.current?.stop();
      cameraSessionRef.current = null;
      setCameraError(t('inventory.import.cameraError'));
    } finally {
      setCameraBusy(false);
      setCameraPromptOpen(false);
    }
  }

  async function stopCamera() {
    const controls = scannerControlsRef.current;
    scannerControlsRef.current = null;
    cameraSessionRef.current?.stop();
    cameraSessionRef.current = null;
    setCameraActive(false);
    if (controls) await controls.stop();
  }

  async function selectFile(file: File | null) {
    setParsedFile(null);
    setMapping({});
    setPreview(null);
    setReceipt(null);
    setStageError(null);
    setApplyError(null);
    setFileError(null);
    setStageIdempotencyKey('');
    setApplyIdempotencyKey('');
    if (!file) return;

    try {
      const parsed = await parseInventoryImportFile(file);
      setParsedFile(parsed);
      setMapping(parsed.suggestedMapping);
    } catch {
      setFileError(t('inventory.import.fileError'));
    }
  }

  const mappedRows = useMemo(() => {
    if (!parsedFile) return [];
    try {
      return buildInventoryImportRows(parsedFile, mapping);
    } catch {
      return [];
    }
  }, [mapping, parsedFile]);

  function changeMapping(header: string, target: string) {
    setPreview(null);
    setReceipt(null);
    setStageError(null);
    setApplyError(null);
    setStageIdempotencyKey('');
    setApplyIdempotencyKey('');
    setMapping((current) => {
      const next = { ...current };
      if (!target) {
        delete next[header];
        return next;
      }
      for (const [source, existingTarget] of Object.entries(next)) {
        if (source !== header && existingTarget === target) delete next[source];
      }
      next[header] = target as InventoryImportField;
      return next;
    });
  }

  async function stageImport() {
    if (!providerId || !parsedFile || stageLoading) return;
    setStageError(null);
    setApplyError(null);
    setReceipt(null);

    try {
      assertMapping(parsedFile.headers, mapping);
      const rows = buildInventoryImportRows(parsedFile, mapping);
      if (rows.length < 1) throw new Error('inventory-import-empty');

      const key = stageIdempotencyKey || `inventory-import-stage-${crypto.randomUUID()}`;
      setStageIdempotencyKey(key);
      const staged = await stageInventoryImport(providerId, {
        sourceFormat: parsedFile.sourceFormat,
        sourceFileName: parsedFile.sourceFileName,
        contentHash: parsedFile.contentHash,
        stageIdempotencyKey: key,
        mapping,
        rows,
      });
      setPreview(staged);
      setApplyIdempotencyKey(`inventory-import-apply-${crypto.randomUUID()}`);
    } catch (error) {
      setPreview(null);
      setStageError(publicMessage(error, t('inventory.import.stageError')));
    } finally {
      setStageLoading(false);
    }
  }

  async function applyImport() {
    if (
      !providerId ||
      !preview ||
      preview.status !== 'STAGED' ||
      preview.invalidRowCount !== 0 ||
      !applyIdempotencyKey ||
      applyLoading
    ) {
      return;
    }

    setApplyLoading(true);
    setApplyError(null);
    try {
      const applied = await applyInventoryImport(providerId, preview.importJobId, {
        idempotencyKey: applyIdempotencyKey,
      });
      setReceipt(applied);
      setPreview((current) =>
        current
          ? {
              ...current,
              status: 'APPLIED',
              appliedAt: new Date().toISOString(),
              rows: current.rows.map((row) => ({ ...row, status: 'APPLIED' })),
            }
          : current,
      );
    } catch (error) {
      setApplyError(publicMessage(error, t('inventory.import.applyError')));
    } finally {
      setApplyLoading(false);
    }
  }

  const selectedProvider = providers.find((provider) => provider.providerId === providerId);

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
            {t('inventory.import.eyebrow')}
          </p>
          <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
            {t('inventory.import.title')}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71817c]">
            {t('inventory.import.description')}
          </p>
        </div>
        <Link
          href="/inventory"
          className="inline-flex w-fit items-center rounded-xl border border-[#d8e2de] bg-white px-4 py-2.5 text-sm font-bold text-[#436158]"
        >
          {t('inventory.import.back')}
        </Link>
      </header>

      <Card>
        <label className="block max-w-xl">
          <span className="mb-2 block text-xs font-bold text-canvas-700">
            {t('inventory.import.provider')}
          </span>
          <select
            value={providerId}
            disabled={providersLoading || providers.length === 0}
            onChange={(event) => {
              setProviderId(event.target.value);
              setCatalogProducts([]);
              setCatalogError(null);
              setPreview(null);
              setReceipt(null);
            }}
            className="organization-theme-focus h-11 w-full rounded-xl border border-ink-900/[.11] bg-white px-3 text-sm font-semibold text-ink-900 disabled:opacity-60"
          >
            {providers.length === 0 ? (
              <option value="">{t('inventory.common.noProvider')}</option>
            ) : null}
            {providers.map((provider) => (
              <option key={provider.providerId} value={provider.providerId}>
                {provider.businessName}
              </option>
            ))}
          </select>
        </label>
        {providerError ? <p className="mt-3 text-sm text-rose-700">{providerError}</p> : null}
        {!providersLoading && !providerError && providers.length === 0 ? (
          <p className="mt-3 text-sm text-[#71817c]">{t('inventory.noActiveProviderDetail')}</p>
        ) : null}
        {selectedProvider ? (
          <p className="mt-3 text-xs font-semibold text-[#71817c]">{selectedProvider.businessName}</p>
        ) : null}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-[#173128]">{t('inventory.import.catalogTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-[#60736c]">
            {t('inventory.import.catalogHelp')}
          </p>

          <form onSubmit={submitManualSearch} className="mt-5 space-y-3">
            <Input
              name="inventory-import-manual-search"
              label={t('inventory.import.manualLabel')}
              placeholder={t('inventory.import.manualPlaceholder')}
              value={manualQuery}
              maxLength={120}
              onChange={(event) => setManualQuery(event.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              loading={catalogLoading}
              disabled={!providerId || manualQuery.trim().length < 2}
            >
              {t('inventory.import.lookup')}
            </Button>
          </form>

          <form onSubmit={submitBarcodeSearch} className="mt-6 space-y-3">
            <Input
              name="inventory-import-barcode"
              label={t('inventory.import.barcodeLabel')}
              placeholder={t('inventory.import.barcodePlaceholder')}
              hint={t('inventory.import.scannerHelp')}
              value={barcode}
              maxLength={64}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => setBarcode(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                loading={catalogLoading}
                disabled={!providerId || !barcode.trim()}
              >
                {t('inventory.import.lookup')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!providerId || cameraBusy}
                onClick={() => (cameraActive ? void stopCamera() : setCameraPromptOpen(true))}
              >
                {cameraActive ? t('inventory.import.cameraStop') : t('inventory.import.camera')}
              </Button>
            </div>
          </form>

          <div className={cameraActive ? 'mt-4' : 'hidden'}>
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-video w-full max-w-lg rounded-xl bg-black object-cover"
            />
            <p className="mt-2 text-xs text-[#60736c]">{t('inventory.import.cameraScanning')}</p>
          </div>
          {cameraError ? <p className="mt-3 text-sm text-rose-700">{cameraError}</p> : null}
          {catalogError ? <p className="mt-4 text-sm text-rose-700">{catalogError}</p> : null}

          {catalogProducts.length > 0 ? (
            <div className="mt-5 space-y-3" aria-live="polite">
              {catalogProducts.map((product) => (
                <article
                  key={product.id}
                  className="rounded-xl border border-[#e3eae7] bg-[#fbfcfb] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-[#173128]">{product.name}</h3>
                      <p className="mt-1 text-sm text-[#60736c]">
                        {[product.brand, product.strength, product.dosageForm]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <p className="mt-1 text-xs text-[#7a8984]">{product.manufacturer}</p>
                    </div>
                    {product.requiresPrescription ? (
                      <Badge tone="amber">{t('inventory.import.prescriptionRequired')}</Badge>
                    ) : (
                      <Badge tone="emerald">{t('inventory.import.nonPrescription')}</Badge>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-[#173128]">{t('inventory.import.fileTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-[#60736c]">
            {t('inventory.import.fileHelp')}
          </p>
          <label className="mt-5 block">
            <span className="mb-2 block text-xs font-bold text-canvas-700">
              {t('inventory.import.chooseFile')}
            </span>
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!providerId || stageLoading || applyLoading}
              onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
              className="block w-full rounded-xl border border-[#dce5e1] bg-white p-3 text-sm text-[#38544b] file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-emerald-800"
            />
          </label>
          {fileError ? <p className="mt-3 text-sm text-rose-700">{fileError}</p> : null}

          {parsedFile ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl bg-[#f5f8f7] p-4 text-sm text-[#536a62]">
                <p className="font-bold text-[#173128]">{parsedFile.sourceFileName}</p>
                <p className="mt-1">
                  {parsedFile.sourceFormat} · {parsedFile.rows.length} {t('inventory.import.rows')}
                </p>
              </div>

              <div>
                <h3 className="font-bold text-[#173128]">{t('inventory.import.mappingTitle')}</h3>
                <div className="mt-3 overflow-x-auto rounded-xl border border-[#e3eae7]">
                  <table className="min-w-full divide-y divide-[#e9eeec] text-sm">
                    <thead className="bg-[#f7f9f8] text-left text-xs font-bold text-[#60736c]">
                      <tr>
                        <th className="px-4 py-3">{t('inventory.import.sourceColumn')}</th>
                        <th className="px-4 py-3">{t('inventory.import.aimField')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1ef]">
                      {parsedFile.headers.map((header) => (
                        <tr key={header}>
                          <td className="px-4 py-3 font-semibold text-[#264239]">{header}</td>
                          <td className="px-4 py-3">
                            <select
                              value={mapping[header] ?? ''}
                              onChange={(event) => changeMapping(header, event.target.value)}
                              className="organization-theme-focus h-10 w-full min-w-48 rounded-lg border border-[#dce5e1] bg-white px-3 text-sm text-[#38544b]"
                            >
                              <option value="">{t('inventory.import.ignore')}</option>
                              {INVENTORY_IMPORT_FIELDS.map((field) => (
                                <option key={field} value={field}>
                                  {t(FIELD_LABEL_KEYS[field])}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Button
                type="button"
                loading={stageLoading}
                loadingLabel={t('inventory.import.staging')}
                disabled={!providerId || mappedRows.length < 1 || applyLoading}
                onClick={() => {
                  setStageLoading(true);
                  void stageImport();
                }}
              >
                {t('inventory.import.stage')}
              </Button>
              {stageError ? <p className="text-sm text-rose-700">{stageError}</p> : null}
            </div>
          ) : null}
        </Card>
      </div>

      {preview ? (
        <Card padded={false}>
          <div className="border-b border-[#edf1ef] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[#173128]">{t('inventory.import.previewTitle')}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="slate">
                {t('inventory.import.rows')}: {preview.rowCount}
              </Badge>
              <Badge tone="emerald">
                {t('inventory.import.valid')}: {preview.validRowCount}
              </Badge>
              <Badge tone={preview.invalidRowCount ? 'rose' : 'slate'}>
                {t('inventory.import.invalid')}: {preview.invalidRowCount}
              </Badge>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#e9eeec] text-sm">
              <thead className="bg-[#f7f9f8] text-left text-xs font-bold text-[#60736c]">
                <tr>
                  <th className="px-5 py-3">{t('inventory.import.row')}</th>
                  <th className="px-5 py-3">{t('inventory.import.status')}</th>
                  <th className="px-5 py-3">{t('inventory.import.batch')}</th>
                  <th className="px-5 py-3">{t('inventory.import.quantity')}</th>
                  <th className="px-5 py-3">{t('inventory.import.errors')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf1ef]">
                {preview.rows.map((row) => (
                  <tr key={row.rowId}>
                    <td className="px-5 py-3 font-semibold text-[#264239]">{row.rowNumber}</td>
                    <td className="px-5 py-3">
                      <Badge tone={row.status === 'INVALID' ? 'rose' : 'emerald'}>
                        {row.status === 'INVALID'
                          ? t('inventory.import.invalid')
                          : t('inventory.import.valid')}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-[#536a62]">{row.payload.batchNumber}</td>
                    <td className="px-5 py-3 text-[#536a62]">{row.payload.quantity}</td>
                    <td className="max-w-md px-5 py-3 text-xs text-[#6c7b76]">
                      {row.validationErrors.length ? row.validationErrors.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-[#edf1ef] p-5 sm:p-6">
            <p className="mb-4 max-w-3xl text-sm leading-6 text-[#60736c]">
              {t('inventory.import.applyHelp')}
            </p>
            <Button
              type="button"
              loading={applyLoading}
              loadingLabel={t('inventory.import.applying')}
              disabled={
                preview.status !== 'STAGED' ||
                preview.invalidRowCount !== 0 ||
                preview.validRowCount !== preview.rowCount
              }
              onClick={() => void applyImport()}
            >
              {t('inventory.import.apply')}
            </Button>
            {applyError ? <p className="mt-3 text-sm text-rose-700">{applyError}</p> : null}
          </div>
        </Card>
      ) : null}

      {receipt ? (
        <Card>
          <h2 className="text-lg font-bold text-emerald-800">{t('inventory.import.applied')}</h2>
          <p className="mt-2 text-sm text-[#536a62]">
            {t('inventory.import.receipt', {
              rows: receipt.appliedRowCount,
              quantity: receipt.totalQuantity,
              receipt: receipt.receiptId,
            })}
          </p>
        </Card>
      ) : null}

      {!providersLoading && providers.length === 0 && !providerError ? (
        <EmptyState
          title={t('inventory.noActiveProvider')}
          description={t('inventory.noActiveProviderDetail')}
        />
      ) : null}

      <PermissionExplanationDialog
        kind="camera"
        open={cameraPromptOpen}
        busy={cameraBusy}
        onContinue={() => void beginCamera()}
        onAlternative={() => setCameraPromptOpen(false)}
      />
    </div>
  );
}

function publicMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message.slice(0, 240) : fallback;
}
