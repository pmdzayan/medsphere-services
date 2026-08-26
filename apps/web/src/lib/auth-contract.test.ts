import { describe, expect, it } from 'vitest';
import {
  isLoginRequest,
  isLoginResponse,
  isRegistrationRequest,
  isRegistrationResponse,
  isTokenResponse,
  normalizeLoginRequest,
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

  it('normalizes only public locators and preserves the password', () => {
    expect(
      normalizeLoginRequest({
        tenantSlug: ' Central-Pharmacy ',
        email: ' USER@EXAMPLE.COM ',
        password: ' a-secure-password ',
      }),
    ).toEqual({
      tenantSlug: 'central-pharmacy',
      email: 'user@example.com',
      password: ' a-secure-password ',
    });
  });

  it('rejects over-broad login requests and responses', () => {
    const request = {
      tenantSlug: 'central-pharmacy',
      email: 'user@example.com',
      password: 'a-secure-password',
    };
    const response = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
      user: {
        id: 'user-id',
        email: request.email,
        firstName: 'Test',
        lastName: 'User',
      },
      context: { membershipId: 'membership-id', tenantId: 'tenant-id' },
    };

    expect(isLoginRequest(request)).toBe(true);
    expect(isLoginRequest({ ...request, tenantId: 'client-controlled' })).toBe(false);
    expect(isLoginResponse(response)).toBe(true);
    expect(isLoginResponse({ ...response, permissions: ['unexpected'] })).toBe(false);
    expect(
      isLoginResponse({ ...response, user: { ...response.user, permissions: ['unexpected'] } }),
    ).toBe(false);
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
    phone: '+919876543210',
  };

  it('normalizes public locators and names without changing the password', () => {
    expect(
      normalizeRegistrationRequest({
        ...request,
        tenantSlug: ' Central-Pharmacy ',
        email: ' OPERATOR@EXAMPLE.COM ',
        firstName: ' Mira ',
        lastName: ' Patel ',
        phone: ' +91 98765 43210 ',
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
        phone: 'invalid',
      }),
    ).toEqual({
      tenantSlug: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
      firstName: expect.any(String),
      lastName: expect.any(String),
      phone: expect.any(String),
    });
  });
});
