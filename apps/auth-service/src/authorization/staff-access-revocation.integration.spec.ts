import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@medsphere/database';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { TENANT_ADMINISTRATOR_ROLE } from './permission.constants';

describe('Staff Access Revocation (Task 0018)', () => {
  const adminIdentity: AuthenticatedIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };

  const targetMembershipId = randomUUID();
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
    jest.clearAllMocks();
    transactionClient.$transaction.mockImplementation(
      async (operation: (database: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(transaction),
    );

    repository = {
      transactionClient,
      bumpTenantVersion: jest.fn().mockResolvedValue(undefined),
      findMembership: jest.fn(),
      countActiveTenantAdministrators: jest.fn(),
      updateMembershipStatusAndRevokeSessions: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuthorizationRepository>;

    auditWriter = {
      appendTenantUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditWriter>;

    service = new AuthorizationService(repository, auditWriter);
  });

  it('suspends an active staff membership atomically inside serializable transaction', async () => {
    repository.findMembership
      .mockResolvedValueOnce(activeMembershipFixture(targetMembershipId, 'ACTIVE'))
      .mockResolvedValueOnce(activeMembershipFixture(targetMembershipId, 'SUSPENDED'));

    const result = await service.updateMembershipStatus(
      adminIdentity,
      targetMembershipId,
      { status: 'SUSPENDED' },
      { requestId: 'req-suspend-1' },
    );

    expect(result.status).toBe('SUSPENDED');
    expect(repository.bumpTenantVersion).toHaveBeenCalledWith(transaction, adminIdentity.tenantId);
    expect(repository.updateMembershipStatusAndRevokeSessions).toHaveBeenCalledWith(
      transaction,
      adminIdentity.tenantId,
      targetMembershipId,
      'SUSPENDED',
    );

    expect(auditWriter.appendTenantUser).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        tenantId: adminIdentity.tenantId,
        actorMembershipId: adminIdentity.membershipId,
        eventType: 'authorization.membership.suspended',
        outcome: 'SUCCEEDED',
        resourceType: 'tenant-membership',
        resourceId: targetMembershipId,
        metadata: {
          targetMembershipId,
          previousStatus: 'ACTIVE',
          resultingStatus: 'SUSPENDED',
        },
        request: { requestId: 'req-suspend-1' },
      }),
    );
  });

  it('revokes an active staff membership atomically inside serializable transaction', async () => {
    repository.findMembership
      .mockResolvedValueOnce(activeMembershipFixture(targetMembershipId, 'ACTIVE'))
      .mockResolvedValueOnce(activeMembershipFixture(targetMembershipId, 'REVOKED'));

    const result = await service.updateMembershipStatus(
      adminIdentity,
      targetMembershipId,
      { status: 'REVOKED' },
      { requestId: 'req-revoke-1' },
    );

    expect(result.status).toBe('REVOKED');
    expect(repository.bumpTenantVersion).toHaveBeenCalledWith(transaction, adminIdentity.tenantId);
    expect(repository.updateMembershipStatusAndRevokeSessions).toHaveBeenCalledWith(
      transaction,
      adminIdentity.tenantId,
      targetMembershipId,
      'REVOKED',
    );

    expect(auditWriter.appendTenantUser).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        tenantId: adminIdentity.tenantId,
        actorMembershipId: adminIdentity.membershipId,
        eventType: 'authorization.membership.revoked',
        outcome: 'SUCCEEDED',
        resourceType: 'tenant-membership',
        resourceId: targetMembershipId,
        metadata: {
          targetMembershipId,
          previousStatus: 'ACTIVE',
          resultingStatus: 'REVOKED',
        },
        request: { requestId: 'req-revoke-1' },
      }),
    );
  });

  it('strictly rejects self-suspension with 403 ForbiddenException before database mutation', async () => {
    await expect(
      service.updateMembershipStatus(adminIdentity, adminIdentity.membershipId, {
        status: 'SUSPENDED',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(repository.bumpTenantVersion).not.toHaveBeenCalled();
    expect(repository.updateMembershipStatusAndRevokeSessions).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('strictly rejects self-revocation with 403 ForbiddenException before database mutation', async () => {
    await expect(
      service.updateMembershipStatus(adminIdentity, adminIdentity.membershipId, {
        status: 'REVOKED',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(repository.bumpTenantVersion).not.toHaveBeenCalled();
    expect(repository.updateMembershipStatusAndRevokeSessions).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('returns 404 NotFoundException if target membership does not exist or tenant mismatched', async () => {
    repository.findMembership.mockResolvedValue(null);

    await expect(
      service.updateMembershipStatus(adminIdentity, targetMembershipId, { status: 'SUSPENDED' }),
    ).rejects.toThrow(NotFoundException);

    expect(repository.updateMembershipStatusAndRevokeSessions).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('rejects target membership status PENDING with 409 ConflictException', async () => {
    repository.findMembership.mockResolvedValue(
      activeMembershipFixture(targetMembershipId, 'PENDING'),
    );

    await expect(
      service.updateMembershipStatus(adminIdentity, targetMembershipId, { status: 'SUSPENDED' }),
    ).rejects.toThrow(ConflictException);

    expect(repository.updateMembershipStatusAndRevokeSessions).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('rejects target membership status already SUSPENDED with 409 ConflictException', async () => {
    repository.findMembership.mockResolvedValue(
      activeMembershipFixture(targetMembershipId, 'SUSPENDED'),
    );

    await expect(
      service.updateMembershipStatus(adminIdentity, targetMembershipId, { status: 'REVOKED' }),
    ).rejects.toThrow(ConflictException);

    expect(repository.updateMembershipStatusAndRevokeSessions).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('rejects target membership status already REVOKED with 409 ConflictException', async () => {
    repository.findMembership.mockResolvedValue(
      activeMembershipFixture(targetMembershipId, 'REVOKED'),
    );

    await expect(
      service.updateMembershipStatus(adminIdentity, targetMembershipId, { status: 'SUSPENDED' }),
    ).rejects.toThrow(ConflictException);

    expect(repository.updateMembershipStatusAndRevokeSessions).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('rejects suspending or revoking the last active tenant administrator with 409 ConflictException', async () => {
    const adminTargetId = randomUUID();
    const adminMembership = activeMembershipFixture(adminTargetId, 'ACTIVE', [
      { role: { name: TENANT_ADMINISTRATOR_ROLE, type: 'SYSTEM' } },
    ]);

    repository.findMembership.mockResolvedValue(adminMembership);
    repository.countActiveTenantAdministrators.mockResolvedValue(1);

    await expect(
      service.updateMembershipStatus(adminIdentity, adminTargetId, { status: 'REVOKED' }),
    ).rejects.toThrow(ConflictException);

    expect(repository.countActiveTenantAdministrators).toHaveBeenCalledWith(
      transaction,
      adminIdentity.tenantId,
    );
    expect(repository.updateMembershipStatusAndRevokeSessions).not.toHaveBeenCalled();
    expect(auditWriter.appendTenantUser).not.toHaveBeenCalled();
  });

  it('rolls back membership status and session updates if audit writer fails', async () => {
    repository.findMembership.mockResolvedValue(
      activeMembershipFixture(targetMembershipId, 'ACTIVE'),
    );
    auditWriter.appendTenantUser.mockRejectedValue(new Error('Audit DB constraint violation'));

    await expect(
      service.updateMembershipStatus(adminIdentity, targetMembershipId, { status: 'SUSPENDED' }),
    ).rejects.toThrow('Audit DB constraint violation');
  });

  function activeMembershipFixture(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'PENDING' = 'ACTIVE',
    roles: Array<{ role: { name: string; type: string } }> = [],
  ) {
    return {
      id,
      userId: randomUUID(),
      tenantId: adminIdentity.tenantId,
      status,
      user: {
        email: 'staff@example.com',
        firstName: 'Staff',
        lastName: 'Member',
      },
      roleAssignments: roles,
    } as never;
  }
});
