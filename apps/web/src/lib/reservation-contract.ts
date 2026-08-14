import { isCanonicalUuid } from './inventory-contract';

export const RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];
export type ReservationAllocationStatus = 'HELD' | 'CONSUMED' | 'RELEASED';
export const RESERVATION_TRANSITIONS = ['CONFIRM', 'READY', 'COMPLETE', 'CANCEL'] as const;
export type ReservationTransition = (typeof RESERVATION_TRANSITIONS)[number];

export interface ReservationTransitionRequest {
  transition: ReservationTransition;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface ReservationTransitionResponse {
  reservationId: string;
  status: 'CONFIRMED' | 'READY' | 'COMPLETED' | 'CANCELLED';
  version: number;
  totalQuantity: number;
  replayed: boolean;
}

export interface ReservationCreationItemRequest {
  productId: string;
  quantity: number;
}

export interface ReservationCreationRequest {
  subjectUserId: string;
  expiresAt: string;
  items: ReservationCreationItemRequest[];
  idempotencyKey: string;
}

export interface ReservationCreationResponse {
  reservationId: string;
  status: 'PENDING';
  version: number;
  itemCount: number;
  totalQuantity: number;
  replayed: boolean;
}

export interface ReservationAllocation {
  batchId: string;
  batchNumber: string;
  quantity: number;
  status: ReservationAllocationStatus;
}

export interface ReservationItem {
  productId: string;
  name: string;
  genericName: string | null;
  brand: string;
  quantity: number;
  allocations: ReservationAllocation[];
}

export interface ProviderReservation {
  id: string;
  status: ReservationStatus;
  version: number;
  expiresAt: string;
  createdAt: string;
  items: ReservationItem[];
  totalQuantity: number;
}

export interface ProviderReservationPage {
  data: ProviderReservation[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReservationFilters {
  providerId: string;
  status?: ReservationStatus;
  limit?: number;
  offset?: number;
}

export function isProviderReservationPage(value: unknown): value is ProviderReservationPage {
  if (!hasExactKeys(value, ['data', 'total', 'limit', 'offset'])) return false;
  const page = value as Partial<ProviderReservationPage>;
  return (
    Array.isArray(page.data) &&
    page.data.every(isProviderReservation) &&
    isIntegerBetween(page.total, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerBetween(page.limit, 1, 100) &&
    isIntegerBetween(page.offset, 0, 10_000) &&
    page.data.length <= Number(page.limit) &&
    page.data.length <= Math.max(Number(page.total) - Number(page.offset), 0)
  );
}

export function toReservationSearchParams(filters: ReservationFilters): URLSearchParams {
  const search = new URLSearchParams({ providerId: filters.providerId });
  if (filters.status) search.set('status', filters.status);
  if (filters.limit !== undefined) search.set('limit', String(filters.limit));
  if (filters.offset !== undefined) search.set('offset', String(filters.offset));
  return search;
}

export function isReservationTransitionRequest(
  value: unknown,
): value is ReservationTransitionRequest {
  if (!hasExactKeys(value, ['transition', 'expectedVersion', 'idempotencyKey'])) return false;
  const request = value as Partial<ReservationTransitionRequest>;
  return (
    RESERVATION_TRANSITIONS.includes(request.transition as ReservationTransition) &&
    isIntegerBetween(request.expectedVersion, 1, 2_147_483_647) &&
    typeof request.idempotencyKey === 'string' &&
    request.idempotencyKey === request.idempotencyKey.trim() &&
    request.idempotencyKey.length >= 1 &&
    request.idempotencyKey.length <= 120
  );
}

export function isReservationTransitionResponse(
  value: unknown,
): value is ReservationTransitionResponse {
  if (!hasExactKeys(value, ['reservationId', 'status', 'version', 'totalQuantity', 'replayed'])) {
    return false;
  }
  const receipt = value as Partial<ReservationTransitionResponse>;
  return (
    isCanonicalUuid(receipt.reservationId) &&
    ['CONFIRMED', 'READY', 'COMPLETED', 'CANCELLED'].includes(String(receipt.status)) &&
    isIntegerBetween(receipt.version, 1, 2_147_483_647) &&
    isIntegerBetween(receipt.totalQuantity, 1, Number.MAX_SAFE_INTEGER) &&
    typeof receipt.replayed === 'boolean'
  );
}

export function isReservationCreationRequest(value: unknown): value is ReservationCreationRequest {
  if (!hasExactKeys(value, ['subjectUserId', 'expiresAt', 'items', 'idempotencyKey'])) {
    return false;
  }
  const request = value as Partial<ReservationCreationRequest>;
  if (
    !isCanonicalUuid(request.subjectUserId) ||
    !isIsoDateTime(request.expiresAt) ||
    !Array.isArray(request.items) ||
    request.items.length < 1 ||
    request.items.length > 20 ||
    !request.items.every(isReservationCreationItem) ||
    !isTrimmedBoundedString(request.idempotencyKey, 8, 120)
  ) {
    return false;
  }
  return new Set(request.items.map(({ productId }) => productId)).size === request.items.length;
}

export function isReservationCreationResponse(
  value: unknown,
  request?: ReservationCreationRequest,
): value is ReservationCreationResponse {
  if (
    !hasExactKeys(value, [
      'reservationId',
      'status',
      'version',
      'itemCount',
      'totalQuantity',
      'replayed',
    ])
  ) {
    return false;
  }
  const receipt = value as Partial<ReservationCreationResponse>;
  const valid =
    isCanonicalUuid(receipt.reservationId) &&
    receipt.status === 'PENDING' &&
    isIntegerBetween(receipt.version, 1, 2_147_483_647) &&
    isIntegerBetween(receipt.itemCount, 1, 20) &&
    isIntegerBetween(receipt.totalQuantity, 1, 2_147_483_647) &&
    typeof receipt.replayed === 'boolean';
  if (!valid || !request) return valid;
  return (
    receipt.itemCount === request.items.length &&
    receipt.totalQuantity === sum(request.items, 'quantity')
  );
}

function isProviderReservation(value: unknown): value is ProviderReservation {
  if (
    !hasExactKeys(value, [
      'id',
      'status',
      'version',
      'expiresAt',
      'createdAt',
      'items',
      'totalQuantity',
    ])
  ) {
    return false;
  }
  const reservation = value as Partial<ProviderReservation>;
  return (
    isCanonicalUuid(reservation.id) &&
    RESERVATION_STATUSES.includes(reservation.status as ReservationStatus) &&
    isIntegerBetween(reservation.version, 1, Number.MAX_SAFE_INTEGER) &&
    isIsoDateTime(reservation.expiresAt) &&
    isIsoDateTime(reservation.createdAt) &&
    Array.isArray(reservation.items) &&
    reservation.items.length > 0 &&
    reservation.items.every(isReservationItem) &&
    isIntegerBetween(reservation.totalQuantity, 1, Number.MAX_SAFE_INTEGER) &&
    reservation.totalQuantity === sum(reservation.items, 'quantity')
  );
}

function isReservationItem(value: unknown): value is ReservationItem {
  if (
    !hasExactKeys(value, ['productId', 'name', 'genericName', 'brand', 'quantity', 'allocations'])
  ) {
    return false;
  }
  const item = value as Partial<ReservationItem>;
  return (
    isCanonicalUuid(item.productId) &&
    isBoundedString(item.name, 240) &&
    (item.genericName === null || isBoundedString(item.genericName, 240)) &&
    isBoundedString(item.brand, 240) &&
    isIntegerBetween(item.quantity, 1, Number.MAX_SAFE_INTEGER) &&
    Array.isArray(item.allocations) &&
    item.allocations.length > 0 &&
    item.allocations.every(isReservationAllocation) &&
    item.quantity === sum(item.allocations, 'quantity')
  );
}

function isReservationAllocation(value: unknown): value is ReservationAllocation {
  if (!hasExactKeys(value, ['batchId', 'batchNumber', 'quantity', 'status'])) return false;
  const allocation = value as Partial<ReservationAllocation>;
  return (
    isCanonicalUuid(allocation.batchId) &&
    isBoundedString(allocation.batchNumber, 120) &&
    isIntegerBetween(allocation.quantity, 1, Number.MAX_SAFE_INTEGER) &&
    ['HELD', 'CONSUMED', 'RELEASED'].includes(String(allocation.status))
  );
}

function isReservationCreationItem(value: unknown): value is ReservationCreationItemRequest {
  if (!hasExactKeys(value, ['productId', 'quantity'])) return false;
  const item = value as Partial<ReservationCreationItemRequest>;
  return isCanonicalUuid(item.productId) && isIntegerBetween(item.quantity, 1, 2_147_483_647);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
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

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function sum<T>(items: T[], key: keyof T): number {
  return items.reduce((total, item) => total + Number(item[key]), 0);
}
