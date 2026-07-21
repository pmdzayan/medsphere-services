import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  REQUIRE_PERMISSIONS_KEY,
  PermissionRequirement,
} from '../decorators/require-permissions.decorator';
import { RbacService } from '../../rbac/rbac.service';

/**
 * Tenant-scoped RBAC guard that enforces:
 *
 * 1. **Deny-by-default**: If `@RequirePermissions` is defined on an endpoint and
 *    the user lacks matching explicit permissions, reject with 403.
 * 2. **Cross-tenant isolation**: Ensures the user has a valid `TenantMembership`
 *    for the target `tenantId` (extracted from `x-tenant-id` header).
 * 3. **Wildcard resolution**: Supports `*` as a wildcard for resource and action.
 *
 * Must run after `JwtAuthGuard` which populates `request.user`.
 */
@Injectable()
export class TenantRbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string; sub?: string };
      headers?: Record<string, string>;
    }>();

    const identity = request.user;
    const userId = identity?.userId ?? identity?.sub;
    if (!userId) {
      throw new ForbiddenException('Access denied: authentication required');
    }

    // Extract tenantId from x-tenant-id header or from the user context
    const tenantId =
      (request.headers?.['x-tenant-id'] as string | undefined) ??
      '00000000-0000-0000-0000-000000000000';

    // Verify cross-tenant membership
    const membership = await this.rbacService.findTenantMembership(tenantId, userId);
    if (!membership) {
      throw new ForbiddenException('Access denied: no valid tenant membership');
    }

    // Get user permissions scoped to this tenant membership
    const userPermissions = await this.rbacService.getUserPermissionsByMembership(membership.id);

    // Check each required permission with wildcard support
    const hasAllPermissions = requiredPermissions.every((required) =>
      this.matchesPermission(required, userPermissions),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  /**
   * Checks if a required permission is satisfied by the user's permissions,
   * supporting wildcard resolution.
   *
   * Wildcard rules:
   * - `{ resource: 'inventory', action: '*' }` matches any action for `inventory`
   * - `{ resource: '*', action: '*' }` matches everything (super admin)
   * - A user permission `inventory:*` matches any action on `inventory`
   * - A user permission `*:*` matches everything
   */
  private matchesPermission(required: PermissionRequirement, userPermissions: string[]): boolean {
    // Check for super admin wildcard first
    if (userPermissions.includes('*:*')) {
      return true;
    }

    // Build the exact permission string for the requirement
    const requiredStr = `${required.resource}:${required.action}`;

    // Check exact match
    if (userPermissions.includes(requiredStr)) {
      return true;
    }

    // Check wildcard on the required side
    if (required.resource === '*' && required.action === '*') {
      // Super admin - already handled above, but keep as safety net
      return false;
    }

    // Check if user has wildcard for the required resource
    if (userPermissions.includes(`${required.resource}:*`)) {
      return true;
    }

    // Check if user has wildcard for the required action across all resources
    if (required.action !== '*' && userPermissions.includes(`*:${required.action}`)) {
      return true;
    }

    return false;
  }
}
