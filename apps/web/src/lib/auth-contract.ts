export interface LoginRequest {
  tenantSlug: string;
  email: string;
  password: string;
}

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
