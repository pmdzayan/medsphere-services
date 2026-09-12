import { isCanonicalUuid } from './inventory-contract';

/**
 * Task 0034 - Patient medicine search web contract.
 *
 * Fail-closed validator for the authenticated patient medicine search BFF
 * surface. The response validator rejects any unexpected upstream field so
 * batch identifiers, allocation rows, held quantities, evidence rows,
 * tenant/actor ids, tokens or credentials can never reach the browser.
 *
 * Availability states come from the accepted Task 0025/0026 trust layer:
 * AVAILABLE / UNAVAILABLE / CONFIRMATION_REQUIRED / UNKNOWN. A stale or
 * unknown state is never presented as confidently available.
 */

export type PatientAvailabilityState =
  'AVAILABLE' | 'UNAVAILABLE' | 'CONFIRMATION_REQUIRED' | 'UNKNOWN';

export type PatientAvailabilityRequestStatus = 'NONE' | 'PENDING' | 'RESPONDED' | 'EXPIRED';

export interface PatientMedicineSearchResult {
  readonly productId: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly providerCity: string;
  readonly providerState: string;
  readonly name: string;
  readonly genericName: string | null;
  readonly brand: string;
  readonly strength: string;
  readonly dosageForm: string;
  readonly requiresPrescription: boolean;
  readonly availability: PatientAvailabilityState;
  readonly confirmationSource: 'PHARMACY_CONFIRMED' | null;
  readonly confirmedAt: string | null;
  readonly requestId: string | null;
  readonly requestStatus: PatientAvailabilityRequestStatus;
  readonly requestedAt: string | null;
  readonly expiresAt: string | null;
  readonly retryAfterAt: string | null;
  readonly distanceKm: number | null;
}

export interface PatientMedicineSearchResponse {
  readonly data: PatientMedicineSearchResult[];
  readonly limit: number;
  readonly offset: number;
  readonly radiusKm: number | null;
  readonly area: { readonly city: string; readonly state: string } | null;
}

export interface PatientMedicineSearchFilters {
  readonly q: string;
  readonly city?: string;
  readonly state?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly radiusKm?: number;
  readonly limit?: number;
  readonly offset?: number;
}

export interface PatientLiveAvailabilityRequestResponse {
  readonly requestId: string | null;
  readonly requestStatus: PatientAvailabilityRequestStatus;
  readonly requestedAt: string | null;
  readonly expiresAt: string | null;
  readonly respondedAt: string | null;
  readonly availabilityState: PatientAvailabilityState;
  readonly confirmationSource: 'PHARMACY_CONFIRMED' | null;
  readonly confirmedAt: string | null;
  readonly retryAfterAt: string | null;
}

export function isPatientMedicineSearchResponse(
  value: unknown,
): value is PatientMedicineSearchResponse {
  if (!hasExactKeys(value, ['data', 'limit', 'offset', 'radiusKm', 'area'])) return false;
  const page = value as Partial<PatientMedicineSearchResponse>;
  return (
    Array.isArray(page.data) &&
    page.data.every(isPatientMedicineSearchResult) &&
    isIntegerBetween(page.limit, 1, 25) &&
    isIntegerBetween(page.offset, 0, 500) &&
    page.data.length <= Number(page.limit) &&
    (page.radiusKm === null || isIntegerBetween(page.radiusKm, 1, 50)) &&
    (page.area === null ||
      (hasExactKeys(page.area, ['city', 'state']) &&
        isBoundedString(page.area.city, 120) &&
        isBoundedString(page.area.state, 120)))
  );
}

