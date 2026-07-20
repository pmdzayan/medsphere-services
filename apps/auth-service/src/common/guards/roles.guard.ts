import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RbacService } from '../../rbac/rbac.service';

/**
 * Authorization guard that verifies the authenticated user has at least one of
 * the required role names.
 *
 * Role lookup uses the trusted userId from the S0.3 AuthenticatedIdentity.
 * The JwtAuthGuard must run first.
 *
 * When no roles are specified via @Roles(), the guard passes (allows any
 * authenticated user).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user: { userId?: string; sub?: string } }>();
    const identity = request.user;

    const userId = identity?.userId ?? identity?.sub;

    if (!userId) {
      throw new ForbiddenException('Access denied');
    }

    const userRoles = await this.rbacService.getUserRoles(userId);
    const userRoleNames = userRoles.map((ur) => ur.role.name);

    const hasRole = requiredRoles.some((role) => userRoleNames.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
