'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { useLanguage } from '@/components/language-provider';
import { Badge, Button, Card, EmptyState, Input } from '@/components/platform/primitives';
import {
  checkoutPosSale,
  configurePosFiscalProfile,
  configurePosInventoryFiscalProfile,
  getAssignedProviders,
  getAuthorizationCatalogue,
  getPosFiscalProfile,
  getPosProductQuote,
  reprintPosInvoice,
  searchInventoryCatalog,
  voidPosSale,
} from '@/lib/api-client';
import { AUTHORIZATION_PERMISSIONS } from '@/lib/authorization-contract';
import type { InventoryCatalogProduct } from '@/lib/inventory-import-contract';
import type { ProviderAccess } from '@/lib/inventory-contract';
import type {
  PosFiscalProfileResponse,
  PosPaymentMethod,
  PosProductQuote,
  PosSaleReceipt,
} from '@/lib/pos-contract';
import { calculatePosPreviewMoney, sumPosMoney } from '@/lib/pos-money';

interface CartLine {
  quote: PosProductQuote;
  quantity: number;
}

interface FiscalDraft {
  hsnCode: string;
  uqc: string;
  cessPercentage: string;
}

export function PosWorkspace() {
  const { t } = useLanguage();
  const [providers, setProviders] = useState<ProviderAccess[]>([]);
  const [providerId, setProviderId] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const [fiscal, setFiscal] = useState<PosFiscalProfileResponse | null>(null);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalSaving, setFiscalSaving] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const [registrationType, setRegistrationType] = useState<
    'GST_REGULAR' | 'GST_COMPOSITION' | 'UNREGISTERED'
  >('GST_REGULAR');
  const [legalName, setLegalName] = useState('');
  const [gstin, setGstin] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [invoiceSeries, setInvoiceSeries] = useState('AIM');
  const [pricesIncludeTax, setPricesIncludeTax] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [products, setProducts] = useState<InventoryCatalogProduct[]>([]);
  const [quoteLoadingId, setQuoteLoadingId] = useState<string | null>(null);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [fiscalDrafts, setFiscalDrafts] = useState<Record<string, FiscalDraft>>({});
  const [productFiscalSaving, setProductFiscalSaving] = useState<string | null>(null);
  const [productFiscalError, setProductFiscalError] = useState<string | null>(null);

  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientGstin, setRecipientGstin] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutKey, setCheckoutKey] = useState<{ signature: string; key: string } | null>(null);

  const [receipt, setReceipt] = useState<PosSaleReceipt | null>(null);
  const [receiptActionLoading, setReceiptActionLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const canRead = permissions.includes(AUTHORIZATION_PERMISSIONS.billingPosRead);
  const canCheckout = permissions.includes(AUTHORIZATION_PERMISSIONS.billingPosCheckout);
  const canConfigure = permissions.includes(AUTHORIZATION_PERMISSIONS.billingPosConfigure);
  const canVoid = permissions.includes(AUTHORIZATION_PERMISSIONS.billingPosVoid);

  const loadBoot = useCallback(async () => {
    setBootLoading(true);
    setBootError(null);
    try {
      const [assigned, authorization] = await Promise.all([
        getAssignedProviders(),
        getAuthorizationCatalogue(),
      ]);
      const pharmacies = assigned.filter(
        (provider) => provider.providerType === 'PHARMACY' && provider.isActive,
      );
      setProviders(pharmacies);
      setPermissions(authorization.effectivePermissions);
      setProviderId((current) =>
        pharmacies.some((provider) => provider.providerId === current)
          ? current
          : (pharmacies[0]?.providerId ?? ''),
      );
    } catch (error) {
      setProviders([]);
      setPermissions([]);
      setProviderId('');
      setBootError(publicMessage(error, t('pos.error.providers')));
    } finally {
      setBootLoading(false);
    }
  }, [t]);

  const loadFiscal = useCallback(
    async (selectedProviderId: string) => {
      if (!selectedProviderId || !permissions.includes(AUTHORIZATION_PERMISSIONS.billingPosRead)) {
        setFiscal(null);
        return;
      }
      setFiscalLoading(true);
      setFiscalError(null);
      try {
        const response = await getPosFiscalProfile(selectedProviderId);
        setFiscal(response);
        if (response.fiscalProfile) {
          setRegistrationType(response.fiscalProfile.registrationType);
          setLegalName(response.fiscalProfile.legalName);
          setGstin(response.fiscalProfile.gstin ?? '');
          setStateCode(response.fiscalProfile.stateCode);
          setInvoiceSeries(response.fiscalProfile.invoiceSeries);
          setPricesIncludeTax(response.fiscalProfile.pricesIncludeTax);
          setPlaceOfSupply((current) => current || response.fiscalProfile!.stateCode);
        } else {
          setLegalName(response.businessName);
        }
      } catch (error) {
        setFiscal(null);
        setFiscalError(publicMessage(error, t('pos.error.fiscal')));
      } finally {
        setFiscalLoading(false);
      }
    },
    [permissions, t],
  );

  useEffect(() => void loadBoot(), [loadBoot]);
  useEffect(() => {
    if (!providerId) {
      setFiscal(null);
      return;
    }
    setCart([]);
    setProducts([]);
    setReceipt(null);
    setCheckoutError(null);
    setCheckoutKey(null);
    setPlaceOfSupply('');
    void loadFiscal(providerId);
  }, [loadFiscal, providerId]);

  async function saveFiscal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !canConfigure || fiscalSaving) return;
    setFiscalSaving(true);
    setFiscalError(null);
    try {
      await configurePosFiscalProfile(providerId, {
        registrationType,
        legalName: legalName.trim(),
        ...(registrationType === 'UNREGISTERED' ? {} : { gstin: gstin.trim() }),
        stateCode: stateCode.trim(),
        invoiceSeries: invoiceSeries.trim().toUpperCase(),
        pricesIncludeTax,
        ...(fiscal?.fiscalProfile ? { expectedVersion: fiscal.fiscalProfile.version } : {}),
      });
      await loadFiscal(providerId);
    } catch (error) {
      setFiscalError(publicMessage(error, t('pos.error.fiscal')));
    } finally {
      setFiscalSaving(false);
    }
  }

  async function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !canRead || searchLoading || searchQuery.trim().length < 2) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const response = await searchInventoryCatalog(providerId, {
        query: searchQuery.trim(),
        limit: 20,
      });
      setProducts(response.data);
      if (response.data.length === 0) setSearchError(t('pos.search.empty'));
    } catch (error) {
      setProducts([]);
      setSearchError(publicMessage(error, t('pos.error.search')));
    } finally {
      setSearchLoading(false);
    }
  }

  async function addProduct(product: InventoryCatalogProduct) {
    if (!providerId || !canRead || quoteLoadingId) return;
    if (product.requiresPrescription) {
      setSearchError(t('pos.notice.clinical'));
      return;
    }
    setQuoteLoadingId(product.id);
    setSearchError(null);
    try {
      const quote = await getPosProductQuote(providerId, product.id);
      if (quote.requiresPrescription) {
        setSearchError(t('pos.notice.clinical'));
        return;
      }
      setCart((current) => {
        const existing = current.find((line) => line.quote.productId === quote.productId);
        if (existing) {
          return current.map((line) =>
            line.quote.productId === quote.productId
              ? {
                  ...line,
                  quote,
                  quantity: Math.min(line.quantity + 1, Math.max(1, quote.availableQuantity)),
                }
              : line,
          );
        }
        return [...current, { quote, quantity: 1 }];
      });
      if (!quote.fiscalProfile) {
        setFiscalDrafts((current) => ({
          ...current,
          [quote.productId]: current[quote.productId] ?? {
            hsnCode: '',
            uqc: 'NOS',
            cessPercentage: '0',
          },
        }));
      }
      setCheckoutKey(null);
    } catch (error) {
      setSearchError(publicMessage(error, t('pos.error.quote')));
    } finally {
      setQuoteLoadingId(null);
    }
  }

  function updateQuantity(productId: string, raw: string) {
    const quantity = Number(raw);
    setCart((current) =>
      current.map((line) =>
        line.quote.productId === productId
          ? {
              ...line,
              quantity:
                Number.isSafeInteger(quantity) && quantity > 0
                  ? Math.min(quantity, Math.max(1, line.quote.availableQuantity))
                  : 1,
            }
          : line,
      ),
    );
    setCheckoutKey(null);
  }

  function removeLine(productId: string) {
    setCart((current) => current.filter((line) => line.quote.productId !== productId));
    setCheckoutKey(null);
  }

  async function saveProductFiscal(line: CartLine) {
    if (!providerId || !canConfigure || productFiscalSaving) return;
    const draft = fiscalDrafts[line.quote.productId];
    if (!draft) return;
    setProductFiscalSaving(line.quote.productId);
    setProductFiscalError(null);
    try {
      await configurePosInventoryFiscalProfile(providerId, line.quote.inventoryId, {
        hsnCode: draft.hsnCode.trim(),
        uqc: draft.uqc.trim().toUpperCase(),
        cessPercentage: draft.cessPercentage.trim(),
        ...(line.quote.fiscalProfile ? { expectedVersion: line.quote.fiscalProfile.version } : {}),
      });
      const refreshed = await getPosProductQuote(providerId, line.quote.productId);
      setCart((current) =>
        current.map((candidate) =>
          candidate.quote.productId === refreshed.productId
            ? { ...candidate, quote: refreshed }
            : candidate,
        ),
      );
      setCheckoutKey(null);
    } catch (error) {
      setProductFiscalError(publicMessage(error, t('pos.error.productFiscal')));
    } finally {
      setProductFiscalSaving(null);
    }
  }

  const preview = useMemo(() => {
    const fiscalProfile = fiscal?.fiscalProfile;
    if (!fiscalProfile || cart.length === 0 || cart.some((line) => !line.quote.fiscalProfile)) {
      return null;
    }
    try {
      const lines = cart.map((line) => ({
        productId: line.quote.productId,
        quantity: line.quantity,
        money: calculatePosPreviewMoney({
          unitPrice: line.quote.sellingPrice,
          quantity: line.quantity,
          discountPercentage: line.quote.discountPercentage,
          gstPercentage: line.quote.gstPercentage,
          cessPercentage: line.quote.fiscalProfile!.cessPercentage,
          pricesIncludeTax: fiscalProfile.pricesIncludeTax,
          collectGst: fiscalProfile.registrationType === 'GST_REGULAR',
          intraState: fiscalProfile.stateCode === placeOfSupply,
        }),
      }));
      return {
        lines,
        subtotal: sumPosMoney(lines.map((line) => line.money.grossValue)),
        discountTotal: sumPosMoney(lines.map((line) => line.money.discountAmount)),
        taxableTotal: sumPosMoney(lines.map((line) => line.money.taxableValue)),
        cgstTotal: sumPosMoney(lines.map((line) => line.money.cgstAmount)),
        sgstTotal: sumPosMoney(lines.map((line) => line.money.sgstAmount)),
        igstTotal: sumPosMoney(lines.map((line) => line.money.igstAmount)),
        cessTotal: sumPosMoney(lines.map((line) => line.money.cessAmount)),
        grandTotal: sumPosMoney(lines.map((line) => line.money.lineTotal)),
      };
    } catch {
      return null;
    }
  }, [cart, fiscal, placeOfSupply]);

  const changePreview = useMemo(() => {
    if (paymentMethod !== 'CASH' || !preview || !cashTendered.trim()) return null;
    return moneyDifference(cashTendered.trim(), preview.grandTotal);
  }, [cashTendered, paymentMethod, preview]);

  async function submitCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerId || !canCheckout || checkoutLoading || !preview || cart.length === 0) return;

    const commandWithoutKey = {
      lines: cart.map((line) => ({ productId: line.quote.productId, quantity: line.quantity })),
      payments: [
        {
          method: paymentMethod,
          amount: preview.grandTotal,
          ...(paymentReference.trim() ? { externalReference: paymentReference.trim() } : {}),
        },
      ],
      ...(reservationId.trim() ? { reservationId: reservationId.trim() } : {}),
      placeOfSupplyStateCode: placeOfSupply.trim(),
      ...(recipientName.trim() ? { recipientName: recipientName.trim() } : {}),
      ...(recipientAddress.trim() ? { recipientAddress: recipientAddress.trim() } : {}),
      ...(recipientGstin.trim() ? { recipientGstin: recipientGstin.trim().toUpperCase() } : {}),
      ...(paymentMethod === 'CASH' && cashTendered.trim()
        ? { cashTendered: cashTendered.trim() }
        : {}),
    };
    const signature = JSON.stringify(commandWithoutKey);
    const key =
      checkoutKey?.signature === signature
        ? checkoutKey.key
        : 'pos-checkout-' + crypto.randomUUID();
    setCheckoutKey({ signature, key });
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const completed = await checkoutPosSale(providerId, {
        idempotencyKey: key,
        ...commandWithoutKey,
      });
      setReceipt(completed);
      setCart([]);
      setProducts([]);
      setCheckoutKey(null);
      setPaymentReference('');
      setCashTendered('');
      setReservationId('');
    } catch (error) {
      setCheckoutError(publicMessage(error, t('pos.error.checkout')));
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function reprint() {
    if (!receipt || !providerId || !canRead || receiptActionLoading) return;
    setReceiptActionLoading(true);
    setReceiptError(null);
    try {
      const updated = await reprintPosInvoice(providerId, receipt.saleId);
      setReceipt(updated);
      window.print();
    } catch (error) {
      setReceiptError(publicMessage(error, t('pos.error.reprint')));
    } finally {
      setReceiptActionLoading(false);
    }
  }

  async function voidSale() {
    if (
      !receipt ||
      receipt.status !== 'COMPLETED' ||
      !providerId ||
      !canVoid ||
      receiptActionLoading ||
      !voidReason.trim()
    ) {
      return;
    }
    setReceiptActionLoading(true);
    setReceiptError(null);
    try {
      const updated = await voidPosSale(providerId, receipt.saleId, {
        idempotencyKey: 'pos-void-' + receipt.saleId,
        reason: voidReason.trim(),
      });
      setReceipt(updated);
      setVoidReason('');
    } catch (error) {
      setReceiptError(publicMessage(error, t('pos.error.void')));
    } finally {
      setReceiptActionLoading(false);
    }
  }

  const selectedProvider = providers.find((provider) => provider.providerId === providerId);
  const fiscalProfile = fiscal?.fiscalProfile;
  const checkoutBlocked =
    !canCheckout ||
    checkoutLoading ||
    !fiscalProfile ||
    !preview ||
    cart.length === 0 ||
    cart.some((line) => !line.quote.fiscalProfile) ||
    !/^\d{2}$/.test(placeOfSupply) ||
    (paymentMethod === 'CASH' &&
      cashTendered.trim().length > 0 &&
      (changePreview === null || changePreview.startsWith('-')));

  return (
    <div className="mx-auto max-w-[94rem] space-y-5 sm:space-y-6">
      <header>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-emerald-700">
          {t('pos.eyebrow')}
        </p>
        <h1 className="mt-3 font-[var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#10271f] sm:text-[2.45rem]">
          {t('pos.title')}
        </h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-[#71817c]">{t('pos.description')}</p>
      </header>

      <Card>
        <label className="block max-w-xl">
          <span className="mb-2 block text-xs font-bold text-canvas-700">{t('pos.provider')}</span>
          <select
            value={providerId}
            disabled={bootLoading || providers.length === 0}
            onChange={(event) => setProviderId(event.target.value)}
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
        {bootError ? <p className="mt-3 text-sm text-rose-700">{bootError}</p> : null}
        {selectedProvider ? (
          <p className="mt-3 text-xs font-semibold text-[#71817c]">
            {selectedProvider.businessName}
          </p>
        ) : null}
      </Card>

      {!bootLoading && providerId && !canRead ? (
        <Card>
          <EmptyState title={t('pos.accessTitle')} description={t('pos.accessDetail')} />
        </Card>
      ) : null}

      {providerId && canRead ? (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-[#173128]">{t('pos.fiscal.title')}</h2>
                <p className="mt-1 text-sm text-[#60736c]">{t('pos.fiscal.help')}</p>
              </div>
              {fiscalProfile ? (
                <Badge tone="emerald">{fiscalProfile.registrationType}</Badge>
              ) : null}
            </div>

            {fiscalLoading ? (
              <p className="mt-5 text-sm text-[#60736c]">{t('common.loading')}</p>
            ) : (
              <form onSubmit={saveFiscal} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-canvas-700">
                    {t('pos.fiscal.registration')}
                  </span>
                  <select
                    value={registrationType}
                    disabled={!canConfigure || fiscalSaving}
                    onChange={(event) =>
                      setRegistrationType(
                        event.target.value as 'GST_REGULAR' | 'GST_COMPOSITION' | 'UNREGISTERED',
                      )
                    }
                    className="organization-theme-focus h-[3.15rem] w-full rounded-xl border border-ink-900/[.11] bg-canvas-50 px-3 text-sm"
                  >
                    <option value="GST_REGULAR">{t('pos.fiscal.regular')}</option>
                    <option value="GST_COMPOSITION">{t('pos.fiscal.composition')}</option>
                    <option value="UNREGISTERED">{t('pos.fiscal.unregistered')}</option>
                  </select>
                </label>
                <Input
                  name="pos-legal-name"
                  label={t('pos.fiscal.legalName')}
                  value={legalName}
                  maxLength={200}
                  disabled={!canConfigure || fiscalSaving}
                  onChange={(event) => setLegalName(event.target.value)}
                />
                {registrationType !== 'UNREGISTERED' ? (
                  <Input
                    name="pos-gstin"
                    label={t('pos.fiscal.gstin')}
                    value={gstin}
                    maxLength={15}
                    disabled={!canConfigure || fiscalSaving}
                    onChange={(event) => setGstin(event.target.value.toUpperCase())}
                  />
                ) : null}
                <Input
                  name="pos-state-code"
                  label={t('pos.fiscal.stateCode')}
                  value={stateCode}
                  maxLength={2}
                  inputMode="numeric"
                  disabled={!canConfigure || fiscalSaving}
                  onChange={(event) => setStateCode(event.target.value)}
                />
                <Input
                  name="pos-invoice-series"
                  label={t('pos.fiscal.series')}
                  value={invoiceSeries}
                  maxLength={4}
                  disabled={!canConfigure || fiscalSaving}
                  onChange={(event) => setInvoiceSeries(event.target.value.toUpperCase())}
                />
                <label className="flex min-h-[3.15rem] items-center gap-3 rounded-xl border border-ink-900/[.11] bg-canvas-50 px-4">
                  <input
                    type="checkbox"
                    checked={pricesIncludeTax}
                    disabled={!canConfigure || fiscalSaving}
                    onChange={(event) => setPricesIncludeTax(event.target.checked)}
                  />
                  <span className="text-sm font-semibold text-[#29483f]">
                    {t('pos.fiscal.inclusive')}
                  </span>
                </label>
                {canConfigure ? (
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      loading={fiscalSaving}
                      loadingLabel={t('pos.fiscal.saving')}
                      disabled={
                        !legalName.trim() || !/^\d{2}$/.test(stateCode) || !invoiceSeries.trim()
                      }
                    >
                      {t('pos.fiscal.save')}
                    </Button>
                  </div>
                ) : null}
              </form>
            )}
            {fiscalError ? <p className="mt-4 text-sm text-rose-700">{fiscalError}</p> : null}
            {!fiscalLoading && !fiscalProfile ? (
              <p className="mt-4 text-sm font-semibold text-amber-700">{t('pos.fiscal.missing')}</p>
            ) : null}
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
            <Card>
              <h2 className="text-lg font-bold text-[#173128]">{t('pos.search.title')}</h2>
              <form onSubmit={searchProducts} className="mt-4 flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Input
                    name="pos-search"
                    label={t('pos.search.title')}
                    placeholder={t('pos.search.placeholder')}
                    value={searchQuery}
                    maxLength={120}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="self-end"
                  loading={searchLoading}
                  disabled={!providerId || searchQuery.trim().length < 2}
                >
                  {t('pos.search.action')}
                </Button>
              </form>
              {searchError ? <p className="mt-3 text-sm text-rose-700">{searchError}</p> : null}
              <div className="mt-4 space-y-3">
                {products.map((product) => (
                  <article
                    key={product.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3eae7] bg-[#fbfcfb] p-4"
                  >
                    <div>
                      <h3 className="font-bold text-[#173128]">{product.name}</h3>
                      <p className="mt-1 text-sm text-[#60736c]">
                        {[product.brand, product.strength, product.dosageForm]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {product.requiresPrescription ? (
                        <Badge tone="amber">{t('pos.search.prescription')}</Badge>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      loading={quoteLoadingId === product.id}
                      disabled={product.requiresPrescription || Boolean(quoteLoadingId)}
                      onClick={() => void addProduct(product)}
                    >
                      {t('pos.search.add')}
                    </Button>
                  </article>
                ))}
              </div>
            </Card>

            <Card>
              <h2 className="text-lg font-bold text-[#173128]">{t('pos.cart.title')}</h2>
              {cart.length === 0 ? (
                <EmptyState title={t('pos.cart.empty')} />
              ) : (
                <div className="mt-4 space-y-4">
                  {cart.map((line) => {
                    const linePreview = preview?.lines.find(
                      (candidate) => candidate.productId === line.quote.productId,
                    );
                    const draft = fiscalDrafts[line.quote.productId];
                    return (
                      <article
                        key={line.quote.productId}
                        className="rounded-xl border border-[#e3eae7] bg-[#fbfcfb] p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 className="font-bold text-[#173128]">{line.quote.name}</h3>
                            <p className="mt-1 text-xs text-[#71817c]">
                              {line.quote.brand} · {line.quote.strength} · {line.quote.dosageForm}
                            </p>
                            <p className="mt-2 text-sm font-bold text-[#21433a]">
                              ₹{line.quote.sellingPrice}
                            </p>
                            <p className="mt-1 text-xs text-[#71817c]">
                              {t('pos.cart.available', { count: line.quote.availableQuantity })}
                            </p>
                          </div>
                          <Button variant="ghost" onClick={() => removeLine(line.quote.productId)}>
                            {t('pos.cart.remove')}
                          </Button>
                        </div>

                        <div className="mt-4 max-w-40">
                          <Input
                            name={'pos-quantity-' + line.quote.productId}
                            label={t('pos.cart.quantity')}
                            type="number"
                            min={1}
                            max={Math.max(1, line.quote.availableQuantity)}
                            value={line.quantity}
                            onChange={(event) =>
                              updateQuantity(line.quote.productId, event.target.value)
                            }
                          />
                        </div>

                        {linePreview ? (
                          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <Metric
                              label={t('pos.receipt.discount')}
                              value={linePreview.money.discountAmount}
                            />
                            <Metric
                              label={t('pos.receipt.taxable')}
                              value={linePreview.money.taxableValue}
                            />
                            <Metric
                              label={
                                Number(linePreview.money.igstAmount) > 0
                                  ? t('pos.receipt.igst')
                                  : t('pos.receipt.cgst')
                              }
                              value={
                                Number(linePreview.money.igstAmount) > 0
                                  ? linePreview.money.igstAmount
                                  : linePreview.money.cgstAmount
                              }
                            />
                            <Metric
                              label={t('pos.receipt.total')}
                              value={linePreview.money.lineTotal}
                            />
                          </dl>
                        ) : null}

                        {!line.quote.fiscalProfile ? (
                          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                            <p className="text-sm font-bold text-amber-800">
                              {t('pos.cart.fiscalMissing')}
                            </p>
                            {canConfigure && draft ? (
                              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <Input
                                  name={'pos-hsn-' + line.quote.productId}
                                  label={t('pos.itemFiscal.hsn')}
                                  value={draft.hsnCode}
                                  maxLength={8}
                                  onChange={(event) =>
                                    setFiscalDrafts((current) => ({
                                      ...current,
                                      [line.quote.productId]: {
                                        ...draft,
                                        hsnCode: event.target.value,
                                      },
                                    }))
                                  }
                                />
                                <Input
                                  name={'pos-uqc-' + line.quote.productId}
                                  label={t('pos.itemFiscal.uqc')}
                                  value={draft.uqc}
                                  maxLength={8}
                                  onChange={(event) =>
                                    setFiscalDrafts((current) => ({
                                      ...current,
                                      [line.quote.productId]: {
                                        ...draft,
                                        uqc: event.target.value.toUpperCase(),
                                      },
                                    }))
                                  }
                                />
                                <Input
                                  name={'pos-cess-' + line.quote.productId}
                                  label={t('pos.itemFiscal.cess')}
                                  value={draft.cessPercentage}
                                  maxLength={6}
                                  inputMode="decimal"
                                  onChange={(event) =>
                                    setFiscalDrafts((current) => ({
                                      ...current,
                                      [line.quote.productId]: {
                                        ...draft,
                                        cessPercentage: event.target.value,
                                      },
                                    }))
                                  }
                                />
                                <Button
                                  className="sm:col-span-3 sm:w-fit"
                                  loading={productFiscalSaving === line.quote.productId}
                                  onClick={() => void saveProductFiscal(line)}
                                >
                                  {t('pos.itemFiscal.save')}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
              {productFiscalError ? (
                <p className="mt-4 text-sm text-rose-700">{productFiscalError}</p>
              ) : null}
            </Card>
          </div>

          <form onSubmit={submitCheckout}>
            <Card>
              <h2 className="text-lg font-bold text-[#173128]">{t('pos.checkout.title')}</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Input
                  name="pos-place-of-supply"
                  label={t('pos.checkout.placeOfSupply')}
                  value={placeOfSupply}
                  maxLength={2}
                  inputMode="numeric"
                  onChange={(event) => {
                    setPlaceOfSupply(event.target.value);
                    setCheckoutKey(null);
                  }}
                />
                <Input
                  name="pos-reservation"
                  label={t('pos.checkout.reservation')}
                  value={reservationId}
                  onChange={(event) => {
                    setReservationId(event.target.value);
                    setCheckoutKey(null);
                  }}
                />
                <label className="block">
                  <span className="mb-2 block text-xs font-bold text-canvas-700">
                    {t('pos.checkout.paymentMethod')}
                  </span>
                  <select
                    value={paymentMethod}
                    onChange={(event) => {
                      setPaymentMethod(event.target.value as PosPaymentMethod);
                      setCheckoutKey(null);
                    }}
                    className="organization-theme-focus h-[3.15rem] w-full rounded-xl border border-ink-900/[.11] bg-canvas-50 px-3 text-sm"
                  >
                    <option value="CASH">{t('pos.checkout.cash')}</option>
                    <option value="CARD">{t('pos.checkout.card')}</option>
                    <option value="UPI">{t('pos.checkout.upi')}</option>
                    <option value="OTHER">{t('pos.checkout.other')}</option>
                  </select>
                </label>
                {paymentMethod === 'CASH' ? (
                  <Input
                    name="pos-cash-tendered"
                    label={t('pos.checkout.cashTendered')}
                    value={cashTendered}
                    inputMode="decimal"
                    onChange={(event) => {
                      setCashTendered(event.target.value);
                      setCheckoutKey(null);
                    }}
                  />
                ) : (
                  <Input
                    name="pos-payment-reference"
                    label={t('pos.checkout.externalReference')}
                    value={paymentReference}
                    maxLength={80}
                    onChange={(event) => {
                      setPaymentReference(event.target.value);
                      setCheckoutKey(null);
                    }}
                  />
                )}
              </div>

              <div className="mt-6 border-t border-[#e7ecea] pt-5">
                <h3 className="font-bold text-[#173128]">{t('pos.recipient.title')}</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <Input
                    name="pos-recipient-name"
                    label={t('pos.recipient.name')}
                    value={recipientName}
                    maxLength={200}
                    onChange={(event) => {
                      setRecipientName(event.target.value);
                      setCheckoutKey(null);
                    }}
                  />
                  <Input
                    name="pos-recipient-address"
                    label={t('pos.recipient.address')}
                    value={recipientAddress}
                    maxLength={500}
                    onChange={(event) => {
                      setRecipientAddress(event.target.value);
                      setCheckoutKey(null);
                    }}
                  />
                  <Input
                    name="pos-recipient-gstin"
                    label={t('pos.recipient.gstin')}
                    value={recipientGstin}
                    maxLength={15}
                    onChange={(event) => {
                      setRecipientGstin(event.target.value.toUpperCase());
                      setCheckoutKey(null);
                    }}
                  />
                </div>
              </div>

              {preview ? (
                <dl className="mt-6 grid gap-3 rounded-xl bg-[#f5f8f7] p-4 sm:grid-cols-4 xl:grid-cols-8">
                  <Metric label={t('pos.receipt.subtotal')} value={preview.subtotal} />
                  <Metric label={t('pos.receipt.discount')} value={preview.discountTotal} />
                  <Metric label={t('pos.receipt.taxable')} value={preview.taxableTotal} />
                  <Metric label={t('pos.receipt.cgst')} value={preview.cgstTotal} />
                  <Metric label={t('pos.receipt.sgst')} value={preview.sgstTotal} />
                  <Metric label={t('pos.receipt.igst')} value={preview.igstTotal} />
                  <Metric label={t('pos.receipt.cess')} value={preview.cessTotal} />
                  <Metric label={t('pos.receipt.total')} value={preview.grandTotal} strong />
                </dl>
              ) : null}

              {paymentMethod === 'CASH' && changePreview !== null ? (
                <p className="mt-3 text-sm font-bold text-[#21433a]">
                  {t('pos.checkout.change')}: ₹{changePreview}
                </p>
              ) : null}
              <p className="mt-4 text-xs leading-5 text-[#71817c]">{t('pos.notice.taxReview')}</p>
              {checkoutError ? (
                <p className="mt-4 text-sm text-rose-700" role="alert">
                  {checkoutError}
                </p>
              ) : null}
              <div className="mt-5">
                <Button
                  type="submit"
                  loading={checkoutLoading}
                  loadingLabel={t('pos.checkout.submitting')}
                  disabled={checkoutBlocked}
                >
                  {t('pos.checkout.submit')}
                </Button>
              </div>
            </Card>
          </form>

          {receipt ? (
            <Card className="print:shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#173128]">{t('pos.receipt.title')}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#60736c]">
                    {t('pos.receipt.invoice', { number: receipt.invoice.invoiceNumber })}
                  </p>
                  <p className="mt-1 text-xs text-[#71817c]">
                    {receipt.invoice.financialYear} · {receipt.invoice.documentType}
                  </p>
                </div>
                <Badge tone={receipt.status === 'COMPLETED' ? 'emerald' : 'rose'}>
                  {receipt.status === 'COMPLETED'
                    ? t('pos.receipt.status.completed')
                    : t('pos.receipt.status.voided')}
                </Badge>
              </div>

              <div className="mt-5 overflow-x-auto rounded-xl border border-[#e3eae7]">
                <table className="min-w-full divide-y divide-[#e9eeec] text-sm">
                  <thead className="bg-[#f7f9f8] text-left text-xs font-bold text-[#60736c]">
                    <tr>
                      <th className="px-4 py-3">{t('pos.search.title')}</th>
                      <th className="px-4 py-3">{t('pos.cart.quantity')}</th>
                      <th className="px-4 py-3">{t('pos.receipt.taxable')}</th>
                      <th className="px-4 py-3">{t('pos.receipt.total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf1ef]">
                    {receipt.lines.map((line) => (
                      <tr key={line.lineNumber}>
                        <td className="px-4 py-3">
                          <span className="font-bold text-[#173128]">
                            {line.productNameSnapshot}
                          </span>
                          <span className="mt-1 block text-xs text-[#71817c]">
                            {line.hsnCodeSnapshot} · {line.uqcSnapshot}
                          </span>
                        </td>
                        <td className="px-4 py-3">{line.quantity}</td>
                        <td className="px-4 py-3">₹{line.taxableValue}</td>
                        <td className="px-4 py-3 font-bold">₹{line.lineTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="mt-5 grid gap-3 rounded-xl bg-[#f5f8f7] p-4 sm:grid-cols-4 xl:grid-cols-8">
                <Metric label={t('pos.receipt.subtotal')} value={receipt.subtotal} />
                <Metric label={t('pos.receipt.discount')} value={receipt.discountTotal} />
                <Metric label={t('pos.receipt.taxable')} value={receipt.taxableTotal} />
                <Metric label={t('pos.receipt.cgst')} value={receipt.cgstTotal} />
                <Metric label={t('pos.receipt.sgst')} value={receipt.sgstTotal} />
                <Metric label={t('pos.receipt.igst')} value={receipt.igstTotal} />
                <Metric label={t('pos.receipt.cess')} value={receipt.cessTotal} />
                <Metric label={t('pos.receipt.total')} value={receipt.grandTotal} strong />
              </dl>

              <p className="mt-3 text-xs text-[#71817c]">
                {t('pos.receipt.reprintCount', { count: receipt.invoice.reprintCount })}
              </p>
              {receipt.voidRecord ? (
                <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                  {receipt.voidRecord.reason}
                </p>
              ) : null}
              {receiptError ? (
                <p className="mt-4 text-sm text-rose-700" role="alert">
                  {receiptError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2 print:hidden">
                <Button variant="secondary" onClick={() => window.print()}>
                  {t('pos.receipt.print')}
                </Button>
                <Button
                  variant="secondary"
                  loading={receiptActionLoading}
                  onClick={() => void reprint()}
                >
                  {t('pos.receipt.reprint')}
                </Button>
              </div>

              {canVoid && receipt.status === 'COMPLETED' ? (
                <div className="mt-6 border-t border-rose-100 pt-5 print:hidden">
                  <div className="max-w-xl">
                    <Input
                      name="pos-void-reason"
                      label={t('pos.receipt.voidReason')}
                      value={voidReason}
                      maxLength={500}
                      onChange={(event) => setVoidReason(event.target.value)}
                    />
                  </div>
                  <Button
                    variant="danger"
                    className="mt-3"
                    loading={receiptActionLoading}
                    disabled={!voidReason.trim()}
                    onClick={() => void voidSale()}
                  >
                    {t('pos.receipt.voidAction')}
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-[#71817c]">{label}</dt>
      <dd
        className={
          strong ? 'mt-1 text-base font-black text-[#10271f]' : 'mt-1 font-bold text-[#29483f]'
        }
      >
        ₹{value}
      </dd>
    </div>
  );
}

function moneyDifference(left: string, right: string): string | null {
  try {
    const a = parsePaise(left);
    const b = parsePaise(right);
    const difference = a - b;
    if (difference < 0n) return '-' + formatPaise(-difference);
    return formatPaise(difference);
  } catch {
    return null;
  }
}

function parsePaise(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) throw new Error('money');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function formatPaise(value: bigint): string {
  return String(value / 100n) + '.' + String(value % 100n).padStart(2, '0');
}

function publicMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && error.message.length <= 240) return error.message;
  return fallback;
}
