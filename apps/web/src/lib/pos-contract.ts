import { isCanonicalUuid } from './inventory-contract';

export type PosRegistrationType = 'GST_REGULAR' | 'GST_COMPOSITION' | 'UNREGISTERED';
export type PosPaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'OTHER';

export interface PosFiscalProfileRequest {
  registrationType: PosRegistrationType;
  legalName: string;
  gstin?: string;
  stateCode: string;
  invoiceSeries: string;
  pricesIncludeTax: boolean;
  expectedVersion?: number;
}

export interface PosInventoryFiscalProfileRequest {
  hsnCode: string;
  uqc: string;
  cessPercentage: string;
  expectedVersion?: number;
}

export interface PosCheckoutRequest {
  idempotencyKey: string;
  lines: { productId: string; quantity: number }[];
  payments: { method: PosPaymentMethod; amount: string; externalReference?: string }[];
  reservationId?: string;
  placeOfSupplyStateCode: string;
  recipientName?: string;
  recipientAddress?: string;
  recipientGstin?: string;
  cashTendered?: string;
}

export interface PosVoidRequest {
  idempotencyKey: string;
  reason: string;
}

export interface PosFiscalProfileResponse {
  providerId: string;
  businessName: string;
  address: string;
  isActive: boolean;
  fiscalProfile: null | {
    registrationType: PosRegistrationType;
    legalName: string;
    gstin: string | null;
    stateCode: string;
    invoiceSeries: string;
    pricesIncludeTax: boolean;
    version: number;
  };
}

export interface PosFiscalConfigurationResult {
  providerId: string;
  registrationType: PosRegistrationType;
  legalName: string;
  gstin: string | null;
  stateCode: string;
  invoiceSeries: string;
  pricesIncludeTax: boolean;
  version: number;
}

export interface PosInventoryFiscalConfigurationResult {
  providerId: string;
  inventoryId: string;
  productId: string;
  hsnCode: string;
  uqc: string;
  cessPercentage: string;
  version: number;
}

export interface PosProductQuote {
  providerId: string;
  inventoryId: string;
  productId: string;
  name: string;
  genericName: string | null;
  brand: string;
  strength: string;
  dosageForm: string;
  requiresPrescription: boolean;
  isVisible: boolean;
  sellingPrice: string;
  mrp: string;
  discountPercentage: string;
  gstPercentage: string;
  fiscalProfile: null | {
    hsnCode: string;
    uqc: string;
    cessPercentage: string;
    version: number;
  };
  availableQuantity: number;
}

export interface PosSaleReceipt {
  saleId: string;
  providerId: string;
  reservationId: string | null;
  status: 'COMPLETED' | 'VOIDED';
  currency: 'INR';
  pricesIncludeTax: boolean;
  subtotal: string;
  discountTotal: string;
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  cessTotal: string;
  grandTotal: string;
  cashTendered: string | null;
  changeDue: string | null;
  placeOfSupplyStateCode: string;
  recipientName: string | null;
  recipientAddress: string | null;
  recipientGstin: string | null;
  completedAt: string;
  voidedAt: string | null;
  lines: Array<{
    lineNumber: number;
    productId: string;
    quantity: number;
    productNameSnapshot: string;
    brandSnapshot: string;
    strengthSnapshot: string;
    dosageFormSnapshot: string;
    hsnCodeSnapshot: string;
    uqcSnapshot: string;
    unitPrice: string;
    mrp: string;
    grossValue: string;
    discountPercentage: string;
    discountAmount: string;
    taxableValue: string;
    gstPercentage: string;
    cessPercentage: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    cessAmount: string;
    lineTotal: string;
  }>;
  payments: Array<{
    method: PosPaymentMethod;
    amount: string;
    externalReference: string | null;
  }>;
  invoice: {
    id: string;
    documentType: 'TAX_INVOICE' | 'BILL_OF_SUPPLY' | 'COMMERCIAL_RECEIPT';
    financialYear: string;
    invoiceNumber: string;
    issuedAt: string;
    supplierLegalName: string;
    supplierAddress: string;
    supplierGstin: string | null;
    supplierStateCode: string;
    placeOfSupplyStateCode: string;
    recipientName: string | null;
    recipientAddress: string | null;
    recipientGstin: string | null;
    subtotal: string;
    discountTotal: string;
    taxableTotal: string;
    cgstTotal: string;
    sgstTotal: string;
    igstTotal: string;
    cessTotal: string;
    grandTotal: string;
    reprintCount: number;
  };
  voidRecord: null | { reason: string; occurredAt: string };
  replayed: boolean;
}

