import { isCanonicalUuid } from './inventory-contract';

export const INVENTORY_IMPORT_FIELDS = [
  'productId',
  'identifier',
  'productName',
  'brand',
  'manufacturer',
  'strength',
  'dosageForm',
  'sku',
  'sellingPrice',
  'mrp',
  'discountPercentage',
  'taxPercentage',
  'minimumStockLevel',
  'isVisible',
  'batchNumber',
  'manufacturingDate',
  'expiryDate',
  'quantity',
  'purchasePrice',
] as const;

export type InventoryImportField = (typeof INVENTORY_IMPORT_FIELDS)[number];

export interface InventoryCatalogIdentifier {
  type: 'GTIN' | 'EAN' | 'UPC';
  value: string;
  normalizedValue: string;
  isPrimary: boolean;
}

export interface InventoryCatalogProduct {
  id: string;
  name: string;
  genericName: string | null;
  brand: string;
  manufacturer: string;
  dosageForm: string;
  strength: string;
  barcode: string | null;
  requiresPrescription: boolean;
  identifiers: InventoryCatalogIdentifier[];
}

export interface InventoryCatalogResponse {
  mode: 'IDENTIFIER' | 'MANUAL';
  canonicalIdentifier: string | null;
  data: InventoryCatalogProduct[];
}

export interface InventoryImportStageRowRequest {
  rowNumber: number;
  productId?: string;
  identifier?: string;
  productName?: string;
  brand?: string;
  manufacturer?: string;
  strength?: string;
  dosageForm?: string;
  sku?: string;
  sellingPrice?: string;
  mrp?: string;
  discountPercentage?: string;
  taxPercentage?: string;
  minimumStockLevel?: string;
  isVisible?: string;
  batchNumber?: string;
  manufacturingDate?: string;
  expiryDate?: string;
  quantity?: string;
  purchasePrice?: string;
}

export interface StageInventoryImportRequest {
  sourceFormat: 'CSV' | 'XLSX';
  sourceFileName: string;
  contentHash: string;
  stageIdempotencyKey: string;
  mapping: Record<string, InventoryImportField>;
  rows: InventoryImportStageRowRequest[];
}

export interface InventoryImportPreviewRow {
  rowId: string;
  rowNumber: number;
  productId: string | null;
  payload: {
    sku: string | null;
    sellingPrice: string;
    mrp: string;
    discountPercentage: string;
    taxPercentage: string;
    minimumStockLevel: number;
    isVisible: boolean;
    batchNumber: string;
    manufacturingDate: string | null;
    expiryDate: string;
    quantity: number;
    purchasePrice: string;
    expectedInventoryVersion: number | null;
  };
  validationErrors: string[];
  status: 'VALID' | 'INVALID' | 'APPLIED';
  inventoryId: string | null;
  batchId: string | null;
}

export interface InventoryImportPreview {
  importJobId: string;
  providerId: string;
  sourceFormat: 'CSV' | 'XLSX';
  sourceFileName: string;
  status: 'STAGED' | 'APPLIED';
  rowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  createdAt: string;
  appliedAt: string | null;
  replayed: boolean;
  receipt: {
    id: string;
    appliedRowCount: number;
    totalQuantity: number;
  } | null;
  rows: InventoryImportPreviewRow[];
}

export interface ApplyInventoryImportRequest {
  idempotencyKey: string;
}

