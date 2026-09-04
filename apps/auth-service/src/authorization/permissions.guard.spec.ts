import { randomUUID } from 'node:crypto';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from './authorization.service';
import { PermissionKey, PERMISSIONS } from './permission.constants';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';

describe('PermissionsGuard', () => {
  const identity: AuthenticatedIdentity = {
    userId: randomUUID(),
    membershipId: randomUUID(),
    tenantId: randomUUID(),
    sessionId: randomUUID(),
    tokenId: randomUUID(),
    securityVersion: 1,
  };
  const getAllAndOverride = jest.fn();
  const hasAllPermissions = jest.fn();
  const appendTenantUser = jest.fn();
  const prismaClient = {};
  const reflector = { getAllAndOverride } as unknown as Reflector;
  const authorizationService = { hasAllPermissions } as unknown as AuthorizationService;
  const auditWriter = { appendTenantUser } as unknown as AuditWriter;
  const prisma = { client: prismaClient } as unknown as PrismaService;
  const guard = new PermissionsGuard(reflector, authorizationService, auditWriter, prisma);

  beforeEach(() => {
    getAllAndOverride.mockReset();
    hasAllPermissions.mockReset();
    appendTenantUser.mockReset().mockResolvedValue(undefined);
  });

  it('fails closed when a protected controller has no permission policy', async () => {
    getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(contextFor(identity))).rejects.toThrow(
      'Authorization policy is missing',
    );
    expect(hasAllPermissions).not.toHaveBeenCalled();
  });

  it('fails closed when trusted authentication identity is unavailable', async () => {
    getAllAndOverride.mockReturnValue([PERMISSIONS.rolesRead]);

    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow('Access denied');
    expect(hasAllPermissions).not.toHaveBeenCalled();
  });

  it('allows only when every required permission resolves for the active membership', async () => {
    const required = [PERMISSIONS.rolesRead, PERMISSIONS.rolesCreate] as const;
    getAllAndOverride.mockReturnValue(required);
    hasAllPermissions.mockResolvedValue(true);

    await expect(guard.canActivate(contextFor(identity))).resolves.toBe(true);
    expect(hasAllPermissions).toHaveBeenCalledWith(identity, required);
    expect(appendTenantUser).not.toHaveBeenCalled();
  });

  it('writes tenant-attributable denial evidence before returning forbidden', async () => {
    getAllAndOverride.mockReturnValue([PERMISSIONS.rolesUpdate, PERMISSIONS.rolesRead]);
    hasAllPermissions.mockResolvedValue(false);

    await expect(guard.canActivate(contextFor(identity))).rejects.toThrow(ForbiddenException);
    expect(appendTenantUser).toHaveBeenCalledWith(prismaClient, {
      tenantId: identity.tenantId,
      actorMembershipId: identity.membershipId,
      actorUserId: identity.userId,
      eventType: 'authorization.permission.denied',
      outcome: 'DENIED',
      metadata: {
        requiredPermissions: 'authorization.roles.read,authorization.roles.update',
      },
      request: {
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
        requestId: 'request-guard-1',
      },
    });
  });

  it('does not allow a request when durable denial evidence cannot be written', async () => {
    const persistenceFailure = new Error('audit unavailable');
    getAllAndOverride.mockReturnValue([PERMISSIONS.rolesDelete]);
    hasAllPermissions.mockResolvedValue(false);
    appendTenantUser.mockRejectedValue(persistenceFailure);

    await expect(guard.canActivate(contextFor(identity))).rejects.toBe(persistenceFailure);
  });

  function contextFor(user: AuthenticatedIdentity | undefined): ExecutionContext {
    const request = {
      user,
      ip: '127.0.0.1',
      get: (name: string) => {
        if (name === 'user-agent') return 'Jest';
        if (name === 'x-request-id') return 'request-guard-1';
        return undefined;
      },
    };
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }
});

describe('RequirePermissions', () => {
  it('rejects empty and unknown policies when metadata is declared', () => {
    expect(() => RequirePermissions()).toThrow('empty or unknown permission');
    expect(() => RequirePermissions('unreviewed.permission' as unknown as PermissionKey)).toThrow(
      'empty or unknown permission',
    );
  });
});