const MONEY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;
const PERCENT = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const STATE = /^\d{2}$/;
const HSN = /^(?:\d{4}|\d{6}|\d{8})$/;
const UQC = /^[A-Z]{2,8}$/;
const SERIES = /^[A-Z0-9]{1,4}$/;

export function isPosFiscalProfileRequest(value: unknown): value is PosFiscalProfileRequest {
  if (
    !hasOnlyKeys(value, [
      'registrationType',
      'legalName',
      'gstin',
      'stateCode',
      'invoiceSeries',
      'pricesIncludeTax',
      'expectedVersion',
    ])
  )
    return false;
  const v = value as Partial<PosFiscalProfileRequest>;
  if (
    !requiredKeys(value, [
      'registrationType',
      'legalName',
      'stateCode',
      'invoiceSeries',
      'pricesIncludeTax',
    ])
  )
    return false;
  if (!(
    v.registrationType === 'GST_REGULAR' ||
    v.registrationType === 'GST_COMPOSITION' ||
    v.registrationType === 'UNREGISTERED'
  ))
    return false;
  if (
    !trimmed(v.legalName, 1, 200) ||
    !STATE.test(String(v.stateCode)) ||
    !SERIES.test(String(v.invoiceSeries)) ||
    typeof v.pricesIncludeTax !== 'boolean'
  )
    return false;
  if (v.expectedVersion !== undefined && !integer(v.expectedVersion, 1, 2147483647)) return false;
  if (v.registrationType === 'UNREGISTERED') return v.gstin === undefined;
  return typeof v.gstin === 'string' && GSTIN.test(v.gstin) && v.gstin.slice(0, 2) === v.stateCode;
}

export function isPosInventoryFiscalProfileRequest(
  value: unknown,
): value is PosInventoryFiscalProfileRequest {
  if (
    !hasOnlyKeys(value, ['hsnCode', 'uqc', 'cessPercentage', 'expectedVersion']) ||
    !requiredKeys(value, ['hsnCode', 'uqc', 'cessPercentage'])
  )
    return false;
  const v = value as Partial<PosInventoryFiscalProfileRequest>;
  if (
    typeof v.hsnCode !== 'string' ||
    !HSN.test(v.hsnCode) ||
    typeof v.uqc !== 'string' ||
    !UQC.test(v.uqc) ||
    typeof v.cessPercentage !== 'string' ||
    !PERCENT.test(v.cessPercentage) ||
    Number(v.cessPercentage) > 100
  )
    return false;
  return v.expectedVersion === undefined || integer(v.expectedVersion, 1, 2147483647);
}

export function isPosCheckoutRequest(value: unknown): value is PosCheckoutRequest {
  if (
    !hasOnlyKeys(value, [
      'idempotencyKey',
      'lines',
      'payments',
      'reservationId',
      'placeOfSupplyStateCode',
      'recipientName',
      'recipientAddress',
      'recipientGstin',
      'cashTendered',
    ]) ||
    !requiredKeys(value, ['idempotencyKey', 'lines', 'payments', 'placeOfSupplyStateCode'])
  )
    return false;
  const v = value as Partial<PosCheckoutRequest>;
  if (
    !trimmed(v.idempotencyKey, 8, 120) ||
    !Array.isArray(v.lines) ||
    v.lines.length < 1 ||
    v.lines.length > 100 ||
    !v.lines.every(isLine)
  )
    return false;
  if (new Set(v.lines.map((x) => x.productId)).size !== v.lines.length) return false;
  if (
    !Array.isArray(v.payments) ||
    v.payments.length < 1 ||
    v.payments.length > 4 ||
    !v.payments.every(isPayment)
  )
    return false;
  if (!STATE.test(String(v.placeOfSupplyStateCode))) return false;
  if (v.reservationId !== undefined && !isCanonicalUuid(v.reservationId)) return false;
  if (v.recipientName !== undefined && !trimmed(v.recipientName, 1, 200)) return false;
  if (v.recipientAddress !== undefined && !trimmed(v.recipientAddress, 1, 500)) return false;
  if (
    v.cashTendered !== undefined &&
    (typeof v.cashTendered !== 'string' || !MONEY.test(v.cashTendered))
  )
    return false;
  if (v.recipientGstin !== undefined) {
    if (
      typeof v.recipientGstin !== 'string' ||
      !GSTIN.test(v.recipientGstin) ||
      v.recipientGstin.slice(0, 2) !== v.placeOfSupplyStateCode
    )
      return false;
    if (!v.recipientName || !v.recipientAddress) return false;
  }
  return true;
}

