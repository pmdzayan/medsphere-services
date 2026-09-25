import { isCanonicalUuid } from './inventory-contract';

export type AvailabilityRequestState = 'PENDING' | 'RESPONDED' | 'EXPIRED';
export type AvailabilityResponseOutcome = 'AVAILABLE' | 'UNAVAILABLE' | 'CHECK_LATER';

export interface AvailabilityRequestQueueRow {
  requestId: string;
  productId: string;
  productName: string;
  genericName: string | null;
  brand: string;
  strength: string;
  dosageForm: string;
  status: AvailabilityRequestState;
  requestedAt: string;
  expiresAt: string;
  version: number;
}

export interface AvailabilityRequestQueuePage {
  data: AvailabilityRequestQueueRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface AvailabilityResponseRequest {
  outcome: AvailabilityResponseOutcome;
  idempotencyKey: string;
  expectedVersion: number;
  retryAfterMinutes?: number;
}

export interface AvailabilityResponseReceipt {
  requestId: string;
  outcome: AvailabilityResponseOutcome;
  confirmedAt: string;
  validUntil: string | null;
  retryAfterAt: string | null;
  replayed: boolean;
}

export function isAvailabilityRequestQueuePage(
  value: unknown,
): value is AvailabilityRequestQueuePage {
  if (!isObject(value) || !hasOnlyKeys(value, ['data', 'total', 'limit', 'offset'])) return false;
  return (
    Array.isArray(value.data) &&
    value.data.every(isQueueRow) &&
    integer(value.total, 0, Number.MAX_SAFE_INTEGER) &&
    integer(value.limit, 1, 50) &&
    integer(value.offset, 0, 10_000) &&
    value.data.length <= value.limit
  );
}

export function isAvailabilityResponseRequest(
  value: unknown,
): value is AvailabilityResponseRequest {
  if (
    !isObject(value) ||
    !hasOnlyKeys(value, ['outcome', 'idempotencyKey', 'expectedVersion', 'retryAfterMinutes'])
  )
    return false;
  if (
    !(
      value.outcome === 'AVAILABLE' ||
      value.outcome === 'UNAVAILABLE' ||
      value.outcome === 'CHECK_LATER'
    ) ||
    typeof value.idempotencyKey !== 'string' ||
    value.idempotencyKey.trim() !== value.idempotencyKey ||
    value.idempotencyKey.length < 1 ||
    value.idempotencyKey.length > 120 ||
    !integer(value.expectedVersion, 1, 2_147_483_647)
  )
    return false;
  if (value.outcome === 'CHECK_LATER') {
    return integer(value.retryAfterMinutes, 5, 1440);
  }
  return value.retryAfterMinutes === undefined;
}

export function isAvailabilityResponseReceipt(
  value: unknown,
): value is AvailabilityResponseReceipt {
  return (
    isObject(value) &&
    hasOnlyKeys(value, [
      'requestId',
      'outcome',
      'confirmedAt',
      'validUntil',
      'retryAfterAt',
      'replayed',
    ]) &&
    isCanonicalUuid(value.requestId) &&
    (value.outcome === 'AVAILABLE' ||
      value.outcome === 'UNAVAILABLE' ||
      value.outcome === 'CHECK_LATER') &&
    iso(value.confirmedAt) &&
    (value.validUntil === null || iso(value.validUntil)) &&
    (value.retryAfterAt === null || iso(value.retryAfterAt)) &&
    typeof value.replayed === 'boolean'
  );
}

function isQueueRow(value: unknown): value is AvailabilityRequestQueueRow {
  return (
    isObject(value) &&
    hasOnlyKeys(value, [
      'requestId',
      'productId',
      'productName',
      'genericName',
      'brand',
      'strength',
      'dosageForm',
      'status',
      'requestedAt',
      'expiresAt',
      'version',
    ]) &&
    isCanonicalUuid(value.requestId) &&
    isCanonicalUuid(value.productId) &&
    text(value.productName) &&
    (value.genericName === null || text(value.genericName)) &&
    text(value.brand) &&
    text(value.strength) &&
    text(value.dosageForm) &&
    (value.status === 'PENDING' || value.status === 'RESPONDED' || value.status === 'EXPIRED') &&
    iso(value.requestedAt) &&
    iso(value.expiresAt) &&
    integer(value.version, 1, 2_147_483_647)
  );
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}
function integer(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 240;
}
function iso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
