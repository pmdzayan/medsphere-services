import { SetMetadata } from '@nestjs/common';
import { isPermissionKey, PermissionKey } from './permission.constants';

export const REQUIRED_PERMISSIONS_KEY = 'medsphere.required-permissions';

export function RequirePermissions(...permissions: readonly PermissionKey[]) {
  if (permissions.length === 0 || permissions.some((permission) => !isPermissionKey(permission))) {
    throw new Error('RequirePermissions received an empty or unknown permission');
  }
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, [...permissions]);
}
