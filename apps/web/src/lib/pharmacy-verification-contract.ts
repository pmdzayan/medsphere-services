/**
 * Candidate Task 0039 (PROVISIONAL). Fail-closed BFF boundary
 * contracts for the pharmacy-facing profile and verification
 * surfaces, mirroring the exact pattern established by
 * patient-profile-contract.ts (Task 0032): only the exact whitelisted
 * keys are accepted, at least one must be present for a PATCH, and
 * every present field's type/shape is validated here rather than
 * trusting the backend's class-validator ValidationPipe alone.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, minLength: number, maxLength: number): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
}

function isFiniteLatitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isFiniteLongitude(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isBoundedEmail(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength && EMAIL_PATTERN.test(value);
}

// Mirrors the sealed backend's OPAQUE_EVIDENCE_REFERENCE_PATTERN
// exactly (packages/database is not reachable from apps/web without
// crossing a package boundary that would require a broader shared-
// validation-package redesign; kept as a small, explicitly-tested
// parity implementation instead -- see pharmacy-verification-contract.test.ts
// for the parity assertions against the same rejected/accepted cases
// the backend DTO test proves). Must start with a letter or digit,
// followed only by letters, digits, '.', '_', or '-' -- no ':', '/',
// '\', '?', '#', whitespace, or control characters, which is what
// makes every URL, URI-scheme value, path, and query/fragment string
// impossible to express.
const OPAQUE_EVIDENCE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
function isOpaqueEvidenceReference(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    OPAQUE_EVIDENCE_REFERENCE_PATTERN.test(value)
  );
}

// -- Profile -----------------------------------------------------------

export interface PharmacyProfile {
  readonly businessName: string;
  readonly ownerName: string;
  readonly email: string;
  readonly phone: string;
  readonly address: string;
  readonly city: string;
  readonly state: string;
  readonly country: string;
  readonly postalCode: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface UpdatePharmacyProfileRequest {
  readonly businessName?: string;
  readonly ownerName?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly address?: string;
  readonly city?: string;
  readonly state?: string;
  readonly country?: string;
  readonly postalCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

const UPDATABLE_PHARMACY_PROFILE_FIELDS = [
  'businessName',
  'ownerName',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'country',
  'postalCode',
  'latitude',
  'longitude',
] as const;

export function isPharmacyProfile(value: unknown): value is PharmacyProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.businessName === 'string' &&
    typeof value.ownerName === 'string' &&
    typeof value.email === 'string' &&
    typeof value.phone === 'string' &&
    typeof value.address === 'string' &&
    typeof value.city === 'string' &&
    typeof value.state === 'string' &&
    typeof value.country === 'string' &&
    typeof value.postalCode === 'string' &&
    typeof value.latitude === 'number' &&
    typeof value.longitude === 'number'
  );
}

/**
 * Fail-closed validator for the pharmacy profile PATCH boundary.
 * Only the exact whitelisted keys are accepted; unknown keys (e.g.
 * "tenantId", "providerType", "isVerified", "isActive", "deletedAt",
 * "status", "role") fail the entire request closed rather than being
 * silently stripped. Mirrors the backend's own field-length/shape
 * bounds so a malformed PATCH fails here, before ever reaching the
 * backend.
 */
export function isUpdatePharmacyProfileRequest(
  value: unknown,
): value is UpdatePharmacyProfileRequest {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  if (!keys.every((key) => (UPDATABLE_PHARMACY_PROFILE_FIELDS as readonly string[]).includes(key)))
    return false;

  if ('businessName' in value && !isBoundedString(value.businessName, 1, 200)) return false;
  if ('ownerName' in value && !isBoundedString(value.ownerName, 1, 200)) return false;
  if ('email' in value && !isBoundedEmail(value.email, 254)) return false;
  if ('phone' in value && !isBoundedString(value.phone, 1, 30)) return false;
  if ('address' in value && !isBoundedString(value.address, 1, 300)) return false;
  if ('city' in value && !isBoundedString(value.city, 1, 120)) return false;
  if ('state' in value && !isBoundedString(value.state, 1, 120)) return false;
  if ('country' in value && !isBoundedString(value.country, 1, 120)) return false;
  if ('postalCode' in value && !isBoundedString(value.postalCode, 1, 20)) return false;
  if ('latitude' in value && !isFiniteLatitude(value.latitude)) return false;
  if ('longitude' in value && !isFiniteLongitude(value.longitude)) return false;

  return true;
}