export function isPosVoidRequest(value: unknown): value is PosVoidRequest {
  return (
    hasExactKeys(value, ['idempotencyKey', 'reason']) &&
    trimmed((value as Partial<PosVoidRequest>).idempotencyKey, 8, 120) &&
    trimmed((value as Partial<PosVoidRequest>).reason, 1, 500)
  );
}

export function isPosFiscalProfileResponse(value: unknown): value is PosFiscalProfileResponse {
  if (!hasExactKeys(value, ['providerId', 'businessName', 'address', 'isActive', 'fiscalProfile']))
    return false;
  const v = value as Partial<PosFiscalProfileResponse>;
  return (
    isCanonicalUuid(v.providerId) &&
    trimmed(v.businessName, 1, 240) &&
    trimmed(v.address, 1, 500) &&
    typeof v.isActive === 'boolean' &&
    (v.fiscalProfile === null || isFiscalProfile(v.fiscalProfile))
  );
}

export function isPosFiscalConfigurationResult(
  value: unknown,
): value is PosFiscalConfigurationResult {
  if (
    !hasExactKeys(value, [
      'providerId',
      'registrationType',
      'legalName',
      'gstin',
      'stateCode',
      'invoiceSeries',
      'pricesIncludeTax',
      'version',
    ])
  ) {
    return false;
  }
  const v = value as Partial<PosFiscalConfigurationResult>;
  return (
    isCanonicalUuid(v.providerId) &&
    (v.registrationType === 'GST_REGULAR' ||
      v.registrationType === 'GST_COMPOSITION' ||
      v.registrationType === 'UNREGISTERED') &&
    trimmed(v.legalName, 1, 200) &&
    (v.gstin === null || (typeof v.gstin === 'string' && GSTIN.test(v.gstin))) &&
    typeof v.stateCode === 'string' &&
    STATE.test(v.stateCode) &&
    typeof v.invoiceSeries === 'string' &&
    SERIES.test(v.invoiceSeries) &&
    typeof v.pricesIncludeTax === 'boolean' &&
    integer(v.version, 1, 2147483647)
  );
}

export function isPosInventoryFiscalConfigurationResult(
  value: unknown,
): value is PosInventoryFiscalConfigurationResult {
  if (
    !hasExactKeys(value, [
      'providerId',
      'inventoryId',
      'productId',
      'hsnCode',
      'uqc',
      'cessPercentage',
      'version',
    ])
  ) {
    return false;
  }
  const v = value as Partial<PosInventoryFiscalConfigurationResult>;
  return (
    isCanonicalUuid(v.providerId) &&
    isCanonicalUuid(v.inventoryId) &&
    isCanonicalUuid(v.productId) &&
    typeof v.hsnCode === 'string' &&
    HSN.test(v.hsnCode) &&
    typeof v.uqc === 'string' &&
    UQC.test(v.uqc) &&
    percent(v.cessPercentage) &&
    integer(v.version, 1, 2147483647)
  );
}

export function isPosProductQuote(value: unknown): value is PosProductQuote {
  if (
    !hasExactKeys(value, [
      'providerId',
      'inventoryId',
      'productId',
      'name',
      'genericName',
      'brand',
      'strength',
      'dosageForm',
      'requiresPrescription',
      'isVisible',
      'sellingPrice',
      'mrp',
      'discountPercentage',
      'gstPercentage',
      'fiscalProfile',
      'availableQuantity',
    ])
  )
    return false;
  const v = value as Partial<PosProductQuote>;
  return (
    isCanonicalUuid(v.providerId) &&
    isCanonicalUuid(v.inventoryId) &&
    isCanonicalUuid(v.productId) &&
    trimmed(v.name, 1, 240) &&
    (v.genericName === null || trimmed(v.genericName, 1, 240)) &&
    trimmed(v.brand, 1, 240) &&
    trimmed(v.strength, 1, 80) &&
    trimmed(v.dosageForm, 1, 80) &&
    typeof v.requiresPrescription === 'boolean' &&
    typeof v.isVisible === 'boolean' &&
    money(v.sellingPrice) &&
    money(v.mrp) &&
    percent(v.discountPercentage) &&
    percent(v.gstPercentage) &&
    (v.fiscalProfile === null || isInventoryFiscalProfile(v.fiscalProfile)) &&
    integer(v.availableQuantity, 0, Number.MAX_SAFE_INTEGER)
  );
}