export function isPatientLiveAvailabilityRequestResponse(
  value: unknown,
): value is PatientLiveAvailabilityRequestResponse {
  if (
    !hasExactKeys(value, [
      'requestId',
      'requestStatus',
      'requestedAt',
      'expiresAt',
      'respondedAt',
      'availabilityState',
      'confirmationSource',
      'confirmedAt',
      'retryAfterAt',
    ])
  ) {
    return false;
  }
  const response = value as Partial<PatientLiveAvailabilityRequestResponse>;
  return (
    (response.requestId === null || isCanonicalUuid(response.requestId)) &&
    ['NONE', 'PENDING', 'RESPONDED', 'EXPIRED'].includes(String(response.requestStatus)) &&
    isNullableIsoDateTime(response.requestedAt) &&
    isNullableIsoDateTime(response.expiresAt) &&
    isNullableIsoDateTime(response.respondedAt) &&
    ['AVAILABLE', 'UNAVAILABLE', 'CONFIRMATION_REQUIRED', 'UNKNOWN'].includes(
      String(response.availabilityState),
    ) &&
    (response.confirmationSource === null ||
      response.confirmationSource === 'PHARMACY_CONFIRMED') &&
    isNullableIsoDateTime(response.confirmedAt) &&
    isNullableIsoDateTime(response.retryAfterAt)
  );
}
const patientResultKeys = [
  'productId',
  'providerId',
  'providerName',
  'providerCity',
  'providerState',
  'name',
  'genericName',
  'brand',
  'strength',
  'dosageForm',
  'requiresPrescription',
  'availability',
  'confirmationSource',
  'confirmedAt',
  'requestId',
  'requestStatus',
  'requestedAt',
  'expiresAt',
  'retryAfterAt',
  'distanceKm',
] as const;

function isPatientMedicineSearchResult(value: unknown): value is PatientMedicineSearchResult {
  if (!hasExactKeys(value, patientResultKeys)) return false;
  const result = value as Partial<PatientMedicineSearchResult>;
  return (
    isCanonicalUuid(result.productId) &&
    isCanonicalUuid(result.providerId) &&
    isBoundedString(result.providerName, 240) &&
    isBoundedString(result.providerCity, 240) &&
    isBoundedString(result.providerState, 240) &&
    isBoundedString(result.name, 240) &&
    (result.genericName === null || isBoundedString(result.genericName, 240)) &&
    isBoundedString(result.brand, 240) &&
    isBoundedString(result.strength, 240) &&
    isBoundedString(result.dosageForm, 240) &&
    typeof result.requiresPrescription === 'boolean' &&
    ['AVAILABLE', 'UNAVAILABLE', 'CONFIRMATION_REQUIRED', 'UNKNOWN'].includes(
      String(result.availability),
    ) &&
    (result.confirmationSource === null || result.confirmationSource === 'PHARMACY_CONFIRMED') &&
    isNullableIsoDateTime(result.confirmedAt) &&
    (result.requestId === null || isCanonicalUuid(result.requestId)) &&
    ['NONE', 'PENDING', 'RESPONDED', 'EXPIRED'].includes(String(result.requestStatus)) &&
    isNullableIsoDateTime(result.requestedAt) &&
    isNullableIsoDateTime(result.expiresAt) &&
    isNullableIsoDateTime(result.retryAfterAt) &&
    (result.distanceKm === null ||
      (typeof result.distanceKm === 'number' &&
        Number.isFinite(result.distanceKm) &&
        result.distanceKm >= 0))
  );
}

export function toPatientMedicineSearchParams(
  filters: PatientMedicineSearchFilters,
): URLSearchParams {
  const search = new URLSearchParams();
  search.set('q', filters.q);
  if (filters.city) search.set('city', filters.city);
  if (filters.state) search.set('state', filters.state);
  if (filters.latitude !== undefined) search.set('latitude', String(filters.latitude));
  if (filters.longitude !== undefined) search.set('longitude', String(filters.longitude));
  if (filters.radiusKm !== undefined) search.set('radiusKm', String(filters.radiusKm));
  if (filters.limit !== undefined) search.set('limit', String(filters.limit));
  if (filters.offset !== undefined) search.set('offset', String(filters.offset));
  return search;
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

function isNullableIsoDateTime(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