// -- Verification state --------------------------------------------------

export interface PharmacyVerificationRecord {
  readonly verificationId: string;
  readonly status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED';
  readonly submittedAt: string;
  readonly licenseExpiryDate: string;
  readonly applicantMessage: string | null;
  readonly version: number;
}

export interface PharmacyVerificationState {
  readonly current: PharmacyVerificationRecord | null;
  readonly openSubmission: PharmacyVerificationRecord | null;
}

const VERIFICATION_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED',
] as const;

function isPharmacyVerificationRecord(value: unknown): value is PharmacyVerificationRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.verificationId === 'string' &&
    typeof value.status === 'string' &&
    (VERIFICATION_STATUSES as readonly string[]).includes(value.status) &&
    typeof value.submittedAt === 'string' &&
    typeof value.licenseExpiryDate === 'string' &&
    (value.applicantMessage === null || typeof value.applicantMessage === 'string') &&
    typeof value.version === 'number' &&
    // Never allow internal-only fields to pass through this contract,
    // even if the backend response somehow included them.
    !('verificationNotes' in value) &&
    !('verifiedBy' in value) &&
    !('governmentIdReference' in value) &&
    !('licenseNumber' in value)
  );
}

/**
 * Preserves the dual-state model exactly: `current` (the authoritative
 * verification state) and `openSubmission` (a separate, possibly
 * concurrently-open renewal) are never flattened into one status --
 * this is what lets the UI distinguish "APPROVED current + PENDING
 * renewal" from "PENDING initial submission".
 */
export function isPharmacyVerificationState(value: unknown): value is PharmacyVerificationState {
  if (!isRecord(value)) return false;
  if (!('current' in value) || !('openSubmission' in value)) return false;
  const current = value.current;
  const openSubmission = value.openSubmission;
  return (
    (current === null || isPharmacyVerificationRecord(current)) &&
    (openSubmission === null || isPharmacyVerificationRecord(openSubmission))
  );
}

// -- Verification submission ---------------------------------------------

export interface SubmitPharmacyVerificationRequest {
  readonly licenseNumber: string;
  readonly licenseExpiryDate: string;
  readonly businessRegistrationNumber: string;
  readonly governmentIdReference: string;
}

const SUBMIT_VERIFICATION_FIELDS = [
  'licenseNumber',
  'licenseExpiryDate',
  'businessRegistrationNumber',
  'governmentIdReference',
] as const;

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

/**
 * Fail-closed validator for the verification submission boundary.
 * Only the exact 4 whitelisted keys are accepted -- no "tenantId",
 * "providerType", "status", "isVerified", "reviewer", "reviewerId",
 * or "verificationNotes" can ever be forwarded, since any key outside
 * this exact list fails the whole request. `governmentIdReference` is
 * validated against the same opaque-identifier syntax the sealed
 * backend enforces.
 */
export function isSubmitPharmacyVerificationRequest(
  value: unknown,
): value is SubmitPharmacyVerificationRequest {
  if (!isRecord(value)) return false;

  const keys = Object.keys(value);
  if (keys.length !== SUBMIT_VERIFICATION_FIELDS.length) return false;
  if (!keys.every((key) => (SUBMIT_VERIFICATION_FIELDS as readonly string[]).includes(key)))
    return false;

  return (
    isBoundedString(value.licenseNumber, 1, 200) &&
    isIsoDateString(value.licenseExpiryDate) &&
    isBoundedString(value.businessRegistrationNumber, 1, 200) &&
    isOpaqueEvidenceReference(value.governmentIdReference, 200)
  );
}