export function isPosSaleReceipt(value: unknown): value is PosSaleReceipt {
  if (
    !hasExactKeys(value, [
      'saleId',
      'providerId',
      'reservationId',
      'status',
      'currency',
      'pricesIncludeTax',
      'subtotal',
      'discountTotal',
      'taxableTotal',
      'cgstTotal',
      'sgstTotal',
      'igstTotal',
      'cessTotal',
      'grandTotal',
      'cashTendered',
      'changeDue',
      'placeOfSupplyStateCode',
      'recipientName',
      'recipientAddress',
      'recipientGstin',
      'completedAt',
      'voidedAt',
      'lines',
      'payments',
      'invoice',
      'voidRecord',
      'replayed',
    ])
  )
    return false;
  const v = value as Partial<PosSaleReceipt>;
  return (
    isCanonicalUuid(v.saleId) &&
    isCanonicalUuid(v.providerId) &&
    (v.reservationId === null || isCanonicalUuid(v.reservationId)) &&
    (v.status === 'COMPLETED' || v.status === 'VOIDED') &&
    v.currency === 'INR' &&
    typeof v.pricesIncludeTax === 'boolean' &&
    money(v.subtotal) &&
    money(v.discountTotal) &&
    money(v.taxableTotal) &&
    money(v.cgstTotal) &&
    money(v.sgstTotal) &&
    money(v.igstTotal) &&
    money(v.cessTotal) &&
    money(v.grandTotal) &&
    (v.cashTendered === null || money(v.cashTendered)) &&
    (v.changeDue === null || money(v.changeDue)) &&
    typeof v.placeOfSupplyStateCode === 'string' &&
    STATE.test(v.placeOfSupplyStateCode) &&
    (v.recipientName === null || trimmed(v.recipientName, 1, 200)) &&
    (v.recipientAddress === null || trimmed(v.recipientAddress, 1, 500)) &&
    (v.recipientGstin === null ||
      (GSTIN.test(v.recipientGstin) &&
        v.recipientGstin.slice(0, 2) === v.placeOfSupplyStateCode)) &&
    iso(v.completedAt) &&
    (v.voidedAt === null || iso(v.voidedAt)) &&
    Array.isArray(v.lines) &&
    v.lines.length >= 1 &&
    v.lines.length <= 100 &&
    v.lines.every(isReceiptLine) &&
    Array.isArray(v.payments) &&
    v.payments.length >= 1 &&
    v.payments.length <= 4 &&
    v.payments.every(isReceiptPayment) &&
    isInvoice(v.invoice) &&
    (v.voidRecord === null || isVoidRecord(v.voidRecord)) &&
    typeof v.replayed === 'boolean'
  );
}

