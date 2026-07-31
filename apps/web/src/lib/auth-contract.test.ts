import { describe, expect, it } from 'vitest';
import { isTokenResponse, normalizeTenantSlug, validateLoginRequest } from './auth-contract';

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
