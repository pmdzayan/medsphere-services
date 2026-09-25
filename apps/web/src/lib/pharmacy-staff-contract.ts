import { isCanonicalUuid } from './inventory-contract';

export const MAX_PHARMACY_STAFF_RESULTS = 100;
const MAX_ROLE_RESULTS = 20;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export interface PharmacyStaffRole {
  readonly id: string;
  readonly name: string;
}

export interface PharmacyStaffMember {
  readonly membershipId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  readonly roles: readonly PharmacyStaffRole[];
}

export interface PharmacyStaffCatalogue {
  readonly data: PharmacyStaffMember[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const MEMBERSHIP_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED'] as const;

function isPharmacyStaffRole(value: unknown): value is PharmacyStaffRole {
  return (
    hasExactKeys(value, ['id', 'name']) &&
    isCanonicalUuid(value.id) &&
    isBoundedString(value.name, MAX_NAME_LENGTH)
  );
}

export function isPharmacyStaffMember(value: unknown): value is PharmacyStaffMember {
  if (!hasExactKeys(value, ['membershipId', 'firstName', 'lastName', 'email', 'status', 'roles'])) {
    return false;
  }
  return (
    isCanonicalUuid(value.membershipId) &&
    isBoundedString(value.firstName, MAX_NAME_LENGTH) &&
    isBoundedString(value.lastName, MAX_NAME_LENGTH) &&
    typeof value.email === 'string' &&
    value.email.length <= MAX_EMAIL_LENGTH &&
    EMAIL_PATTERN.test(value.email) &&
    typeof value.status === 'string' &&
    (MEMBERSHIP_STATUSES as readonly string[]).includes(value.status) &&
    Array.isArray(value.roles) &&
    value.roles.length <= MAX_ROLE_RESULTS &&
    value.roles.every(isPharmacyStaffRole)
  );
}

export function isPharmacyStaffCatalogue(value: unknown): value is PharmacyStaffCatalogue {
  if (!hasExactKeys(value, ['data', 'total', 'limit', 'offset'])) return false;
  return (
    Array.isArray(value.data) &&
    value.data.length <= MAX_PHARMACY_STAFF_RESULTS &&
    value.data.every(isPharmacyStaffMember) &&
    Number.isSafeInteger(value.total) &&
    Number(value.total) >= value.data.length &&
    Number.isSafeInteger(value.limit) &&
    Number(value.limit) >= 1 &&
    Number(value.limit) <= MAX_PHARMACY_STAFF_RESULTS &&
    value.data.length <= Number(value.limit) &&
    Number.isSafeInteger(value.offset) &&
    Number(value.offset) >= 0
  );
}

export interface AssignPharmacyStaffRequest {
  readonly membershipId: string;
}

export function isAssignPharmacyStaffRequest(value: unknown): value is AssignPharmacyStaffRequest {
  return hasExactKeys(value, ['membershipId']) && isCanonicalUuid(value.membershipId);
}

export interface ProviderAccessAssignment {
  readonly membershipId: string;
  readonly providerId: string;
  readonly businessName: string;
  readonly providerType: 'PHARMACY' | 'HOSPITAL' | 'CLINIC' | 'LABORATORY' | 'DOCTOR';
  readonly isActive: boolean;
}

export function isProviderAccessAssignment(value: unknown): value is ProviderAccessAssignment {
  return (
    hasExactKeys(value, [
      'membershipId',
      'providerId',
      'businessName',
      'providerType',
      'isActive',
    ]) &&
    isCanonicalUuid(value.membershipId) &&
    isCanonicalUuid(value.providerId) &&
    isBoundedString(value.businessName, 240) &&
    (['PHARMACY', 'HOSPITAL', 'CLINIC', 'LABORATORY', 'DOCTOR'] as const).includes(value.providerType as never) &&
    typeof value.isActive === 'boolean'
  );
}
