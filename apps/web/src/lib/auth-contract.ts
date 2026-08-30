import { ORGANIZATION_TYPES, type OrganizationType } from './organization-types';
import { isKnownLanguageCode, type KnownLanguageCode } from './settings-contract';

export interface GoogleLoginRequest {
  tenantSlug: string;
  idToken: string;
}

export interface GoogleRegisterRequest {
  organizationType: OrganizationType;
  organizationCode?: string;
  idToken: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface LoginRequest {
  tenantSlug: string;
  email: string;
  password: string;
}

/** Task 0010: slug-free login, step 1 -- verifies identity alone, no organization context. */
export interface IdentifyLoginRequest {
  email: string;
  password: string;
}

/** Task 0010: slug-free login, step 2 -- only used when identify resolves more than one membership. */
export interface SelectOrganizationLoginRequest {
  email: string;
  password: string;
  membershipId: string;
}

export interface OrganizationChoice {
  membershipId: string;
  organizationName: string;
  organizationType: string;
}

export interface OrganizationSelectionRequired {
  requiresOrganizationSelection: true;
  organizations: OrganizationChoice[];
}

export interface RegistrationRequest {
  organizationType: OrganizationType;
  organizationCode?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface RegistrationResponse {
  message: string;
}

export interface RequestPhoneOtpRequest {
  email: string;
}

export interface VerifyPhoneOtpRequest extends RequestPhoneOtpRequest {
  code: string;
}

export interface VerifyPhoneOtpResponse {
  activated: boolean;
  replayed: boolean;
}

export const REGISTRATION_CONFIRMATION_MESSAGE =
  'If registration is available, onboarding instructions will be sent.';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: KnownLanguageCode;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
  context: {
    membershipId: string;
    tenantId: string;
    tenantName: string;
    organizationType: string;
  };
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type AuthenticatedSession = Omit<LoginResponse, 'accessToken' | 'refreshToken'>;

export function normalizeGoogleRegisterRequest(
  input: GoogleRegisterRequest,
): GoogleRegisterRequest {
  return {
    organizationType: input.organizationType,
    organizationCode:
      input.organizationType === 'NONE'
        ? undefined
        : normalizeOrganizationCode(input.organizationCode),
    idToken: input.idToken.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: normalizePhoneNumber(input.phone),
  };
}

export function isGoogleRegisterRequest(value: unknown): value is GoogleRegisterRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const requiredKeys = ['firstName', 'idToken', 'lastName', 'organizationType', 'phone'];
  const allowedKeys = [...requiredKeys, 'organizationCode'];
  if (!keys.every((key) => allowedKeys.includes(key))) return false;
  if (!requiredKeys.every((key) => keys.includes(key))) return false;
  if (typeof candidate.organizationType !== 'string') return false;
  if (candidate.organizationCode !== undefined && typeof candidate.organizationCode !== 'string') {
    return false;
  }
  return (
    typeof candidate.idToken === 'string' &&
    typeof candidate.firstName === 'string' &&
    typeof candidate.lastName === 'string' &&
    typeof candidate.phone === 'string'
  );
}

export function validateGoogleRegisterRequest(
  input: GoogleRegisterRequest,
): Partial<Record<keyof GoogleRegisterRequest, string>> {
  const errors: Partial<Record<keyof GoogleRegisterRequest, string>> = {};

  if (!isOrganizationType(input.organizationType)) {
    errors.organizationType = 'Choose an organization type.';
  } else if (input.organizationType !== 'NONE') {
    if (!isValidOrganizationCodeFormat(input.organizationCode)) {
      errors.organizationCode = 'Enter the organization code provided by your administrator.';
    }
  }

  if (input.idToken.length < 1 || input.idToken.length > 10000) {
    errors.idToken = 'Invalid Google sign-in credential.';
  }

  if (input.firstName.length < 1 || input.firstName.length > 100) {
    errors.firstName = 'Enter a first name between 1 and 100 characters.';
  }

  if (input.lastName.length < 1 || input.lastName.length > 100) {
    errors.lastName = 'Enter a last name between 1 and 100 characters.';
  }

  if (!isValidE164PhoneNumber(input.phone)) {
    errors.phone = 'Enter a valid phone number including country code.';
  }

  return errors;
}

export function normalizeGoogleLoginRequest(input: GoogleLoginRequest): GoogleLoginRequest {
  return {
    tenantSlug: normalizeTenantSlug(input.tenantSlug),
    idToken: input.idToken.trim(),
  };
}

export function isGoogleLoginRequest(value: unknown): value is GoogleLoginRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).sort().join(',') === 'idToken,tenantSlug' &&
    typeof candidate.tenantSlug === 'string' &&
    typeof candidate.idToken === 'string'
  );
}

