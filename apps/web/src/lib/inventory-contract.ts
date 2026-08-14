export interface ProviderAccess {
  membershipId: string;
  providerId: string;
  businessName: string;
  providerType: 'PHARMACY' | 'HOSPITAL';
  isActive: boolean;
}

export interface InventoryBatchStock {
  id: string;
  batchNumber: string;
  expiryDate: string;
  manufacturingDate: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'EXHAUSTED' | 'QUARANTINED';
  version: number;
  onHandQuantity: number;
  heldQuantity: number;
  availableQuantity: number;
}

export const BATCH_QUARANTINE_REASONS = [
  'QUALITY_SUSPECT',
  'TEMPERATURE_EXCURSION',
  'PACKAGING_COMPROMISED',
  'STORAGE_DEVIATION',
] as const;

export type BatchQuarantineReason = (typeof BATCH_QUARANTINE_REASONS)[number];

export interface BatchQuarantineRequest {
  expectedVersion: number;
  idempotencyKey: string;
  reasonCode: BatchQuarantineReason;
}

export interface BatchQuarantineResponse {
  batchId: string;
  status: 'QUARANTINED';
  reasonCode: BatchQuarantineReason;
  onHandQuantity: number;
  affectedReservationCount: number;
  releasedUnitCount: number;
  resultingBatchVersion: number;
  occurredAt: string;
  replayed: boolean;
}

export interface DamagedStockRequest {
  expectedVersion: number;
  quantity: number;
  idempotencyKey: string;
  reason: string;
}

export interface DamagedStockResponse {
  providerId: string;
  inventoryId: string;
  productId: string;
  batchId: string;
  movementId: string;
  quantity: number;
  onHandBefore: number;
  onHandAfter: number;
  resultingBatchVersion: number;
  occurredAt: string;
  replayed: boolean;
}

export interface InventoryStockItem {
  inventoryId: string;
  productId: string;
  name: string;
  genericName: string | null;
  brand: string;
  sku: string | null;
  sellingPrice: string;
  mrp: string;
  isVisible: boolean;
  totalOnHandQuantity: number;
  totalHeldQuantity: number;
  totalAvailableQuantity: number;
  batches: InventoryBatchStock[];
}