export interface InventoryImportApplyReceipt {
  receiptId: string;
  appliedRowCount: number;
  totalQuantity: number;
  replayed: boolean;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;

export function isInventoryCatalogResponse(value: unknown): value is InventoryCatalogResponse {
  if (!hasExactKeys(value, ['mode', 'canonicalIdentifier', 'data'])) return false;
  const response = value as Partial<InventoryCatalogResponse>;
  return (
    (response.mode === 'IDENTIFIER' || response.mode === 'MANUAL') &&
    (response.canonicalIdentifier === null ||
      isTrimmedString(response.canonicalIdentifier, 1, 32)) &&
    Array.isArray(response.data) &&
    response.data.length <= 50 &&
    response.data.every(isCatalogProduct)
  );
}

export function isStageInventoryImportRequest(
  value: unknown,
): value is StageInventoryImportRequest {
  if (
    !hasExactKeys(value, [
      'sourceFormat',
      'sourceFileName',
      'contentHash',
      'stageIdempotencyKey',
      'mapping',
      'rows',
    ])
  ) {
    return false;
  }
  const command = value as Partial<StageInventoryImportRequest>;
  if (
    (command.sourceFormat !== 'CSV' && command.sourceFormat !== 'XLSX') ||
    !isTrimmedString(command.sourceFileName, 1, 255) ||
    typeof command.contentHash !== 'string' ||
    !SHA256_HEX.test(command.contentHash) ||
    !isTrimmedString(command.stageIdempotencyKey, 1, 120) ||
    !isImportMapping(command.mapping) ||
    !Array.isArray(command.rows) ||
    command.rows.length < 1 ||
    command.rows.length > 500 ||
    !command.rows.every(isImportStageRow)
  ) {
    return false;
  }
  return new Set(command.rows.map(({ rowNumber }) => rowNumber)).size === command.rows.length;
}

export function isInventoryImportPreview(value: unknown): value is InventoryImportPreview {
  if (
    !hasExactKeys(value, [
      'importJobId',
      'providerId',
      'sourceFormat',
      'sourceFileName',
      'status',
      'rowCount',
      'validRowCount',
      'invalidRowCount',
      'createdAt',
      'appliedAt',
      'replayed',
      'receipt',
      'rows',
    ])
  ) {
    return false;
  }
  const preview = value as Partial<InventoryImportPreview>;
  return (
    isCanonicalUuid(preview.importJobId) &&
    isCanonicalUuid(preview.providerId) &&
    (preview.sourceFormat === 'CSV' || preview.sourceFormat === 'XLSX') &&
    isTrimmedString(preview.sourceFileName, 1, 255) &&
    (preview.status === 'STAGED' || preview.status === 'APPLIED') &&
    isInteger(preview.rowCount, 1, 500) &&
    isInteger(preview.validRowCount, 0, 500) &&
    isInteger(preview.invalidRowCount, 0, 500) &&
    Number(preview.validRowCount) + Number(preview.invalidRowCount) === Number(preview.rowCount) &&
    isIsoDate(preview.createdAt) &&
    (preview.appliedAt === null || isIsoDate(preview.appliedAt)) &&
    typeof preview.replayed === 'boolean' &&
    (preview.receipt === null || isImportReceipt(preview.receipt)) &&
    Array.isArray(preview.rows) &&
    preview.rows.length === preview.rowCount &&
    preview.rows.every(isImportPreviewRow)
  );
}

export function isApplyInventoryImportRequest(
  value: unknown,
): value is ApplyInventoryImportRequest {
  return (
    hasExactKeys(value, ['idempotencyKey']) &&
    isTrimmedString((value as Partial<ApplyInventoryImportRequest>).idempotencyKey, 1, 120)
  );
}

export function isInventoryImportApplyReceipt(
  value: unknown,
): value is InventoryImportApplyReceipt {
  if (!hasExactKeys(value, ['receiptId', 'appliedRowCount', 'totalQuantity', 'replayed'])) {
    return false;
  }
  const receipt = value as Partial<InventoryImportApplyReceipt>;
  return (
    isCanonicalUuid(receipt.receiptId) &&
    isInteger(receipt.appliedRowCount, 1, 500) &&
    isInteger(receipt.totalQuantity, 1, Number.MAX_SAFE_INTEGER) &&
    typeof receipt.replayed === 'boolean'
  );
}

function isCatalogProduct(value: unknown): value is InventoryCatalogProduct {
  if (
    !hasExactKeys(value, [
      'id',
      'name',
      'genericName',
      'brand',
      'manufacturer',
      'dosageForm',
      'strength',
      'barcode',
      'requiresPrescription',
      'identifiers',
    ])
  ) {
    return false;
  }
  const product = value as Partial<InventoryCatalogProduct>;
  return (
    isCanonicalUuid(product.id) &&
    isTrimmedString(product.name, 1, 240) &&
    (product.genericName === null || isTrimmedString(product.genericName, 1, 240)) &&
    isTrimmedString(product.brand, 1, 240) &&
    isTrimmedString(product.manufacturer, 1, 240) &&
    isTrimmedString(product.dosageForm, 1, 80) &&
    isTrimmedString(product.strength, 1, 80) &&
    (product.barcode === null || isTrimmedString(product.barcode, 1, 64)) &&
    typeof product.requiresPrescription === 'boolean' &&
    Array.isArray(product.identifiers) &&
    product.identifiers.length <= 20 &&
    product.identifiers.every(isCatalogIdentifier)
  );
}

function isCatalogIdentifier(value: unknown): value is InventoryCatalogIdentifier {
  if (!hasExactKeys(value, ['type', 'value', 'normalizedValue', 'isPrimary'])) return false;
  const identifier = value as Partial<InventoryCatalogIdentifier>;
  return (
    (identifier.type === 'GTIN' || identifier.type === 'EAN' || identifier.type === 'UPC') &&
    isTrimmedString(identifier.value, 1, 32) &&
    isTrimmedString(identifier.normalizedValue, 1, 32) &&
    typeof identifier.isPrimary === 'boolean'
  );
}

function isImportMapping(value: unknown): value is Record<string, InventoryImportField> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 32) return false;
  const targets = new Set<string>();
  for (const [header, target] of entries) {
    if (
      !isTrimmedString(header, 1, 120) ||
      typeof target !== 'string' ||
      !INVENTORY_IMPORT_FIELDS.includes(target as InventoryImportField) ||
      targets.has(target)
    ) {
      return false;
    }
    targets.add(target);
  }
  return true;
}

