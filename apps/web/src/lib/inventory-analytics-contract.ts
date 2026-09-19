/**
 * Candidate Task 0038 (PROVISIONAL). See
 * docs/candidates/0038-pharmacy-inventory-analytics-provisional.md
 *
 * Independently validates the backend response -- this contract does
 * NOT trust the Nest response merely because both live in the same
 * repository. Uses the actual finalized backend field names; no
 * frontend-only aliases were invented.
 */
export const NEAR_EXPIRY_HORIZONS = [7, 30, 60, 90] as const;
export type NearExpiryHorizon = (typeof NEAR_EXPIRY_HORIZONS)[number];

export const ATTENTION_ITEM_TYPES = ['NEAR_EXPIRY_BATCH'] as const;
export type AttentionItemType = (typeof ATTENTION_ITEM_TYPES)[number];

export const ATTENTION_ITEM_SEVERITIES = ['ATTENTION'] as const;
export type AttentionItemSeverity = (typeof ATTENTION_ITEM_SEVERITIES)[number];

const ATTENTION_ITEM_MAX = 50;

export interface InventoryAnalyticsSummary {
  readonly distinctProductCount: number;
  readonly activeBatchCount: number;
  readonly availableQuantity: number;
  readonly heldQuantity: number;
  readonly unavailableProductCount: number;
  readonly lowStockProductCount: number | null;
}

export interface ReservationAnalyticsSummary {
  readonly pending: number;
  readonly confirmed: number;
  readonly ready: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly expired: number;
  readonly activeCount: number;
  readonly heldQuantity: number;
}

export interface ExpiryAnalyticsSummary {
  readonly expiredBatchCount: number;
  readonly nearExpiryBatchCount: number;
  readonly horizonDays: number;
}

export interface QualityAnalyticsSummary {
  readonly quarantinedBatchCount: number;
  readonly damagedMovementCount: number;
}

export interface TransferAnalyticsSummary {
  readonly completedCount: number;
}

export interface InventoryAttentionItem {
  readonly id: string;
  readonly type: AttentionItemType;
  readonly severity: AttentionItemSeverity;
  readonly providerId: string;
  readonly sourceResourceType: 'Batch';
  readonly sourceResourceId: string;
  readonly occurredAt: string | null;
  readonly dueAt: string | null;
}

export interface InventoryAnalyticsResponse {
  readonly providerId: string;
  readonly generatedAt: string;
  readonly inventory: InventoryAnalyticsSummary;
  readonly reservations: ReservationAnalyticsSummary;
  readonly expiry: ExpiryAnalyticsSummary;
  readonly quality: QualityAnalyticsSummary;
  readonly transfers: TransferAnalyticsSummary;
  readonly attentionItems: InventoryAttentionItem[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

/** Every count/quantity: number, finite, integer, non-negative, safe. */
function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value) && value >= 0
  );
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((k) => keys.includes(k));
}

function isInventoryAnalyticsSummary(value: unknown): value is InventoryAnalyticsSummary {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'distinctProductCount',
      'activeBatchCount',
      'availableQuantity',
      'heldQuantity',
      'unavailableProductCount',
      'lowStockProductCount',
    ])
  ) {
    return false;
  }
  return (
    isSafeNonNegativeInteger(value.distinctProductCount) &&
    isSafeNonNegativeInteger(value.activeBatchCount) &&
    isSafeNonNegativeInteger(value.availableQuantity) &&
    isSafeNonNegativeInteger(value.heldQuantity) &&
    isSafeNonNegativeInteger(value.unavailableProductCount) &&
    (value.lowStockProductCount === null || isSafeNonNegativeInteger(value.lowStockProductCount))
  );
}

function isReservationAnalyticsSummary(value: unknown): value is ReservationAnalyticsSummary {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'pending',
      'confirmed',
      'ready',
      'completed',
      'cancelled',
      'expired',
      'activeCount',
      'heldQuantity',
    ])
  ) {
    return false;
  }
  return Object.values(value).every(isSafeNonNegativeInteger);
}

function isExpiryAnalyticsSummary(value: unknown): value is ExpiryAnalyticsSummary {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['expiredBatchCount', 'nearExpiryBatchCount', 'horizonDays'])) {
    return false;
  }
  return (
    isSafeNonNegativeInteger(value.expiredBatchCount) &&
    isSafeNonNegativeInteger(value.nearExpiryBatchCount) &&
    typeof value.horizonDays === 'number' &&
    (NEAR_EXPIRY_HORIZONS as readonly number[]).includes(value.horizonDays)
  );
}

function isQualityAnalyticsSummary(value: unknown): value is QualityAnalyticsSummary {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['quarantinedBatchCount', 'damagedMovementCount'])) return false;
  return (
    isSafeNonNegativeInteger(value.quarantinedBatchCount) &&
    isSafeNonNegativeInteger(value.damagedMovementCount)
  );
}

function isTransferAnalyticsSummary(value: unknown): value is TransferAnalyticsSummary {
  if (!isRecord(value)) return false;
  if (!hasExactKeys(value, ['completedCount'])) return false;
  return isSafeNonNegativeInteger(value.completedCount);
}

function isInventoryAttentionItem(value: unknown): value is InventoryAttentionItem {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'id',
      'type',
      'severity',
      'providerId',
      'sourceResourceType',
      'sourceResourceId',
      'occurredAt',
      'dueAt',
    ])
  ) {
    return false;
  }
  return (
    isUuid(value.id) &&
    typeof value.type === 'string' &&
    (ATTENTION_ITEM_TYPES as readonly string[]).includes(value.type) &&
    typeof value.severity === 'string' &&
    (ATTENTION_ITEM_SEVERITIES as readonly string[]).includes(value.severity) &&
    isUuid(value.providerId) &&
    // The backend currently only ever sources attention items from
    // Batch -- an arbitrary non-empty string is no longer accepted
    // here (correction: this field is machine-oriented, not free
    // presentation text, so its value space is exactly as narrow as
    // what the backend actually emits).
    value.sourceResourceType === 'Batch' &&
    isUuid(value.sourceResourceId) &&
    (value.occurredAt === null || isIsoTimestamp(value.occurredAt)) &&
    (value.dueAt === null || isIsoTimestamp(value.dueAt))
  );
}

export function isInventoryAnalyticsResponse(value: unknown): value is InventoryAnalyticsResponse {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(value, [
      'providerId',
      'generatedAt',
      'inventory',
      'reservations',
      'expiry',
      'quality',
      'transfers',
      'attentionItems',
    ])
  ) {
    return false;
  }
  return (
    isUuid(value.providerId) &&
    isIsoTimestamp(value.generatedAt) &&
    isInventoryAnalyticsSummary(value.inventory) &&
    isReservationAnalyticsSummary(value.reservations) &&
    isExpiryAnalyticsSummary(value.expiry) &&
    isQualityAnalyticsSummary(value.quality) &&
    isTransferAnalyticsSummary(value.transfers) &&
    Array.isArray(value.attentionItems) &&
    value.attentionItems.length <= ATTENTION_ITEM_MAX &&
    value.attentionItems.every(isInventoryAttentionItem)
  );
}
