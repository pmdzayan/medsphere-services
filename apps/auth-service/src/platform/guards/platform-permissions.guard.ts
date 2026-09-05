import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformAuthenticatedIdentity } from '../platform.types';
import { extractRequestMetadata, MetadataHttpRequest } from '../../auth/request-metadata';
import { AuditWriter } from '../../audit/audit-writer.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformRepository } from '../platform.repository';
import { PlatformPermissionKey } from '../platform.constants';
import { REQUIRED_PLATFORM_PERMISSIONS_KEY } from '../decorators/require-platform-permissions.decorator';

interface PlatformAuthenticatedRequest extends MetadataHttpRequest {
  readonly user?: PlatformAuthenticatedIdentity;
}

/**
 * Fail-closed platform-authorization boundary. Requires EXACTLY the same
 * `request.user` shape the platform access-token strategy produces, then
 * re-reads the platform account's effective permissions live from the
 * database -- permission revocation becomes effective immediately through
 * this live lookup. Tenant PermissionsGuard is never reached because the
 * platform controller carries only this guard.
 */
@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repository: PlatformRepository,
    private readonly auditWriter: AuditWriter,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<readonly PlatformPermissionKey[]>(
      REQUIRED_PLATFORM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      throw new ForbiddenException('Platform authorization policy is missing');
    }

    const request = context.switchToHttp().getRequest<PlatformAuthenticatedRequest>();
    const identity = request.user;
    if (!identity) {
      throw new ForbiddenException('Access denied');
    }

    const effective = new Set<string>(
      await this.repository.findEffectivePlatformPermissions(identity.platformAccountId),
    );
    if (required.every((permission) => effective.has(permission))) {
      return true;
    }

    await this.auditWriter.appendPlatformUser(this.prisma.client, {
      platformActorUserId: identity.userId,
      eventType: 'authorization.permission.denied',
      outcome: 'DENIED',
      metadata: { requiredPermissions: [...required].sort().join(',') },
      request: extractRequestMetadata(request),
    });
    throw new ForbiddenException('Insufficient permissions');
  }
}
