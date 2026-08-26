export interface GoogleLoginRequest {
  tenantSlug: string;
  idToken: string;
}

export interface GoogleRegisterRequest {
  tenantSlug: string;
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

export interface RegistrationRequest {
  tenantSlug: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface RegistrationResponse {
  message: string;
}

export const REGISTRATION_CONFIRMATION_MESSAGE =
  'If registration is available, onboarding instructions will be sent.';

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
  context: {
    membershipId: string;
    tenantId: string;
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
    tenantSlug: normalizeTenantSlug(input.tenantSlug),
    idToken: input.idToken.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: normalizePhoneNumber(input.phone),
  };
}

export function isGoogleRegisterRequest(value: unknown): value is GoogleRegisterRequest {
  return hasExactStringKeys(value, ['firstName', 'idToken', 'lastName', 'phone', 'tenantSlug']);
}

export function validateGoogleRegisterRequest(
  input: GoogleRegisterRequest,
): Partial<Record<keyof GoogleRegisterRequest, string>> {
  const errors: Partial<Record<keyof GoogleRegisterRequest, string>> = {};

  if (input.tenantSlug.length < 1 || input.tenantSlug.length > 100) {
    errors.tenantSlug = 'Use the organization slug provided by your administrator.';
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
    !hasExactStringKeys(candidate.user, ['email', 'firstName', 'id', 'lastName']) ||
    !hasExactStringKeys(candidate.context, ['membershipId', 'tenantId'])
  ) {
    return false;
  }

  const user = candidate.user;
  const context = candidate.context;
  return (
    user.id.length > 0 &&
    user.email.length > 0 &&
    context.membershipId.length > 0 &&
    context.tenantId.length > 0
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

export function normalizeRegistrationRequest(input: RegistrationRequest): RegistrationRequest {
  return {
    tenantSlug: normalizeTenantSlug(input.tenantSlug),
    email: input.email.trim().toLowerCase(),
    password: input.password,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: normalizePhoneNumber(input.phone),
  };
}

export function isRegistrationRequest(value: unknown): value is RegistrationRequest {
  return hasExactStringKeys(value, [
    'email',
    'firstName',
    'lastName',
    'password',
    'phone',
    'tenantSlug',
  ]);
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
  const shared = validateLoginRequest(input);
  if (shared.tenantSlug) errors.tenantSlug = shared.tenantSlug;
  if (shared.email) errors.email = shared.email;
  if (shared.password) errors.password = shared.password;
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
