import { SetMetadata } from '@nestjs/common';

export interface PermissionRequirement {
  resource: string;
  action: string;
}

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';

/**
 * Decorator that specifies the permissions required to access a route handler.
 *
 * Supports wildcard resolution:
 * - `{ resource: 'inventory', action: '*' }` matches any action on the `inventory` resource
 * - `{ resource: '*', action: '*' }` matches full admin rights
 *
 * Usage:
 * ```typescript
 * @RequirePermissions({ resource: 'inventory', action: 'read' })
 * @RequirePermissions({ resource: 'inventory', action: '*' })
 * @RequirePermissions({ resource: '*', action: '*' })
 * ```
 */
export const RequirePermissions = (...permissions: PermissionRequirement[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
