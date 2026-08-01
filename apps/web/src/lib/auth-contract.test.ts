import { describe, expect, it } from 'vitest';
import {
  isRegistrationRequest,
  isRegistrationResponse,
  isTokenResponse,
  normalizeRegistrationRequest,
  normalizeTenantSlug,
  REGISTRATION_CONFIRMATION_MESSAGE,
  validateLoginRequest,
  validateRegistrationRequest,
} from './auth-contract';

describe('accepted login contract', () => {
  it('normalizes the tenant locator without inventing a tenant identity', () => {
    expect(normalizeTenantSlug('  Central-Pharmacy ')).toBe('central-pharmacy');
  });

  it('accepts the backend contract shape', () => {
    expect(
      validateLoginRequest({
        tenantSlug: 'central-pharmacy',
        email: 'user@example.com',
        password: 'a-secure-password',
      }),
    ).toEqual({});
  });

  it('rejects malformed tenant, email, and short password values', () => {
    expect(
      validateLoginRequest({
        tenantSlug: 'Central Pharmacy',
        email: 'invalid',
        password: 'short',
      }),
    ).toEqual({
      tenantSlug: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
    });
  });

  it('validates rotated credential responses without accepting partial tokens', () => {
    expect(
      isTokenResponse({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresIn: 900,
      }),
    ).toBe(true);
    expect(isTokenResponse({ accessToken: 'new-access', expiresIn: 900 })).toBe(false);
  });
});

describe('accepted registration contract', () => {
  const request = {
    tenantSlug: 'central-pharmacy',
    email: 'operator@example.com',
    password: 'a-secure-password',
    firstName: 'Mira',
    lastName: 'Patel',
  };

  it('normalizes public locators and names without changing the password', () => {
    expect(
      normalizeRegistrationRequest({
        ...request,
        tenantSlug: ' Central-Pharmacy ',
        email: ' OPERATOR@EXAMPLE.COM ',
        firstName: ' Mira ',
        lastName: ' Patel ',
      }),
    ).toEqual(request);
  });

  it('accepts the exact backend request and generic response contracts', () => {
    expect(isRegistrationRequest(request)).toBe(true);
    expect(validateRegistrationRequest(request)).toEqual({});
    expect(isRegistrationResponse({ message: REGISTRATION_CONFIRMATION_MESSAGE })).toBe(true);
  });

  it('rejects client-controlled identity fields and malformed successful responses', () => {
    expect(isRegistrationRequest({ ...request, tenantId: 'client-controlled' })).toBe(false);
    expect(isRegistrationRequest({ ...request, password: 42 })).toBe(false);
    expect(
      isRegistrationResponse({ message: REGISTRATION_CONFIRMATION_MESSAGE, userId: 'leaked' }),
    ).toBe(false);
    expect(isRegistrationResponse({ message: 'Account created' })).toBe(false);
  });

  it('rejects invalid names, locators, and passwords', () => {
    expect(
      validateRegistrationRequest({
        tenantSlug: 'Invalid Tenant',
        email: 'invalid',
        password: 'short',
        firstName: '',
        lastName: 'x'.repeat(101),
      }),
    ).toEqual({
      tenantSlug: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
      firstName: expect.any(String),
      lastName: expect.any(String),
    });
  });
});