export function validateGoogleLoginRequest(
  input: GoogleLoginRequest,
): Partial<Record<keyof GoogleLoginRequest, string>> {
  const errors: Partial<Record<keyof GoogleLoginRequest, string>> = {};

  if (input.tenantSlug.length < 1 || input.tenantSlug.length > 100) {
    errors.tenantSlug = 'Use the organization slug provided by your administrator.';
  }

  if (input.idToken.length < 1 || input.idToken.length > 10000) {
    errors.idToken = 'Invalid Google sign-in credential.';
  }

  return errors;
}

export function normalizeLoginRequest(input: LoginRequest): LoginRequest {
  return {
    tenantSlug: normalizeTenantSlug(input.tenantSlug),
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
}

export function isLoginRequest(value: unknown): value is LoginRequest {
  return hasExactStringKeys(value, ['email', 'password', 'tenantSlug']);
}

export function normalizeIdentifyLoginRequest(input: IdentifyLoginRequest): IdentifyLoginRequest {
  return {
    email: input.email.trim().toLowerCase(),
    password: input.password,
  };
}

export function isIdentifyLoginRequest(value: unknown): value is IdentifyLoginRequest {
  return hasExactStringKeys(value, ['email', 'password']);
}

export function validateIdentifyLoginRequest(
  input: IdentifyLoginRequest,
): Partial<Record<keyof IdentifyLoginRequest, string>> {
  const errors: Partial<Record<keyof IdentifyLoginRequest, string>> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (input.password.length < 15 || input.password.length > 128) {
    errors.password = 'Password must be between 15 and 128 characters.';
  }
  return errors;
}

export function isSelectOrganizationLoginRequest(
  value: unknown,
): value is SelectOrganizationLoginRequest {
  return hasExactStringKeys(value, ['email', 'membershipId', 'password']);
}

export function isOrganizationSelectionRequired(
  value: unknown,
): value is OrganizationSelectionRequired {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate.requiresOrganizationSelection === true && Array.isArray(candidate.organizations);
}

export function isLoginResponse(value: unknown): value is LoginResponse {
  if (!hasExactKeys(value, ['accessToken', 'context', 'expiresIn', 'refreshToken', 'user'])) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.accessToken !== 'string' ||
    candidate.accessToken.length === 0 ||
    typeof candidate.refreshToken !== 'string' ||
    candidate.refreshToken.length === 0 ||
    typeof candidate.expiresIn !== 'number' ||
    !Number.isSafeInteger(candidate.expiresIn) ||
    candidate.expiresIn <= 0 ||
    !hasExactStringKeys(candidate.user, [
      'email',
      'firstName',
      'id',
      'lastName',
      'preferredLanguage',
    ]) ||
    !hasExactStringKeys(candidate.context, [
      'membershipId',
      'organizationType',
      'tenantId',
      'tenantName',
    ])
  ) {
    return false;
  }

  const user = candidate.user;
  const context = candidate.context;
  return (
    user.id.length > 0 &&
    user.email.length > 0 &&
    isKnownLanguageCode(user.preferredLanguage) &&
    context.membershipId.length > 0 &&
    context.tenantId.length > 0 &&
    context.tenantName.length > 0 &&
    context.tenantName.length <= 200 &&
    context.organizationType.length > 0 &&
    context.organizationType.length <= 50
  );
}

export function isTokenResponse(value: unknown): value is TokenResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<TokenResponse>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.expiresIn === 'number' &&
    Number.isSafeInteger(candidate.expiresIn) &&
    candidate.expiresIn > 0
  );
}