export interface InventoryStockPage {
  data: InventoryStockItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface InventoryStockFilters {
  providerId: string;
  query?: string;
  limit?: number;
  offset?: number;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const decimalCurrency = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidV4.test(value);
}

export function isProviderAccessList(value: unknown): value is ProviderAccess[] {
  return Array.isArray(value) && value.every(isProviderAccess);
}

export function isInventoryStockPage(value: unknown): value is InventoryStockPage {
  if (!hasExactKeys(value, ['data', 'total', 'limit', 'offset'])) return false;
  const page = value as Partial<InventoryStockPage>;
  return (
    Array.isArray(page.data) &&
    page.data.every(isInventoryStockItem) &&
    isIntegerBetween(page.total, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerBetween(page.limit, 1, 100) &&
    isIntegerBetween(page.offset, 0, 10_000) &&
    page.data.length <= Number(page.limit) &&
    page.data.length <= Math.max(Number(page.total) - Number(page.offset), 0)
  );
}

export function isBatchQuarantineRequest(value: unknown): value is BatchQuarantineRequest {
  if (!hasExactKeys(value, ['expectedVersion', 'idempotencyKey', 'reasonCode'])) return false;
  const request = value as Partial<BatchQuarantineRequest>;
  return (
    isIntegerBetween(request.expectedVersion, 1, 2_147_483_647) &&
    typeof request.idempotencyKey === 'string' &&
    request.idempotencyKey === request.idempotencyKey.trim() &&
    request.idempotencyKey.length >= 8 &&
    request.idempotencyKey.length <= 120 &&
    BATCH_QUARANTINE_REASONS.includes(request.reasonCode as BatchQuarantineReason)
  );
}

export function isBatchQuarantineResponse(value: unknown): value is BatchQuarantineResponse {
  if (
    !hasExactKeys(value, [
      'batchId',
      'status',
      'reasonCode',
      'onHandQuantity',
      'affectedReservationCount',
      'releasedUnitCount',
      'resultingBatchVersion',
      'occurredAt',
      'replayed',
    ])
  ) {
    return false;
  }
  const receipt = value as Partial<BatchQuarantineResponse>;
  return (
    isCanonicalUuid(receipt.batchId) &&
    receipt.status === 'QUARANTINED' &&
    BATCH_QUARANTINE_REASONS.includes(receipt.reasonCode as BatchQuarantineReason) &&
    isQuantity(receipt.onHandQuantity) &&
    isQuantity(receipt.affectedReservationCount) &&
    isQuantity(receipt.releasedUnitCount) &&
    isIntegerBetween(receipt.resultingBatchVersion, 1, 2_147_483_647) &&
    isIsoDateTime(receipt.occurredAt) &&
    typeof receipt.replayed === 'boolean'
  );
}

export function isDamagedStockRequest(value: unknown): value is DamagedStockRequest {
  if (!hasExactKeys(value, ['expectedVersion', 'quantity', 'idempotencyKey', 'reason'])) {
    return false;
  }
  const request = value as Partial<DamagedStockRequest>;
  return (
    isIntegerBetween(request.expectedVersion, 1, 2_147_483_647) &&
    isIntegerBetween(request.quantity, 1, 2_147_483_647) &&
    isTrimmedBoundedString(request.idempotencyKey, 1, 120) &&
    isTrimmedBoundedString(request.reason, 1, 500)
  );
}

export function isDamagedStockResponse(value: unknown): value is DamagedStockResponse {
  if (
    !hasExactKeys(value, [
      'providerId',
      'inventoryId',
      'productId',
      'batchId',
      'movementId',
      'quantity',
      'onHandBefore',
      'onHandAfter',
      'resultingBatchVersion',
      'occurredAt',
      'replayed',
    ])
  ) {
    return false;
  }
  const receipt = value as Partial<DamagedStockResponse>;
  return (
    isCanonicalUuid(receipt.providerId) &&
    isCanonicalUuid(receipt.inventoryId) &&
    isCanonicalUuid(receipt.productId) &&
    isCanonicalUuid(receipt.batchId) &&
    isCanonicalUuid(receipt.movementId) &&
    isIntegerBetween(receipt.quantity, 1, 2_147_483_647) &&
    isIntegerBetween(receipt.onHandBefore, 1, Number.MAX_SAFE_INTEGER) &&
    isQuantity(receipt.onHandAfter) &&
    Number(receipt.onHandAfter) === Number(receipt.onHandBefore) - Number(receipt.quantity) &&
    isIntegerBetween(receipt.resultingBatchVersion, 1, 2_147_483_647) &&
    isIsoDateTime(receipt.occurredAt) &&
    typeof receipt.replayed === 'boolean'
  );
}

export function toInventoryStockSearchParams(filters: InventoryStockFilters): URLSearchParams {
  const search = new URLSearchParams({ providerId: filters.providerId });
  if (filters.query) search.set('query', filters.query);
  if (filters.limit !== undefined) search.set('limit', String(filters.limit));
  if (filters.offset !== undefined) search.set('offset', String(filters.offset));
  return search;
}

function isProviderAccess(value: unknown): value is ProviderAccess {
  if (
    !hasExactKeys(value, ['membershipId', 'providerId', 'businessName', 'providerType', 'isActive'])
  ) {
    return false;
  }
  const provider = value as Partial<ProviderAccess>;
  return (
    isCanonicalUuid(provider.membershipId) &&
    isCanonicalUuid(provider.providerId) &&
    isBoundedString(provider.businessName, 200) &&
    (provider.providerType === 'PHARMACY' || provider.providerType === 'HOSPITAL') &&
    typeof provider.isActive === 'boolean'
  );
}

function isInventoryStockItem(value: unknown): value is InventoryStockItem {
  if (
    !hasExactKeys(value, [
      'inventoryId',
      'productId',
      'name',
      'genericName',
      'brand',
      'sku',
      'sellingPrice',
      'mrp',
      'isVisible',
      'totalOnHandQuantity',
      'totalHeldQuantity',
      'totalAvailableQuantity',
      'batches',
    ])
  ) {
    return false;
  }
  const item = value as Partial<InventoryStockItem>;
  if (
    !isCanonicalUuid(item.inventoryId) ||
    !isCanonicalUuid(item.productId) ||
    !isBoundedString(item.name, 240) ||
    !(item.genericName === null || isBoundedString(item.genericName, 240)) ||
    !isBoundedString(item.brand, 240) ||
    !(item.sku === null || isBoundedString(item.sku, 120)) ||
    !isCurrency(item.sellingPrice) ||
    !isCurrency(item.mrp) ||
    typeof item.isVisible !== 'boolean' ||
    !isQuantity(item.totalOnHandQuantity) ||
    !isQuantity(item.totalHeldQuantity) ||
    !isQuantity(item.totalAvailableQuantity) ||
    Number(item.totalHeldQuantity) > Number(item.totalOnHandQuantity) ||
    Number(item.totalAvailableQuantity) >
      Number(item.totalOnHandQuantity) - Number(item.totalHeldQuantity) ||
    !Array.isArray(item.batches) ||
    !item.batches.every(isInventoryBatchStock)
  ) {
    return false;
  }
  return (
    sum(item.batches, 'onHandQuantity') === item.totalOnHandQuantity &&
    sum(item.batches, 'heldQuantity') === item.totalHeldQuantity &&
    sum(item.batches, 'availableQuantity') === item.totalAvailableQuantity
  );
}

function isInventoryBatchStock(value: unknown): value is InventoryBatchStock {
  if (
    !hasExactKeys(value, [
      'id',
      'batchNumber',
      'expiryDate',
      'manufacturingDate',
      'status',
      'version',
      'onHandQuantity',
      'heldQuantity',
      'availableQuantity',
    ])
  ) {
    return false;
  }
  const batch = value as Partial<InventoryBatchStock>;
  return (
    isCanonicalUuid(batch.id) &&
    isBoundedString(batch.batchNumber, 120) &&
    isIsoDateTime(batch.expiryDate) &&
    (batch.manufacturingDate === null || isIsoDateTime(batch.manufacturingDate)) &&
    (batch.status === 'ACTIVE' ||
      batch.status === 'EXPIRED' ||
      batch.status === 'EXHAUSTED' ||
      batch.status === 'QUARANTINED') &&
    isIntegerBetween(batch.version, 1, 2_147_483_647) &&
    isQuantity(batch.onHandQuantity) &&
    isQuantity(batch.heldQuantity) &&
    isQuantity(batch.availableQuantity) &&
    Number(batch.heldQuantity) <= Number(batch.onHandQuantity) &&
    Number(batch.availableQuantity) <= Number(batch.onHandQuantity) - Number(batch.heldQuantity) &&
    (batch.status === 'ACTIVE' || batch.availableQuantity === 0)
  );
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTrimmedBoundedString(
  value: unknown,
  minLength: number,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length >= minLength &&
    value.length <= maxLength
  );
}

function isCurrency(value: unknown): value is string {
  return typeof value === 'string' && decimalCurrency.test(value);
}

function isQuantity(value: unknown): value is number {
  return isIntegerBetween(value, 0, Number.MAX_SAFE_INTEGER);
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function sum(
  batches: InventoryBatchStock[],
  key: 'onHandQuantity' | 'heldQuantity' | 'availableQuantity',
): number {
  return batches.reduce((total, batch) => total + batch[key], 0);
}