function isLine(value: unknown): value is PosCheckoutRequest['lines'][number] {
  return (
    hasExactKeys(value, ['productId', 'quantity']) &&
    isCanonicalUuid((value as any).productId) &&
    integer((value as any).quantity, 1, 2147483647)
  );
}
function isPayment(value: unknown): value is PosCheckoutRequest['payments'][number] {
  if (
    !hasOnlyKeys(value, ['method', 'amount', 'externalReference']) ||
    !requiredKeys(value, ['method', 'amount'])
  )
    return false;
  const v = value as any;
  return (
    ['CASH', 'CARD', 'UPI', 'OTHER'].includes(v.method) &&
    money(v.amount) &&
    (v.externalReference === undefined || trimmed(v.externalReference, 1, 80))
  );
}
function isFiscalProfile(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'registrationType',
      'legalName',
      'gstin',
      'stateCode',
      'invoiceSeries',
      'pricesIncludeTax',
      'version',
    ])
  )
    return false;
  const v = value as any;
  return (
    ['GST_REGULAR', 'GST_COMPOSITION', 'UNREGISTERED'].includes(v.registrationType) &&
    trimmed(v.legalName, 1, 200) &&
    (v.gstin === null || GSTIN.test(v.gstin)) &&
    STATE.test(v.stateCode) &&
    SERIES.test(v.invoiceSeries) &&
    typeof v.pricesIncludeTax === 'boolean' &&
    integer(v.version, 1, 2147483647)
  );
}
function isInventoryFiscalProfile(value: unknown): boolean {
  if (!hasExactKeys(value, ['hsnCode', 'uqc', 'cessPercentage', 'version'])) return false;
  const v = value as any;
  return (
    HSN.test(v.hsnCode) &&
    UQC.test(v.uqc) &&
    percent(v.cessPercentage) &&
    integer(v.version, 1, 2147483647)
  );
}
function isReceiptLine(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'lineNumber',
      'productId',
      'quantity',
      'productNameSnapshot',
      'brandSnapshot',
      'strengthSnapshot',
      'dosageFormSnapshot',
      'hsnCodeSnapshot',
      'uqcSnapshot',
      'unitPrice',
      'mrp',
      'grossValue',
      'discountPercentage',
      'discountAmount',
      'taxableValue',
      'gstPercentage',
      'cessPercentage',
      'cgstAmount',
      'sgstAmount',
      'igstAmount',
      'cessAmount',
      'lineTotal',
    ])
  )
    return false;
  const v = value as any;
  return (
    integer(v.lineNumber, 1, 100) &&
    isCanonicalUuid(v.productId) &&
    integer(v.quantity, 1, 2147483647) &&
    trimmed(v.productNameSnapshot, 1, 240) &&
    trimmed(v.brandSnapshot, 1, 240) &&
    trimmed(v.strengthSnapshot, 1, 80) &&
    trimmed(v.dosageFormSnapshot, 1, 80) &&
    HSN.test(v.hsnCodeSnapshot) &&
    UQC.test(v.uqcSnapshot) &&
    money(v.unitPrice) &&
    money(v.mrp) &&
    money(v.grossValue) &&
    percent(v.discountPercentage) &&
    money(v.discountAmount) &&
    money(v.taxableValue) &&
    percent(v.gstPercentage) &&
    percent(v.cessPercentage) &&
    money(v.cgstAmount) &&
    money(v.sgstAmount) &&
    money(v.igstAmount) &&
    money(v.cessAmount) &&
    money(v.lineTotal)
  );
}
function isReceiptPayment(value: unknown): boolean {
  return (
    hasExactKeys(value, ['method', 'amount', 'externalReference']) &&
    ['CASH', 'CARD', 'UPI', 'OTHER'].includes((value as any).method) &&
    money((value as any).amount) &&
    ((value as any).externalReference === null || trimmed((value as any).externalReference, 1, 80))
  );
}
function isInvoice(value: unknown): boolean {
  if (
    !hasExactKeys(value, [
      'id',
      'documentType',
      'financialYear',
      'invoiceNumber',
      'issuedAt',
      'supplierLegalName',
      'supplierAddress',
      'supplierGstin',
      'supplierStateCode',
      'placeOfSupplyStateCode',
      'recipientName',
      'recipientAddress',
      'recipientGstin',
      'subtotal',
      'discountTotal',
      'taxableTotal',
      'cgstTotal',
      'sgstTotal',
      'igstTotal',
      'cessTotal',
      'grandTotal',
      'reprintCount',
    ])
  )
    return false;
  const v = value as any;
  return (
    isCanonicalUuid(v.id) &&
    ['TAX_INVOICE', 'BILL_OF_SUPPLY', 'COMMERCIAL_RECEIPT'].includes(v.documentType) &&
    /^\d{4}-\d{2}$/.test(v.financialYear) &&
    trimmed(v.invoiceNumber, 1, 16) &&
    iso(v.issuedAt) &&
    trimmed(v.supplierLegalName, 1, 200) &&
    trimmed(v.supplierAddress, 1, 500) &&
    (v.supplierGstin === null || GSTIN.test(v.supplierGstin)) &&
    STATE.test(v.supplierStateCode) &&
    STATE.test(v.placeOfSupplyStateCode) &&
    (v.recipientName === null || trimmed(v.recipientName, 1, 200)) &&
    (v.recipientAddress === null || trimmed(v.recipientAddress, 1, 500)) &&
    (v.recipientGstin === null || GSTIN.test(v.recipientGstin)) &&
    money(v.subtotal) &&
    money(v.discountTotal) &&
    money(v.taxableTotal) &&
    money(v.cgstTotal) &&
    money(v.sgstTotal) &&
    money(v.igstTotal) &&
    money(v.cessTotal) &&
    money(v.grandTotal) &&
    integer(v.reprintCount, 0, 2147483647)
  );
}
function isVoidRecord(value: unknown): boolean {
  return (
    hasExactKeys(value, ['reason', 'occurredAt']) &&
    trimmed((value as any).reason, 1, 500) &&
    iso((value as any).occurredAt)
  );
}
function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(),
    expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
function hasOnlyKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key))
  );
}
function requiredKeys(value: unknown, keys: readonly string[]): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}
function trimmed(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= min &&
    value.length <= max
  );
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}
function money(value: unknown): value is string {
  return typeof value === 'string' && MONEY.test(value);
}
function percent(value: unknown): value is string {
  return typeof value === 'string' && PERCENT.test(value) && Number(value) <= 100;
}
function iso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.toISOString() === value;
}
