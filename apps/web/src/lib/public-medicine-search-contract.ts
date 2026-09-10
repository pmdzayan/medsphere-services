export type PublicAvailabilityState =
  'AVAILABLE' | 'UNAVAILABLE' | 'CONFIRMATION_REQUIRED' | 'UNKNOWN';

export type PublicAvailabilityRequestStatus = 'NONE' | 'PENDING' | 'RESPONDED' | 'EXPIRED';

export interface PublicMedicineSearchResult {
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
  readonly availability: PublicAvailabilityState;
  readonly confirmationSource: 'PHARMACY_CONFIRMED' | null;
  readonly confirmedAt: string | null;
  readonly requestId: string | null;
  readonly requestStatus: PublicAvailabilityRequestStatus;
  readonly requestedAt: string | null;
  readonly expiresAt: string | null;
  readonly retryAfterAt: string | null;
}

export interface PublicMedicineSearchResponse {
  readonly data: PublicMedicineSearchResult[];
  readonly limit: number;
  readonly offset: number;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const publicResultKeys = [
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
] as const;

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidV4.test(value);
}

function hasExactKeys(
  value: unknown,
  expected: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isNullableIsoDateTime(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function hasPublicMedicineSearchFields(
  value: Record<string, unknown>,
): value is Record<string, unknown> & PublicMedicineSearchResult {
  const result = value as Partial<PublicMedicineSearchResult>;
  return (
    isCanonicalUuid(result.productId) &&
    isCanonicalUuid(result.providerId) &&
    typeof result.providerName === 'string' &&
    typeof result.providerCity === 'string' &&
    typeof result.providerState === 'string' &&
    typeof result.name === 'string' &&
    (result.genericName === null || typeof result.genericName === 'string') &&
    typeof result.brand === 'string' &&
    typeof result.strength === 'string' &&
    typeof result.dosageForm === 'string' &&
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
    isNullableIsoDateTime(result.retryAfterAt)
  );
}

function isPublicMedicineSearchResult(value: unknown): value is PublicMedicineSearchResult {
  return hasExactKeys(value, publicResultKeys) && hasPublicMedicineSearchFields(value);
}

export function isPublicMedicineSearchResponse(
  value: unknown,
): value is PublicMedicineSearchResponse {
  if (!hasExactKeys(value, ['data', 'limit', 'offset'])) return false;
  const page = value as unknown as Partial<PublicMedicineSearchResponse>;
  return (
    Array.isArray(page.data) &&
    page.data.every(isPublicMedicineSearchResult) &&
    Number.isInteger(page.limit) &&
    Number.isInteger(page.offset)
  );
}

export interface PublicNearbyMedicineSearchResult extends PublicMedicineSearchResult {
  readonly distanceKm: number;
}

export interface PublicNearbyMedicineSearchResponse {
  readonly data: PublicNearbyMedicineSearchResult[];
  readonly limit: number;
  readonly offset: number;
  readonly radiusKm: number;
}

export interface PublicNearbyMedicineSearchRequest {
  readonly q: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly radiusKm?: number;
  readonly limit?: number;
  readonly offset?: number;
}

function isPublicNearbyMedicineSearchResult(
  value: unknown,
): value is PublicNearbyMedicineSearchResult {
  if (!hasExactKeys(value, [...publicResultKeys, 'distanceKm'])) return false;
  if (!hasPublicMedicineSearchFields(value)) return false;

  const result = value as unknown as PublicNearbyMedicineSearchResult;
  return (
    typeof result.distanceKm === 'number' &&
    Number.isFinite(result.distanceKm) &&
    result.distanceKm >= 0
  );
}

export function isPublicNearbyMedicineSearchResponse(
  value: unknown,
): value is PublicNearbyMedicineSearchResponse {
  if (!hasExactKeys(value, ['data', 'limit', 'offset', 'radiusKm'])) return false;
  const page = value as unknown as Partial<PublicNearbyMedicineSearchResponse>;

  return (
    Array.isArray(page.data) &&
    page.data.every(isPublicNearbyMedicineSearchResult) &&
    Number.isInteger(page.limit) &&
    Number.isInteger(page.offset) &&
    typeof page.radiusKm === 'number' &&
    Number.isFinite(page.radiusKm)
  );
}
