import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { RbacService } from '../../rbac/rbac.service';

/**
 * Authorization guard that verifies the authenticated request identity has all
 * required permissions.
 *
 * Permission lookup uses the trusted userId from the S0.3
 * AuthenticatedIdentity — never a client-supplied identifier.
 *
 * The JwtAuthGuard must run first (it populates `request.user`).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user: { userId?: string; sub?: string } }>();
    const identity = request.user;

    // Use userId from S0.3 AuthenticatedIdentity, fall back to sub for legacy compatibility
    const userId = identity?.userId ?? identity?.sub;

    if (!userId) {
      throw new ForbiddenException('Access denied');
    }

    const userPermissions = await this.rbacService.getUserPermissions(userId);

    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
