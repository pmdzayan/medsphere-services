import { isCanonicalUuid } from './inventory-contract';

/**
 * Task 0034 - Patient reservation web contract.
 *
 * Fail-closed validators matching the backend /patient/reservations surface.
 * The request validators accept ONLY the exact allowed keys and shapes (no
 * userId/subjectUserId/tenantId/membershipId can ever be forwarded). The
 * response validators reject any unexpected extra upstream field, so an
 * accidental batch/allocation/hold/internal-evidence leak would fail the BFF
 * boundary instead of reaching the browser.
 */

export const PATIENT_RESERVATION_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'READY',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type PatientReservationStatus = (typeof PATIENT_RESERVATION_STATUSES)[number];

export interface PatientReservationItem {
  readonly productId: string;
  readonly name: string;
  readonly genericName: string | null;
  readonly brand: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly quantity: number;
}

export interface PatientReservation {
  readonly id: string;
  readonly status: PatientReservationStatus;
  readonly version: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly cancelledAt: string | null;
  readonly expiredAt: string | null;
  readonly providerId: string;
  readonly providerName: string;
  readonly providerCity: string;
  readonly providerState: string;
  readonly items: PatientReservationItem[];
  readonly totalQuantity: number;
}

export interface PatientReservationPage {
  readonly data: PatientReservation[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface PatientReservationFilters {
  readonly status?: PatientReservationStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreatePatientReservationItemRequest {
  readonly productId: string;
  readonly quantity: number;
}

export interface CreatePatientReservationRequest {
  readonly providerId: string;
  readonly items: CreatePatientReservationItemRequest[];
  readonly expiresAt?: string;
  readonly idempotencyKey: string;
}

export interface CreatePatientReservationResponse {
  readonly reservationId: string;
  readonly status: 'PENDING';
  readonly version: number;
  readonly itemCount: number;
  readonly totalQuantity: number;
  readonly expiresAt: string;
  readonly replayed: boolean;
}

export interface CancelPatientReservationRequest {
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
}

export interface CancelPatientReservationResponse {
  readonly reservationId: string;
  readonly status: 'CANCELLED';
  readonly version: number;
  readonly totalQuantity: number;
  readonly replayed: boolean;
}

export function toPatientReservationSearchParams(
  filters: PatientReservationFilters,
): URLSearchParams {
  const search = new URLSearchParams();
  if (filters.status) search.set('status', filters.status);
  if (filters.limit !== undefined) search.set('limit', String(filters.limit));
  if (filters.offset !== undefined) search.set('offset', String(filters.offset));
  return search;
}
export function isCreatePatientReservationItemRequest(
  value: unknown,
): value is CreatePatientReservationItemRequest {
  if (!hasExactKeys(value, ['productId', 'quantity'])) return false;
  const item = value as Partial<CreatePatientReservationItemRequest>;
  return isCanonicalUuid(item.productId) && isIntegerBetween(item.quantity, 1, 100);
}

export function isCreatePatientReservationRequest(
  value: unknown,
): value is CreatePatientReservationRequest {
  if (
    !hasExactKeys(value, ['providerId', 'items', 'idempotencyKey']) &&
    !hasExactKeys(value, ['providerId', 'items', 'expiresAt', 'idempotencyKey'])
  ) {
    return false;
  }
  const request = value as Partial<CreatePatientReservationRequest>;
  return (
    isCanonicalUuid(request.providerId) &&
    request.items !== undefined &&
    Array.isArray(request.items) &&
    request.items.length >= 1 &&
    request.items.length <= 20 &&
    request.items.every(isCreatePatientReservationItemRequest) &&
    sum(request.items, 'quantity') <= 100 &&
    (request.expiresAt === undefined || isIsoDateTime(request.expiresAt)) &&
    isTrimmedBoundedString(request.idempotencyKey, 1, 120)
  );
}

export function isCancelPatientReservationRequest(
  value: unknown,
): value is CancelPatientReservationRequest {
  if (!hasExactKeys(value, ['expectedVersion', 'idempotencyKey'])) return false;
  const request = value as Partial<CancelPatientReservationRequest>;
  return (
    isIntegerBetween(request.expectedVersion, 1, Number.MAX_SAFE_INTEGER) &&
    isTrimmedBoundedString(request.idempotencyKey, 1, 120)
  );
}
export function isCreatePatientReservationResponse(
  value: unknown,
): value is CreatePatientReservationResponse {
  if (
    !hasExactKeys(value, [
      'reservationId',
      'status',
      'version',
      'itemCount',
      'totalQuantity',
      'expiresAt',
      'replayed',
    ])
  ) {
    return false;
  }
  const response = value as Partial<CreatePatientReservationResponse>;
  return (
    isCanonicalUuid(response.reservationId) &&
    response.status === 'PENDING' &&
    isIntegerBetween(response.version, 1, Number.MAX_SAFE_INTEGER) &&
    isIntegerBetween(response.itemCount, 1, 20) &&
    isIntegerBetween(response.totalQuantity, 1, 2_147_483_647) &&
    isIsoDateTime(response.expiresAt) &&
    typeof response.replayed === 'boolean'
  );
}

export function isCancelPatientReservationResponse(
  value: unknown,
): value is CancelPatientReservationResponse {
  if (!hasExactKeys(value, ['reservationId', 'status', 'version', 'totalQuantity', 'replayed'])) {
    return false;
  }
  const response = value as Partial<CancelPatientReservationResponse>;
  return (
    isCanonicalUuid(response.reservationId) &&
    response.status === 'CANCELLED' &&
    isIntegerBetween(response.version, 1, Number.MAX_SAFE_INTEGER) &&
    isIntegerBetween(response.totalQuantity, 1, Number.MAX_SAFE_INTEGER) &&
    typeof response.replayed === 'boolean'
  );
}

export function isPatientReservationItem(value: unknown): value is PatientReservationItem {
  if (
    !hasExactKeys(value, [
      'productId',
      'name',
      'genericName',
      'brand',
      'strength',
      'dosageForm',
      'quantity',
    ])
  ) {
    return false;
  }
  const item = value as Partial<PatientReservationItem>;
  return (
    isCanonicalUuid(item.productId) &&
    isBoundedString(item.name, 240) &&
    (item.genericName === null || isBoundedString(item.genericName, 240)) &&
    isBoundedString(item.brand, 240) &&
    isBoundedString(item.strength, 240) &&
    isBoundedString(item.dosageForm, 240) &&
    isIntegerBetween(item.quantity, 1, Number.MAX_SAFE_INTEGER)
  );
}

export function isPatientReservation(value: unknown): value is PatientReservation {
  if (
    !hasExactKeys(value, [
      'id',
      'status',
      'version',
      'expiresAt',
      'createdAt',
      'cancelledAt',
      'expiredAt',
      'providerId',
      'providerName',
      'providerCity',
      'providerState',
      'items',
      'totalQuantity',
    ])
  ) {
    return false;
  }
  const reservation = value as Partial<PatientReservation>;
  return (
    isCanonicalUuid(reservation.id) &&
    (PATIENT_RESERVATION_STATUSES as readonly string[]).includes(String(reservation.status)) &&
    isIntegerBetween(reservation.version, 1, Number.MAX_SAFE_INTEGER) &&
    isIsoDateTime(reservation.expiresAt) &&
    isIsoDateTime(reservation.createdAt) &&
    isNullableIsoDateTime(reservation.cancelledAt) &&
    isNullableIsoDateTime(reservation.expiredAt) &&
    isCanonicalUuid(reservation.providerId) &&
    isBoundedString(reservation.providerName, 240) &&
    isBoundedString(reservation.providerCity, 240) &&
    isBoundedString(reservation.providerState, 240) &&
    Array.isArray(reservation.items) &&
    reservation.items.length > 0 &&
    reservation.items.every(isPatientReservationItem) &&
    isIntegerBetween(reservation.totalQuantity, 1, Number.MAX_SAFE_INTEGER) &&
    reservation.totalQuantity === sum(reservation.items, 'quantity')
  );
}

export function isPatientReservationPage(value: unknown): value is PatientReservationPage {
  if (!hasExactKeys(value, ['data', 'total', 'limit', 'offset'])) return false;
  const page = value as Partial<PatientReservationPage>;
  return (
    Array.isArray(page.data) &&
    page.data.every(isPatientReservation) &&
    isIntegerBetween(page.total, 0, Number.MAX_SAFE_INTEGER) &&
    isIntegerBetween(page.limit, 1, 25) &&
    isIntegerBetween(page.offset, 0, 500) &&
    page.data.length <= Number(page.limit) &&
    page.data.length <= Math.max(Number(page.total) - Number(page.offset), 0)
  );
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

function isNullableIsoDateTime(value: unknown): value is string | null {
  return value === null || isIsoDateTime(value);
}

function sum<T>(items: T[], key: keyof T): number {
  return items.reduce((total, item) => total + Number(item[key]), 0);
}