export function normalizeTenantSlug(value: string): string {
  return value.trim().toLowerCase();
}

const ORGANIZATION_CODE_PATTERN = /^[A-Za-z0-9-]{6,40}$/;

export function normalizeOrganizationCode(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isValidOrganizationCodeFormat(value: string | undefined): boolean {
  return typeof value === 'string' && ORGANIZATION_CODE_PATTERN.test(value);
}

export function isOrganizationType(value: string): value is OrganizationType {
  return (ORGANIZATION_TYPES as readonly string[]).includes(value);
}

export function normalizeRegistrationRequest(input: RegistrationRequest): RegistrationRequest {
  return {
    organizationType: input.organizationType,
    organizationCode:
      input.organizationType === 'NONE'
        ? undefined
        : normalizeOrganizationCode(input.organizationCode),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: normalizePhoneNumber(input.phone),
  };
}

export function isRegistrationRequest(value: unknown): value is RegistrationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const requiredKeys = ['email', 'firstName', 'lastName', 'organizationType', 'password', 'phone'];
  const allowedKeys = [...requiredKeys, 'organizationCode'];
  if (!keys.every((key) => allowedKeys.includes(key))) return false;
  if (!requiredKeys.every((key) => keys.includes(key))) return false;
  if (typeof candidate.organizationType !== 'string') return false;
  if (candidate.organizationCode !== undefined && typeof candidate.organizationCode !== 'string') {
    return false;
  }
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.password === 'string' &&
    typeof candidate.firstName === 'string' &&
    typeof candidate.lastName === 'string' &&
    typeof candidate.phone === 'string'
  );
}

export function isRegistrationResponse(value: unknown): value is RegistrationResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 1 && candidate.message === REGISTRATION_CONFIRMATION_MESSAGE
  );
}

export function validateRegistrationRequest(
  input: RegistrationRequest,
): Partial<Record<keyof RegistrationRequest, string>> {
  const errors: Partial<Record<keyof RegistrationRequest, string>> = {};

  if (!isOrganizationType(input.organizationType)) {
    errors.organizationType = 'Choose an organization type.';
  } else if (input.organizationType !== 'NONE') {
    if (!isValidOrganizationCodeFormat(input.organizationCode)) {
      errors.organizationCode = 'Enter the organization code provided by your administrator.';
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (input.password.length < 15 || input.password.length > 128) {
    errors.password = 'Password must be between 15 and 128 characters.';
  }
  if (!isValidE164PhoneNumber(input.phone)) {
    errors.phone = 'Enter a valid phone number including country code.';
  }
  if (input.firstName.length < 1 || input.firstName.length > 100) {
    errors.firstName = 'Enter a first name between 1 and 100 characters.';
  }
  if (input.lastName.length < 1 || input.lastName.length > 100) {
    errors.lastName = 'Enter a last name between 1 and 100 characters.';
  }
  return errors;
}

export function validateLoginRequest(
  input: LoginRequest,
): Partial<Record<keyof LoginRequest, string>> {
  const errors: Partial<Record<keyof LoginRequest, string>> = {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.tenantSlug) || input.tenantSlug.length > 100) {
    errors.tenantSlug = 'Use the organization slug provided by your administrator.';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) {
    errors.email = 'Enter a valid email address.';
  }
  if (input.password.length < 15 || input.password.length > 128) {
    errors.password = 'Password must be between 15 and 128 characters.';
  }
  return errors;
}

export function normalizePhoneNumber(value: string): string {
  const stripped = value.replace(/[\s()-]/g, '');
  return stripped.startsWith('+') ? stripped : `+${stripped}`;
}

export function isValidE164PhoneNumber(value: string): boolean {
  return /^\+?[1-9]\d{7,14}$/.test(value);
}

function hasExactStringKeys<T extends string>(
  value: unknown,
  expectedKeys: readonly T[],
): value is Record<T, string> {
  return (
    hasExactKeys(value, expectedKeys) &&
    expectedKeys.every((key) => typeof (value as Record<T, unknown>)[key] === 'string')
  );
}

function hasExactKeys(value: unknown, expectedKeys: readonly string[]): value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}
