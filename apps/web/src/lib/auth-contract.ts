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
  };
}

export function isRegistrationRequest(value: unknown): value is RegistrationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const expectedKeys = ['email', 'firstName', 'lastName', 'password', 'tenantSlug'];
  const actualKeys = Object.keys(candidate).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index]) &&
    expectedKeys.every((key) => typeof candidate[key] === 'string')
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
  const shared = validateLoginRequest(input);
  if (shared.tenantSlug) errors.tenantSlug = shared.tenantSlug;
  if (shared.email) errors.email = shared.email;
  if (shared.password) errors.password = shared.password;
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
