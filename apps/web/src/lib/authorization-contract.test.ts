import { describe, expect, it } from 'vitest';
import {
  isAuthorizationCatalogue,
  isMembershipCatalogue,
  normalizeRoleName,
  validateCreateRole,
} from './authorization-contract';

describe('authorization contract', () => {
  it('normalizes an operator-entered role name to the backend format', () => {
    expect(normalizeRoleName(' pharmacy manager ')).toBe('PHARMACY_MANAGER');
  });

  it('validates custom roles against the live permission catalogue', () => {
    expect(
      validateCreateRole(
        {
          name: 'PHARMACY_MANAGER',
          description: 'Manages pharmacy access',
          permissionKeys: ['authorization.roles.read'],
        },
        ['authorization.roles.read'],
      ),
    ).toEqual({});
  });

  it('rejects malformed names, descriptions, duplicate, and unknown permissions', () => {
    expect(
      validateCreateRole(
        {
          name: 'invalid role',
          description: 'x'.repeat(241),
          permissionKeys: ['unknown', 'unknown'],
        },
        ['authorization.roles.read'],
      ),
    ).toEqual({
      name: expect.any(String),
      description: expect.any(String),
      permissionKeys: expect.any(String),
    });
  });

  it('accepts only the bounded backend catalogue shape', () => {
    expect(
      isAuthorizationCatalogue({
        roles: [
          {
            id: 'role-id',
            name: 'TENANT_ADMINISTRATOR',
            description: null,
            type: 'SYSTEM',
            version: 1,
            permissionKeys: ['authorization.roles.read'],
            assignmentCount: 1,
          },
        ],
        permissions: [
          {
            id: 'permission-id',
            name: 'authorization.roles.read',
            description: 'Read roles',
          },
        ],
        total: 1,
      }),
    ).toBe(true);
    expect(isAuthorizationCatalogue({ roles: [], permissions: [], total: -1 })).toBe(false);
  });

  it('validates the tenant membership directory contract', () => {
    expect(
      isMembershipCatalogue({
        data: [
          {
            id: 'membership',
            userId: 'user',
            email: 'a@example.com',
            firstName: 'Aisha',
            lastName: 'Zahra',
            status: 'ACTIVE',
            roles: [{ id: 'role', name: 'ADMIN' }],
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      }),
    ).toBe(true);
    expect(isMembershipCatalogue({ data: [], total: -1, limit: 100, offset: 0 })).toBe(false);
  });
});
