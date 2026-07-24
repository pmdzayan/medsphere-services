import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedIdentity } from '../auth/auth.types';
import { extractRequestMetadata, MetadataHttpRequest } from '../auth/request-metadata';
import { AuditWriter } from '../audit/audit-writer.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from './authorization.service';
import { PermissionKey } from './permission.constants';
import { REQUIRED_PERMISSIONS_KEY } from './require-permissions.decorator';

interface AuthenticatedRequest extends MetadataHttpRequest {
  readonly user?: AuthenticatedIdentity;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly auditWriter: AuditWriter,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<readonly PermissionKey[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      throw new ForbiddenException('Authorization policy is missing');
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = request.user;
    if (!identity) {
      throw new ForbiddenException('Access denied');
    }

    if (await this.authorizationService.hasAllPermissions(identity, required)) {
      return true;
    }

    await this.auditWriter.appendTenantUser(this.prisma.client, {
      tenantId: identity.tenantId,
      actorMembershipId: identity.membershipId,
      eventType: 'authorization.permission.denied',
      outcome: 'DENIED',
      metadata: { requiredPermissions: [...required].sort().join(',') },
      request: extractRequestMetadata(request),
    });
    throw new ForbiddenException('Insufficient permissions');
  }
}