function isImportStageRow(value: unknown): value is InventoryImportStageRowRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const allowed = new Set(['rowNumber', ...INVENTORY_IMPORT_FIELDS]);
  if (Object.keys(row).some((key) => !allowed.has(key))) return false;
  if (!isInteger(row.rowNumber, 1, Number.MAX_SAFE_INTEGER)) return false;
  if (row.productId !== undefined && !isCanonicalUuid(row.productId)) return false;

  const bounds: Record<string, number> = {
    identifier: 64,
    productName: 160,
    brand: 160,
    manufacturer: 160,
    strength: 80,
    dosageForm: 80,
    sku: 120,
    sellingPrice: 32,
    mrp: 32,
    discountPercentage: 16,
    taxPercentage: 16,
    minimumStockLevel: 16,
    isVisible: 16,
    batchNumber: 120,
    manufacturingDate: 32,
    expiryDate: 32,
    quantity: 16,
    purchasePrice: 32,
  };
  return Object.entries(bounds).every(
    ([key, max]) => row[key] === undefined || isTrimmedString(row[key], 1, max),
  );
}

function isImportPreviewRow(value: unknown): value is InventoryImportPreviewRow {
  if (
    !hasExactKeys(value, [
      'rowId',
      'rowNumber',
      'productId',
      'payload',
      'validationErrors',
      'status',
      'inventoryId',
      'batchId',
    ])
  ) {
    return false;
  }
  const row = value as Partial<InventoryImportPreviewRow>;
  return (
    isCanonicalUuid(row.rowId) &&
    isInteger(row.rowNumber, 1, Number.MAX_SAFE_INTEGER) &&
    (row.productId === null || isCanonicalUuid(row.productId)) &&
    isImportPayload(row.payload) &&
    Array.isArray(row.validationErrors) &&
    row.validationErrors.length <= 32 &&
    row.validationErrors.every((error) => isTrimmedString(error, 1, 80)) &&
    (row.status === 'VALID' || row.status === 'INVALID' || row.status === 'APPLIED') &&
    (row.inventoryId === null || isCanonicalUuid(row.inventoryId)) &&
    (row.batchId === null || isCanonicalUuid(row.batchId))
  );
}

function isImportPayload(value: unknown): value is InventoryImportPreviewRow['payload'] {
  if (
    !hasExactKeys(value, [
      'sku',
      'sellingPrice',
      'mrp',
      'discountPercentage',
      'taxPercentage',
      'minimumStockLevel',
      'isVisible',
      'batchNumber',
      'manufacturingDate',
      'expiryDate',
      'quantity',
      'purchasePrice',
      'expectedInventoryVersion',
    ])
  ) {
    return false;
  }
  const payload = value as Partial<InventoryImportPreviewRow['payload']>;
  return (
    (payload.sku === null || isTrimmedString(payload.sku, 1, 120)) &&
    isTrimmedString(payload.sellingPrice, 1, 32) &&
    isTrimmedString(payload.mrp, 1, 32) &&
    isTrimmedString(payload.discountPercentage, 1, 16) &&
    isTrimmedString(payload.taxPercentage, 1, 16) &&
    isInteger(payload.minimumStockLevel, 0, Number.MAX_SAFE_INTEGER) &&
    typeof payload.isVisible === 'boolean' &&
    typeof payload.batchNumber === 'string' &&
    payload.batchNumber.length <= 120 &&
    (payload.manufacturingDate === null || isIsoDate(payload.manufacturingDate)) &&
    isIsoDate(payload.expiryDate) &&
    isInteger(payload.quantity, 0, Number.MAX_SAFE_INTEGER) &&
    isTrimmedString(payload.purchasePrice, 1, 32) &&
    (payload.expectedInventoryVersion === null ||
      isInteger(payload.expectedInventoryVersion, 1, Number.MAX_SAFE_INTEGER))
  );
}

function isImportReceipt(value: unknown): boolean {
  if (!hasExactKeys(value, ['id', 'appliedRowCount', 'totalQuantity'])) return false;
  const receipt = value as Record<string, unknown>;
  return (
    isCanonicalUuid(receipt.id) &&
    isInteger(receipt.appliedRowCount, 1, 500) &&
    isInteger(receipt.totalQuantity, 1, Number.MAX_SAFE_INTEGER)
  );
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isTrimmedString(value: unknown, min: number, max: number): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= min &&
    value.length <= max
  );
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
