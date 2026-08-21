export type PublicAvailabilityState = 'IN_STOCK' | 'OUT_OF_STOCK';

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
}

export interface PublicMedicineSearchResponse {
  readonly data: PublicMedicineSearchResult[];
  readonly limit: number;
  readonly offset: number;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function isCanonicalUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidV4.test(value);
}

function isPublicMedicineSearchResult(value: unknown): value is PublicMedicineSearchResult {
  if (typeof value !== 'object' || value === null) return false;
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
    (result.availability === 'IN_STOCK' || result.availability === 'OUT_OF_STOCK')
  );
}

export function isPublicMedicineSearchResponse(
  value: unknown,
): value is PublicMedicineSearchResponse {
  if (typeof value !== 'object' || value === null) return false;
  const page = value as Partial<PublicMedicineSearchResponse>;
  return (
    Array.isArray(page.data) &&
    page.data.every(isPublicMedicineSearchResult) &&
    Number.isInteger(page.limit) &&
    Number.isInteger(page.offset)
  );
}
