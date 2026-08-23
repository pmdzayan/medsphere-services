import { describe, expect, it } from 'vitest';
import {
  hasAuthorizationPermission,
  isAssignmentResponse,
  isAuthorizationCatalogue,
  isCreateRoleRequest,
  isEffectivePermissionsResponse,
  isMembershipCatalogue,
  isRole,
  isRoleVersionRequest,
  isUpdateRoleRequest,
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
        effectivePermissions: ['authorization.roles.read'],
      }),
    ).toBe(true);
    expect(isAuthorizationCatalogue({ roles: [], permissions: [], total: -1 })).toBe(false);

    // Real regression: the actual /authorization/catalogue response
    // shape that produced the reported 502 -- a role and
    // effectivePermissions list naming current inventory/provider-access
    // permission keys the frontend's own AUTHORIZATION_PERMISSIONS
    // constant does not enumerate, previously rejected outright as
    // "invalid response."
    expect(
      isAuthorizationCatalogue({
        roles: [
          {
            id: 'role-id',
            name: 'TENANT_ADMINISTRATOR',
            description: null,
            type: 'SYSTEM',
            version: 1,
            permissionKeys: ['authorization.roles.read', 'inventory.stock.receive'],
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
        effectivePermissions: ['authorization.roles.read', 'authorization.provider-access.manage'],
      }),
    ).toBe(true);

    // Unexpected object fields must still be rejected.
    expect(
      isAuthorizationCatalogue({
        roles: [],
        permissions: [],
        total: 0,
        effectivePermissions: [],
        unexpectedField: true,
      }),
    ).toBe(false);
  });

  it('accepts unique, bounded permission-key strings without requiring membership in a fixed frontend allowlist', () => {
    // Known key: still accepted, unchanged, and hasAuthorizationPermission
    // still correctly handles the frontend-known permissions it makes UI
    // decisions on.
    const effective = { permissionKeys: ['authorization.roles.read'] } as const;
    expect(isEffectivePermissionsResponse(effective)).toBe(true);
    expect(
      hasAuthorizationPermission(
        { effectivePermissions: ['authorization.roles.read'] },
        'authorization.roles.read',
      ),
    ).toBe(true);
    expect(
      hasAuthorizationPermission(
        { effectivePermissions: ['inventory.stock.read'] },
        'authorization.roles.read',
      ),
    ).toBe(false);

    // Real regression: a valid administrator response naming current,
    // migration-owned inventory/reservation/provider-access permissions
    // the frontend's own AUTHORIZATION_PERMISSIONS constant does not
    // enumerate must be accepted, not rejected as "invalid response" --
    // this exact shape previously produced the real 502 reported from a
    // genuine admin catalogue read.
    expect(
      isEffectivePermissionsResponse({
        permissionKeys: [
          'authorization.roles.read',
          'inventory.stock.read',
          'inventory.stock.receive',
          'inventory.batch.quarantine',
          'inventory.reservations.create',
          'inventory.reservations.manage',
          'authorization.provider-access.manage',
        ],
      }),
    ).toBe(true);

    // Malformed shapes must still be rejected: empty, no dot-separated
    // segment, uppercase, leading/trailing dot, and over the 120-char
    // bound matching Permission.name's real @db.VarChar(120) column.
    for (const malformed of [
      '',
      'nodothere',
      'Authorization.Roles.Read',
      '.leading.dot',
      'trailing.dot.',
      `${'a'.repeat(115)}.bcdef`,
    ]) {
      expect(isEffectivePermissionsResponse({ permissionKeys: [malformed] })).toBe(false);
    }
    expect(isEffectivePermissionsResponse({ permissionKeys: [123] })).toBe(false);
    expect(isEffectivePermissionsResponse({ permissionKeys: [null] })).toBe(false);

    // Duplicate rejection is unchanged.
    expect(
      isEffectivePermissionsResponse({
        permissionKeys: ['authorization.roles.read', 'authorization.roles.read'],
      }),
    ).toBe(false);

    // Unexpected object fields must still be rejected.
    expect(
      isEffectivePermissionsResponse({
        permissionKeys: ['authorization.roles.read'],
        extra: 'field',
      }),
    ).toBe(false);
  });

  it('validates role permissionKeys the same way (accepts current keys beyond the fixed frontend set, rejects malformed/duplicate)', () => {
    expect(
      isRole({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'TENANT_ADMINISTRATOR',
        description: null,
        type: 'SYSTEM',
        version: 1,
        permissionKeys: ['authorization.roles.read', 'inventory.stock.receive'],
        assignmentCount: 1,
      }),
    ).toBe(true);
    expect(
      isRole({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'TENANT_ADMINISTRATOR',
        description: null,
        type: 'SYSTEM',
        version: 1,
        permissionKeys: ['not valid'],
        assignmentCount: 1,
      }),
    ).toBe(false);
    expect(
      isRole({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'TENANT_ADMINISTRATOR',
        description: null,
        type: 'SYSTEM',
        version: 1,
        permissionKeys: ['authorization.roles.read', 'authorization.roles.read'],
        assignmentCount: 1,
      }),
    ).toBe(false);
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

  it('rejects unexpected fields at authorization mutation boundaries', () => {
    expect(
      isCreateRoleRequest({
        name: 'PHARMACY_MANAGER',
        permissionKeys: ['authorization.roles.read'],
      }),
    ).toBe(true);
    expect(
      isCreateRoleRequest({
        name: 'PHARMACY_MANAGER',
        permissionKeys: ['authorization.roles.read'],
        tenantId: 'client-controlled',
      }),
    ).toBe(false);
    expect(isUpdateRoleRequest({ version: 2, name: 'PHARMACY_MANAGER' })).toBe(true);
    expect(isUpdateRoleRequest({ version: 2 })).toBe(false);
    expect(isRoleVersionRequest({ version: 2 })).toBe(true);
    expect(isRoleVersionRequest({ version: 2, roleId: 'client-controlled' })).toBe(false);
  });

  it('accepts only exact assignment responses', () => {
    expect(
      isAssignmentResponse({ membershipId: 'membership', roleId: 'role', roleName: 'MANAGER' }),
    ).toBe(true);
    expect(
      isAssignmentResponse({
        membershipId: 'membership',
        roleId: 'role',
        roleName: 'MANAGER',
        tenantId: 'unexpected',
      }),
    ).toBe(false);
  });
});
