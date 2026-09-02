import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, PreconditionFailedException } from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { PERMISSIONS, TENANT_ADMINISTRATOR_ROLE } from './permission.constants';

describe('AuthorizationService', () => {
  const identity: AuthenticatedIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
  const transaction = {} as Prisma.TransactionClient;
  const transactionClient = {
    $transaction: jest.fn(
      async (operation: (database: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    ),
  };
  let repository: jest.Mocked<AuthorizationRepository>;
  let auditWriter: jest.Mocked<AuditWriter>;
  let service: AuthorizationService;

  beforeEach(() => {
    transactionClient.$transaction.mockClear();
    repository = {
      transactionClient,
      findEffectivePermissions: jest.fn(),
      findRole: jest.fn(),
      findRoleByName: jest.fn(),
      findPermissions: jest.fn(),
      updateRoleVersioned: jest.fn(),
      replaceRolePermissions: jest.fn(),
      bumpTenantVersion: jest.fn(),
      findMembership: jest.fn(),
      listMemberships: jest.fn(),
      findAssignment: jest.fn(),
      countActiveTenantAdministrators: jest.fn(),
      removeAssignment: jest.fn(),
      findProvider: jest.fn(),
      listProviderAccess: jest.fn(),
      findProviderAccess: jest.fn(),
      createProviderAccess: jest.fn(),
      removeProviderAccess: jest.fn(),
    } as unknown as jest.Mocked<AuthorizationRepository>;
    auditWriter = {
      appendTenantUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditWriter>;
    service = new AuthorizationService(repository, auditWriter);
  });

  it('requires every current permission from the active membership', async () => {
    repository.findEffectivePermissions.mockResolvedValue([
      PERMISSIONS.rolesRead,
      PERMISSIONS.rolesUpdate,
    ]);

    await expect(
      service.hasAllPermissions(identity, [PERMISSIONS.rolesRead, PERMISSIONS.rolesUpdate]),
    ).resolves.toBe(true);
    await expect(
      service.hasAllPermissions(identity, [PERMISSIONS.rolesRead, PERMISSIONS.rolesDelete]),
    ).resolves.toBe(false);
    expect(repository.findEffectivePermissions).toHaveBeenCalledWith(identity);
  });

  it('returns a stable effective-permission snapshot for only the active membership', async () => {
    repository.findEffectivePermissions.mockResolvedValue([
      PERMISSIONS.rolesUpdate,
      PERMISSIONS.rolesRead,
      PERMISSIONS.rolesUpdate,
    ]);

    await expect(service.listEffectivePermissions(identity)).resolves.toEqual({
      permissionKeys: [PERMISSIONS.rolesRead, PERMISSIONS.rolesUpdate],
    });
    expect(repository.findEffectivePermissions).toHaveBeenCalledWith(identity);
  });

  it('rejects stale role versions before any mutation or audit write', async () => {
    repository.findRole.mockResolvedValue(
      roleFixture({ id: randomUUID(), type: 'TENANT', version: 3 }) as never,
    );

    await expect(
      service.updateRole(identity, randomUUID(), 2, { description: 'New description' }),
    ).rejects.toThrow(PreconditionFailedException);
    expect(repository.updateRoleVersioned).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('translates concurrent role-name uniqueness conflicts into a safe domain conflict', async () => {
    transactionClient.$transaction.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.createRole(identity, {
        name: 'DUPLICATE_ROLE',
        permissionKeys: [],
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('keeps built-in roles immutable', async () => {
    repository.findRole.mockResolvedValue(
      roleFixture({
        id: randomUUID(),
        name: TENANT_ADMINISTRATOR_ROLE,
        type: 'SYSTEM',
      }) as never,
    );

    await expect(
      service.updateRole(identity, randomUUID(), 1, { name: 'RENAMED_ADMINISTRATOR' }),
    ).rejects.toThrow(ForbiddenException);
    expect(repository.updateRoleVersioned).not.toHaveBeenCalled();
    expect(repository.replaceRolePermissions).not.toHaveBeenCalled();
  });

  it('does not remove the last active tenant administrator', async () => {
    const membershipId = randomUUID();
    const roleId = randomUUID();
    repository.findMembership.mockResolvedValue({ id: membershipId, status: 'ACTIVE' } as never);
    repository.findRole.mockResolvedValue(
      roleFixture({
        id: roleId,
        name: TENANT_ADMINISTRATOR_ROLE,
        type: 'SYSTEM',
      }) as never,
    );
    repository.findAssignment.mockResolvedValue({ id: randomUUID() });
    repository.countActiveTenantAdministrators.mockResolvedValue(1);

    await expect(service.removeAssignment(identity, membershipId, roleId)).rejects.toThrow(
      ConflictException,
    );
    expect(repository.bumpTenantVersion).toHaveBeenCalledWith(transaction, identity.tenantId);
    expect(repository.removeAssignment).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('maps only the repository tenant membership directory shape', async () => {
    repository.listMemberships.mockResolvedValue({
      data: [
        {
          id: identity.membershipId,
          userId: identity.userId,
          status: 'ACTIVE',
          user: { email: 'admin@example.com', firstName: 'Aisha', lastName: 'Zahra' },
          roleAssignments: [{ role: { id: randomUUID(), name: 'PHARMACY_MANAGER' } }],
        },
      ],
      total: 1,
    } as never);

    await expect(service.listMemberships(identity, { limit: 50, offset: 0 })).resolves.toEqual({
      data: [
        expect.objectContaining({
          id: identity.membershipId,
          userId: identity.userId,
          email: 'admin@example.com',
          roles: [expect.objectContaining({ name: 'PHARMACY_MANAGER' })],
        }),
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    expect(repository.listMemberships).toHaveBeenCalledWith(identity.tenantId, 50, 0);
  });

  it('writes assignment removal evidence in the same transaction', async () => {
    const membershipId = randomUUID();
    const roleId = randomUUID();
    repository.findMembership.mockResolvedValue({ id: membershipId, status: 'ACTIVE' } as never);
    repository.findRole.mockResolvedValue(
      roleFixture({ id: roleId, name: 'PHARMACY_MANAGER', type: 'TENANT' }) as never,
    );
    repository.findAssignment.mockResolvedValue({ id: randomUUID() });
    repository.removeAssignment.mockResolvedValue({ count: 1 });

    await service.removeAssignment(identity, membershipId, roleId, {
      requestId: 'request-remove-1',
    });

    expect(repository.removeAssignment).toHaveBeenCalledWith(
      transaction,
      identity.tenantId,
      membershipId,
      roleId,
    );
    expect(auditWriter.appendTenantUser).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        tenantId: identity.tenantId,
        actorMembershipId: identity.membershipId,
        eventType: 'authorization.assignment.removed',
        request: { requestId: 'request-remove-1' },
      }),
    );
  });

  it('idempotently assigns provider access and writes evidence in the same transaction', async () => {
    const membershipId = randomUUID();
    const providerId = randomUUID();
    repository.findMembership.mockResolvedValue({ id: membershipId, status: 'ACTIVE' } as never);
    repository.findProvider.mockResolvedValue({
      id: providerId,
      businessName: 'Trusted Pharmacy',
      providerType: 'PHARMACY',
      isActive: true,
    });
    repository.findProviderAccess.mockResolvedValue(null);
    repository.createProviderAccess.mockResolvedValue({ count: 1 });

    await expect(
      service.addProviderAccess(identity, membershipId, providerId, { requestId: 'provider-1' }),
    ).resolves.toMatchObject({ membershipId, providerId, businessName: 'Trusted Pharmacy' });
    expect(repository.createProviderAccess).toHaveBeenCalledWith(
      transaction,
      identity.tenantId,
      membershipId,
      providerId,
    );
    expect(auditWriter.appendTenantUser).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        eventType: 'authorization.provider-access.added',
        resourceId: `${membershipId}:${providerId}`,
      }),
    );
  });

  it('removes provider access and its audit evidence atomically', async () => {
    const membershipId = randomUUID();
    const providerId = randomUUID();
    repository.findMembership.mockResolvedValue({ id: membershipId, status: 'ACTIVE' } as never);
    repository.findProvider.mockResolvedValue({
      id: providerId,
      businessName: 'Trusted Hospital',
      providerType: 'HOSPITAL',
      isActive: true,
    });
    repository.findProviderAccess.mockResolvedValue({ id: randomUUID() });
    repository.removeProviderAccess.mockResolvedValue({ count: 1 });

    await service.removeProviderAccess(identity, membershipId, providerId);

    expect(repository.bumpTenantVersion).toHaveBeenCalledWith(transaction, identity.tenantId);
    expect(repository.removeProviderAccess).toHaveBeenCalledWith(
      transaction,
      identity.tenantId,
      membershipId,
      providerId,
    );
    expect(auditWriter.appendTenantUser).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({ eventType: 'authorization.provider-access.removed' }),
    );
  });

  function roleFixture(
    overrides: Partial<{
      id: string;
      name: string;
      type: 'SYSTEM' | 'TENANT';
      version: number;
    }> = {},
  ) {
    return {
      id: overrides.id ?? randomUUID(),
      name: overrides.name ?? 'CUSTOM_ROLE',
      description: null,
      type: overrides.type ?? ('TENANT' as const),
      version: overrides.version ?? 1,
      rolePermissions: [],
      _count: { roleAssignments: 0 },
    };
  }
});
